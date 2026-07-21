/**
 * Wave 7: dialect switch / rollback drill (non-destructive).
 *
 * Spawns short-lived API processes against:
 *   1) SQLite (DATABASE_FILE, default app.db)
 *   2) PostgreSQL (DATABASE_URL / POSTGRES_TARGET_URL)
 * and verifies login + a small read surface, then "rolls back" by proving
 * SQLite still serves the same baseline without needing the PG process.
 *
 * Usage:
 *   node scripts/postgres-switch-rollback-drill.js
 *   # or
 *   npm run drill:postgres-switch -w api
 *
 * Required env for PG leg:
 *   POSTGRES_TARGET_URL or DATABASE_URL  (must already have schema + data)
 * Optional:
 *   DATABASE_FILE, DRILL_SQLITE_PORT (default 4021), DRILL_PG_PORT (default 4022)
 *   DRILL_ADMIN_EMAIL, DRILL_ADMIN_PASSWORD
 */
const { spawn } = require("child_process");
const path = require("path");
const { resolveDatabaseUrl } = require("../src/db/postgres");

const API_ROOT = path.resolve(__dirname, "..");
const SERVER_JS = path.join(API_ROOT, "server.js");

const SQLITE_PORT = Number(process.env.DRILL_SQLITE_PORT || 4021);
const PG_PORT = Number(process.env.DRILL_PG_PORT || 4022);
const EMAIL = process.env.DRILL_ADMIN_EMAIL || "admin@example.com";
const PASSWORD = process.env.DRILL_ADMIN_PASSWORD || "Admin@123";
const SQLITE_FILE = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : path.join(API_ROOT, "app.db");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(base, method, route, { token, body } = {}) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function startServer({ env, port }) {
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      JWT_SECRET: process.env.JWT_SECRET || "w7-drill-jwt-secret-16",
      AI_CONFIG_ENCRYPTION_KEY: process.env.AI_CONFIG_ENCRYPTION_KEY || "w7-drill-ai-key-16ch",
      AI_ENABLED: process.env.AI_ENABLED || "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });
  return {
    child,
    getLog: () => log,
    async stop() {
      if (child.exitCode != null) return;
      child.kill("SIGTERM");
      await sleep(500);
      if (child.exitCode == null) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    },
  };
}

async function waitForListen(base, timeoutMs = 15000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const { status } = await request(base, "GET", "/api/auth/me");
      // 401 means server is up and auth middleware works.
      if (status === 401 || status === 200) return;
      lastError = new Error(`unexpected status ${status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`API did not become ready at ${base}: ${lastError && lastError.message}`);
}

async function probeDialect(label, base) {
  const unauth = await request(base, "GET", "/api/auth/me");
  if (unauth.status !== 401) {
    throw new Error(`${label}: expected unauthenticated /api/auth/me → 401, got ${unauth.status}`);
  }

  const login = await request(base, "POST", "/api/auth/login", {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.json?.data?.token;
  if (login.status !== 200 || !token) {
    throw new Error(
      `${label}: login failed status=${login.status} code=${login.json?.errorCode || "?"} message=${login.json?.message || ""}`,
    );
  }

  const me = await request(base, "GET", "/api/auth/me", { token });
  if (me.status !== 200 || !me.json?.data?.email) {
    throw new Error(`${label}: /api/auth/me failed status=${me.status}`);
  }

  const projects = await request(base, "GET", "/api/projects", { token });
  if (projects.status !== 200 || !Array.isArray(projects.json?.data)) {
    throw new Error(`${label}: /api/projects failed status=${projects.status}`);
  }

  return {
    label,
    email: me.json.data.email,
    role: me.json.data.role,
    projectCount: projects.json.data.length,
  };
}

async function main() {
  const pgUrl = resolveDatabaseUrl(process.env);
  if (!pgUrl) {
    throw new Error(
      "POSTGRES_TARGET_URL or DATABASE_URL is required for the PostgreSQL leg of the drill.",
    );
  }

  const results = [];
  const sqliteBase = `http://127.0.0.1:${SQLITE_PORT}`;
  const pgBase = `http://127.0.0.1:${PG_PORT}`;

  console.log("W7 drill: SQLite → PostgreSQL → rollback-to-SQLite (read smoke)");
  console.log(`  sqlite file: ${SQLITE_FILE}`);
  console.log(`  postgres url: ${pgUrl.replace(/:\/\/([^:/@]+):([^@]+)@/, "://***:***@")}`);

  const sqliteProc = startServer({
    port: SQLITE_PORT,
    env: {
      DATABASE_DIALECT: "sqlite",
      DATABASE_FILE: SQLITE_FILE,
      // Ensure postgres env does not leak into sqlite process selection.
      DATABASE_URL: "",
      POSTGRES_TARGET_URL: "",
    },
  });

  let pgProc = null;
  try {
    await waitForListen(sqliteBase);
    const sqliteBefore = await probeDialect("sqlite-before", sqliteBase);
    results.push(sqliteBefore);
    console.log(
      `PASS sqlite-before login=${sqliteBefore.email} projects=${sqliteBefore.projectCount}`,
    );
    await sqliteProc.stop();

    pgProc = startServer({
      port: PG_PORT,
      env: {
        DATABASE_DIALECT: "postgres",
        DATABASE_URL: pgUrl,
        POSTGRES_TARGET_URL: pgUrl,
      },
    });
    await waitForListen(pgBase);
    const pgProbe = await probeDialect("postgres", pgBase);
    results.push(pgProbe);
    console.log(`PASS postgres login=${pgProbe.email} projects=${pgProbe.projectCount}`);
    await pgProc.stop();
    pgProc = null;

    // Rollback leg: start SQLite again without postgres dialect.
    const sqliteAfterProc = startServer({
      port: SQLITE_PORT,
      env: {
        DATABASE_DIALECT: "sqlite",
        DATABASE_FILE: SQLITE_FILE,
        DATABASE_URL: "",
        POSTGRES_TARGET_URL: "",
      },
    });
    try {
      await waitForListen(sqliteBase);
      const sqliteAfter = await probeDialect("sqlite-after-rollback", sqliteBase);
      results.push(sqliteAfter);
      console.log(
        `PASS sqlite-after-rollback login=${sqliteAfter.email} projects=${sqliteAfter.projectCount}`,
      );

      if (sqliteBefore.projectCount !== sqliteAfter.projectCount) {
        throw new Error(
          `rollback projectCount mismatch before=${sqliteBefore.projectCount} after=${sqliteAfter.projectCount}`,
        );
      }
      if (sqliteBefore.email !== sqliteAfter.email) {
        throw new Error("rollback admin email mismatch");
      }
    } finally {
      await sqliteAfterProc.stop();
    }

    console.log("\n========== W7 DRILL SUMMARY ==========");
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    console.log(
      "Rollback criterion met: SQLite still serves login + projects after PG leg stopped (frozen source not required for this read-only drill).",
    );
  } catch (error) {
    console.error(`W7 drill failed: ${error.message}`);
    if (sqliteProc) console.error("--- sqlite log ---\n" + sqliteProc.getLog().slice(-1500));
    if (pgProc) console.error("--- postgres log ---\n" + pgProc.getLog().slice(-1500));
    process.exitCode = 1;
  } finally {
    if (sqliteProc) await sqliteProc.stop();
    if (pgProc) await pgProc.stop();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, probeDialect, waitForListen };
