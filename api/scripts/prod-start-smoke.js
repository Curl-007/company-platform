#!/usr/bin/env node
/**
 * Disposable single-process production smoke:
 * build already present (or uses existing web/dist), boots start-prod-style env,
 * asserts /api/health readiness + index.html shell, then graceful HTTP shutdown.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const webDist = path.join(repoRoot, "web", "dist");

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

async function waitForHealth(port, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const json = await response.json().catch(() => null);
      if (response.ok && json?.data?.status === "ok" && json?.data?.checks?.database?.ok) {
        return json;
      }
      last = `status ${response.status} body=${JSON.stringify(json?.data || json)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`readiness timeout: ${last}`);
}

async function runSmoke() {
  if (!fs.existsSync(path.join(webDist, "index.html"))) {
    return {
      ok: false,
      error: `web/dist missing; run npm run build -w web first (${webDist})`,
    };
  }

  const port = await getFreePort();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-prod-smoke-"));
  const databaseFile = path.join(workDir, "prod.db");
  const shutdownToken = "prod-smoke-shutdown-token";

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATABASE_FILE: databaseFile,
    JWT_SECRET: process.env.JWT_SECRET || "prod-smoke-jwt-secret-16",
    AI_CONFIG_ENCRYPTION_KEY: process.env.AI_CONFIG_ENCRYPTION_KEY || "prod-smoke-ai-key-16",
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA || "1",
    AI_ENABLED: "false",
    SERVE_WEB: "1",
    WEB_DIST: webDist,
    // HTTP shutdown is blocked in production env preflight — use SIGTERM when possible.
    // On Windows, child.kill('SIGTERM') may not run handlers; we still assert health+static first.
    RATE_LIMIT_TRUST_LOCAL: "0",
  };

  // Bootstrap schema into the temp DB before production process (same as drills).
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "bootstrap-temp-db.js")], {
      cwd: repoRoot,
      env: { ...env, NODE_ENV: "development", SEED_DEMO_DATA: "1" },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`bootstrap exit ${code}`))));
  });

  const api = spawn(process.execPath, [path.join(apiRoot, "server.js")], {
    cwd: apiRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let log = "";
  const append = (chunk) => {
    log += String(chunk);
  };
  api.stdout.on("data", append);
  api.stderr.on("data", append);

  try {
    const health = await waitForHealth(port);
    const indexResponse = await fetch(`http://127.0.0.1:${port}/`);
    const indexText = await indexResponse.text();
    const indexOk = indexResponse.ok && /<!doctype html>/i.test(indexText);
    const csp = String(indexResponse.headers.get("content-security-policy") || "");
    const hsts = indexResponse.headers.get("strict-transport-security");
    // Plain-HTTP SPA: must not upgrade scripts to HTTPS (causes intermittent blank pages).
    const cspOk = !/upgrade-insecure-requests/i.test(csp) && /script-src[^;]*'self'/i.test(csp);
    const hstsOk = hsts == null;

    // Prefer SIGTERM; if process does not exit on Windows quickly, SIGKILL after assert.
    const exitPromise = new Promise((resolve) => {
      api.once("exit", (code, signal) => resolve({ code, signal }));
    });
    try {
      api.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    const exited = await Promise.race([
      exitPromise.then((value) => ({ ...value, timedOut: false })),
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 8_000)),
    ]);
    if (exited.timedOut) {
      api.kill("SIGKILL");
      await exitPromise.catch(() => undefined);
    }

    const report = {
      ok: Boolean(health && indexOk && cspOk && hstsOk),
      port,
      health: health?.data || health,
      indexOk,
      indexStatus: indexResponse.status,
      cspOk,
      hstsOk,
      csp,
      hsts,
      exit: exited,
      serveWebLog: /serving static SPA/i.test(log),
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
      report.logTail = log.slice(-2000);
    }
    return report;
  } catch (error) {
    try {
      api.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: error && error.message ? error.message : String(error),
      logTail: log.slice(-2000),
      workDir,
    };
  }
}

if (require.main === module) {
  runSmoke()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      else console.log(`Production start smoke PASS (port ${report.port})`);
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = { runSmoke };
