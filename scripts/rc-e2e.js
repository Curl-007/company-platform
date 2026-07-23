#!/usr/bin/env node
/**
 * RC isolated browser E2E:
 * - temporary SQLite database
 * - temporary API on a free port (default 4010)
 * - Playwright smoke + multi-role nav flow
 *
 * Usage (repo root):
 *   node scripts/rc-e2e.js
 *   node scripts/rc-e2e.js --with-api-roles
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(repoRoot, "api");
const webRoot = path.join(repoRoot, "web");

function parseArgs(argv) {
  const portArg = argv.find((arg, index) => argv[index - 1] === "--port");
  // Default 4010 so Vite's proxy (web/vite.config.ts) reaches the disposable API.
  // API multi-role smoke (handoff/membership) is on by default for RC; pass
  // --skip-api-roles to opt out of the longer API path. --with-api-roles is
  // retained as an explicit alias for documentation/CI callers.
  return {
    withApiRoles: !argv.includes("--skip-api-roles"),
    withFullUi: !argv.includes("--skip-full-ui"),
    port: Number(portArg || process.env.PORT || 4010),
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become healthy on :${port}: ${lastError}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Prefer shell:false so paths with spaces (e.g. Program Files\nodejs) stay intact.
    // Windows npm/npx wrappers still need shell.
    const needsShell = process.platform === "win32" && !command.endsWith("node.exe") && command !== process.execPath;
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: needsShell,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} exited by signal ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const port = Number.isFinite(options.port) && options.port > 0 ? options.port : await getFreePort();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-rc-e2e-"));
  const databaseFile = path.join(workDir, "e2e.db");
  const apiLog = path.join(workDir, "api.log");

  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_FILE: databaseFile,
    JWT_SECRET: process.env.JWT_SECRET || "rc-e2e-jwt-secret-16",
    AI_CONFIG_ENCRYPTION_KEY: process.env.AI_CONFIG_ENCRYPTION_KEY || "rc-e2e-ai-key-16ch",
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA || "0",
    AI_ENABLED: process.env.AI_ENABLED || "false",
    RATE_LIMIT_TRUST_LOCAL: "0",
  };

  console.log(`[rc-e2e] workDir=${workDir}`);
  console.log(`[rc-e2e] database=${databaseFile}`);
  console.log(`[rc-e2e] port=${port}`);

  // Bootstrap schema + seed accounts into the disposable DB.
  await runCommand(process.execPath, [path.join(repoRoot, "scripts", "bootstrap-temp-db.js")], {
    cwd: repoRoot,
    env,
    shell: false,
  });

  const logStream = fs.createWriteStream(apiLog, { flags: "a" });
  const api = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.pipe(logStream);
  api.stderr.pipe(logStream);

  let failed = null;
  try {
    await waitForHealth(port);
    console.log("[rc-e2e] API healthy");

    // Do NOT set PLAYWRIGHT_BASE_URL unless the caller already hosts the web app.
    // Leaving it unset lets playwright.config.ts start Vite, which proxies /api → :4010.
    const browserEnv = {
      ...env,
      CI: process.env.CI || "true",
    };
    if (process.env.PLAYWRIGHT_BASE_URL) {
      browserEnv.PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
    }

    const e2eSpecs = [
      "e2e/smoke.spec.ts",
      "e2e/roles-flow.spec.ts",
      "e2e/rc-security-flow.spec.ts",
    ];
    if (options.withFullUi) {
      e2eSpecs.push("e2e/full-ui-flow.spec.ts");
    }
    console.log(`[rc-e2e] Playwright specs: ${e2eSpecs.join(", ")}`);

    const playwrightCli = path.join(webRoot, "node_modules", "playwright", "cli.js");
    const playwrightArgs = fs.existsSync(playwrightCli)
      ? [playwrightCli, "test", ...e2eSpecs, "--project=chromium"]
      : null;
    if (playwrightArgs) {
      await runCommand(process.execPath, playwrightArgs, {
        cwd: webRoot,
        env: browserEnv,
        shell: false,
      });
    } else {
      await runCommand("npx", ["playwright", "test", ...e2eSpecs, "--project=chromium"], {
        cwd: webRoot,
        env: browserEnv,
      });
    }

    if (options.withApiRoles) {
      console.log("[rc-e2e] running API multi-role smoke (membership + handoff)");
      await runCommand(process.execPath, [path.join(apiRoot, "scripts", "full-flow-roles.js")], {
        cwd: apiRoot,
        env: {
          ...env,
          SMOKE_API_BASE: `http://127.0.0.1:${port}`,
        },
        shell: false,
      });
    }
  } catch (error) {
    failed = error;
  } finally {
    if (!api.killed) {
      api.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          api.kill("SIGKILL");
          resolve();
        }, 5_000);
        api.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    logStream.end();
  }

  if (failed) {
    console.error("[rc-e2e] FAILED");
    console.error(failed.message || failed);
    try {
      console.error("--- api log (tail) ---");
      const text = fs.readFileSync(apiLog, "utf8");
      console.error(text.slice(-4000));
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
    return;
  }

  console.log("[rc-e2e] PASS");
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    console.warn(`[rc-e2e] could not remove temp dir ${workDir}`);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
