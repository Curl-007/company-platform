#!/usr/bin/env node
/**
 * Disposable API process graceful-shutdown drill.
 *
 * Boots API against a temporary SQLite DB, waits for /api/health, then
 * triggers the shared shutdown() path:
 *   - default: HTTP POST /api/ops/shutdown (ENABLE_HTTP_SHUTDOWN=1)
 *     Works on Windows where child_process.kill('SIGTERM') does not run handlers.
 *   - --signal SIGTERM|SIGINT: also attempt OS signal after HTTP path is preferred
 *
 * Usage:
 *   node scripts/graceful-shutdown-drill.js
 *   node scripts/graceful-shutdown-drill.js --mode http
 *   node scripts/graceful-shutdown-drill.js --mode signal --signal SIGTERM
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { assertSqliteReopenable } = require("../src/ops/sqliteFsPreflight");
const { preflightMigrationStatus } = require("../src/ops/migrationStatus");
const { preflightDatabase } = require("../src/db/migrationPreflight");
const { DatabaseSync } = require("node:sqlite");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const migrationsDir = path.join(apiRoot, "migrations");

function parseArgs(argv) {
  const signalIndex = argv.indexOf("--signal");
  const modeIndex = argv.indexOf("--mode");
  const signalRaw = signalIndex >= 0 ? String(argv[signalIndex + 1] || "SIGTERM") : "SIGTERM";
  const modeRaw = modeIndex >= 0 ? String(argv[modeIndex + 1] || "http") : "http";
  return {
    // Prefer http: portable across Windows/Linux. signal mode is best-effort on Unix.
    mode: modeRaw === "signal" ? "signal" : "http",
    signal: signalRaw === "SIGINT" ? "SIGINT" : "SIGTERM",
    json: argv.includes("--json"),
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`API did not become healthy on :${port}: ${lastError}`);
}

function runNode(scriptAbs, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptAbs], {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${path.basename(scriptAbs)} exited by signal ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptAbs)} failed with exit ${code}`));
    });
  });
}

async function triggerHttpShutdown(port, token) {
  const response = await fetch(`http://127.0.0.1:${port}/api/ops/shutdown`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shutdown-token": token,
    },
    body: JSON.stringify({ token }),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

async function runDrill(options = {}) {
  const mode = options.mode === "signal" ? "signal" : "http";
  const signal = options.signal === "SIGINT" ? "SIGINT" : "SIGTERM";
  const port = await getFreePort();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-grace-drill-"));
  const databaseFile = path.join(workDir, "grace.db");
  const apiLog = path.join(workDir, "api.log");
  const shutdownToken = "grace-drill-shutdown-token";

  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_FILE: databaseFile,
    JWT_SECRET: process.env.JWT_SECRET || "grace-drill-jwt-16",
    AI_CONFIG_ENCRYPTION_KEY: process.env.AI_CONFIG_ENCRYPTION_KEY || "grace-drill-ai-16ch",
    SEED_DEMO_DATA: "0",
    AI_ENABLED: "false",
    RATE_LIMIT_TRUST_LOCAL: "0",
    // Always enable HTTP path so Windows drills exercise shutdown() handlers.
    ENABLE_HTTP_SHUTDOWN: "1",
    HTTP_SHUTDOWN_TOKEN: shutdownToken,
  };

  await runNode(path.join(repoRoot, "scripts", "bootstrap-temp-db.js"), env, repoRoot);

  const logStream = fs.createWriteStream(apiLog, { flags: "a" });
  const api = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let combined = "";
  const append = (chunk) => {
    const text = String(chunk);
    combined += text;
    logStream.write(text);
  };
  api.stdout.on("data", append);
  api.stderr.on("data", append);

  try {
    await waitForHealth(port);
  } catch (error) {
    api.kill("SIGKILL");
    logStream.end();
    throw error;
  }

  const exitPromise = new Promise((resolve) => {
    api.once("exit", (code, exitSignal) => {
      resolve({ code, exitSignal });
    });
  });

  const signalAt = Date.now();
  let trigger = { mode, status: null };

  if (mode === "signal" && process.platform !== "win32") {
    api.kill(signal);
    trigger = { mode: "signal", signal };
  } else {
    // Default / Windows: call the same shutdown() implementation via HTTP.
    const httpResult = await triggerHttpShutdown(port, shutdownToken);
    trigger = { mode: "http", status: httpResult.status, body: httpResult.json };
    if (httpResult.status !== 202) {
      api.kill("SIGKILL");
      logStream.end();
      return {
        ok: false,
        mode: "http",
        port,
        error: `HTTP shutdown returned status ${httpResult.status}`,
        trigger,
        logTail: combined.slice(-1500),
        workDir,
        cleaned: false,
      };
    }
  }

  const result = await Promise.race([
    exitPromise.then((exit) => ({ ...exit, timedOut: false })),
    new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), 12_000);
    }),
  ]);

  if (result.timedOut) {
    api.kill("SIGKILL");
    await exitPromise.catch(() => undefined);
    logStream.end();
    const report = {
      ok: false,
      mode: trigger.mode,
      signal: trigger.signal || null,
      port,
      error: "Process did not exit within 12s after shutdown trigger",
      trigger,
      logTail: combined.slice(-1500),
      workDir,
      cleaned: false,
    };
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return report;
  }

  const shutdownMs = Date.now() - signalAt;
  const logText = combined;
  const sawGraceful = /shutting down gracefully/i.test(logText);
  const exitedCleanly = result.code === 0 || result.code === null;

  logStream.end();

  // After process exit: DB must reopen, pass integrity_check, accept a write, and keep migrations valid.
  // This proves closeDatabase released locks and did not leave a corrupt/half-written main file.
  let dbPostExit = { ok: false };
  if (exitedCleanly && sawGraceful && fs.existsSync(databaseFile)) {
    try {
      const reopen = assertSqliteReopenable(databaseFile, { DatabaseSync });
      const handle = new DatabaseSync(databaseFile);
      try {
        const migration = preflightMigrationStatus(handle, migrationsDir);
        const data = preflightDatabase(handle);
        dbPostExit = {
          ok: Boolean(reopen.ok && migration.ok && data.ok),
          integrity: reopen.integrity,
          migrationOk: migration.ok,
          missingApplied: migration.missingApplied,
          dataOk: data.ok,
          users: data.counts && data.counts.users,
        };
      } finally {
        handle.close();
      }
    } catch (error) {
      dbPostExit = {
        ok: false,
        error: error && error.message ? error.message : String(error),
      };
    }
  } else if (!fs.existsSync(databaseFile)) {
    dbPostExit = { ok: false, error: "database file missing after shutdown" };
  }

  const report = {
    ok: Boolean(exitedCleanly && sawGraceful && shutdownMs < 12_000 && dbPostExit.ok),
    mode: trigger.mode,
    signal: trigger.signal || null,
    port,
    exitCode: result.code,
    exitSignal: result.exitSignal || null,
    shutdownMs,
    sawGracefulLog: sawGraceful,
    databaseFile,
    dbPostExit,
    trigger,
    workDir,
  };

  if (report.ok) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      report.cleaned = true;
    } catch {
      report.cleaned = false;
    }
  } else {
    report.logTail = logText.slice(-1500);
    report.cleaned = false;
    if (!report.error && !dbPostExit.ok) {
      report.error = dbPostExit.error || "post-exit database verification failed";
    }
  }

  return report;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  runDrill(options)
    .then((report) => {
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(
          report.ok
            ? `Graceful shutdown drill PASS (${report.mode}, ${report.shutdownMs}ms)`
            : `Graceful shutdown drill FAIL (${report.mode || options.mode})`,
        );
        console.log(JSON.stringify(report, null, 2));
      }
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = { runDrill };
