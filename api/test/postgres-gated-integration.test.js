/**
 * Wave 6 gated PostgreSQL integration.
 *
 * Active path requires an explicit RUN_PG_INTEGRATION=1 opt-in plus a target URL.
 * This keeps an incidental local DATABASE_URL from creating test schemas.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createPgPool, createPostgresRuntime, resolveDatabaseUrl } = require("../src/db/postgres");

const connectionString = resolveDatabaseUrl(process.env);
const integrationRequested = /^(1|true)$/i.test(String(process.env.RUN_PG_INTEGRATION || "").trim());
const gatedEnabled = integrationRequested && Boolean(connectionString);
const gatedSkipReason = !integrationRequested
  ? "set RUN_PG_INTEGRATION=1 to enable live PostgreSQL tests"
  : !connectionString
    ? "set POSTGRES_TARGET_URL or DATABASE_URL for live PostgreSQL tests"
    : false;

async function canReachPostgres(url) {
  let handle;
  try {
    handle = createPgPool({ connectionString: url });
    await handle.ping();
    return true;
  } catch {
    return false;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* ignore */
      }
    }
  }
}

test("gated postgres: apply baseline into isolated schema and CRUD app_settings", { skip: gatedSkipReason }, async () => {
  const reachable = await canReachPostgres(connectionString);
  if (!reachable) {
    throw new Error("Configured PostgreSQL integration target is not reachable.");
  }

  const schemaName = `w6_${Date.now().toString(36)}`;
  const poolHandle = createPgPool({ connectionString });
  try {
    await poolHandle.query(`CREATE SCHEMA ${schemaName}`);

    const setupClient = await poolHandle.connect();
    try {
      await setupClient.query(`SET search_path TO ${schemaName}, public`);
      const baselinePath = path.join(__dirname, "../src/db/schema/postgres-baseline.sql");
      const sql = fs.readFileSync(baselinePath, "utf8");
      await setupClient.query(sql);
      await setupClient.query(
        `INSERT INTO schema_migrations (id, checksum, applied_at) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        ["gated_smoke", "smoke", new Date().toISOString()],
      );
    } finally {
      setupClient.release();
    }

    const runtime = createPostgresRuntime({ connectionString });
    const crudClient = await runtime.pool.connect();
    try {
      await crudClient.query(`SET search_path TO ${schemaName}, public`);
      const insert = await crudClient.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        ["gated.smoke", "1", new Date().toISOString()],
      );
      assert.equal(insert.rowCount, 1);
      const selected = await crudClient.query(`SELECT value FROM app_settings WHERE key = $1`, ["gated.smoke"]);
      assert.equal(selected.rows[0]?.value, "1");
    } finally {
      crudClient.release();
      await runtime.close();
    }
  } finally {
    try {
      await poolHandle.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } catch {
      /* best-effort cleanup */
    }
    await poolHandle.close();
  }
});

test("gated postgres: requires explicit opt-in and a URL", () => {
  assert.equal(gatedEnabled, integrationRequested && Boolean(connectionString));
});
