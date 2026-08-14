/**
 * Real PostgreSQL contract coverage.
 *
 * This file is intentionally opt-in. Running the normal API suite must not
 * require PostgreSQL or make a local DATABASE_URL writable by tests.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const test = require("node:test");
const { createPostgresAccess } = require("../src/db/access");
const {
  createPgPool,
  createPostgresRuntime,
  maskDatabaseUrl,
  resolveDatabaseUrl,
} = require("../src/db/postgres");
const {
  BASELINE_MIGRATION_ID,
  applyPostgresSchema,
  listMigrationFiles,
} = require("../scripts/apply-postgres-schema");

function integrationSkipReason(env = process.env) {
  const requested = /^(1|true)$/i.test(String(env.RUN_PG_INTEGRATION || "").trim());
  if (!requested) return "set RUN_PG_INTEGRATION=1 to enable real PostgreSQL tests";
  if (!resolveDatabaseUrl(env)) return "set POSTGRES_TARGET_URL or DATABASE_URL for real PostgreSQL tests";
  return false;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function isolatedSchemaName() {
  return `pm_test_${crypto.randomBytes(8).toString("hex")}`;
}

const connectionString = resolveDatabaseUrl(process.env);
const skipReason = integrationSkipReason();

test("real PostgreSQL integration is explicitly gated", () => {
  assert.ok(integrationSkipReason({}));
  assert.ok(integrationSkipReason({ DATABASE_URL: "postgres://localhost/test" }));
  assert.equal(
    integrationSkipReason({
      RUN_PG_INTEGRATION: "1",
      POSTGRES_TARGET_URL: "postgres://localhost/test",
    }),
    false,
  );
});

test(
  "real PostgreSQL applies schema and preserves app_settings transaction semantics",
  { skip: skipReason },
  async () => {
    const schemaName = isolatedSchemaName();
    const quotedSchema = quoteIdentifier(schemaName);
    const poolHandle = createPgPool({ connectionString });
    let runtime;
    let schemaCreated = false;

    try {
      try {
        await poolHandle.ping();
      } catch {
        throw new Error("Configured PostgreSQL integration target is not reachable.");
      }

      await poolHandle.query(`CREATE SCHEMA ${quotedSchema}`);
      schemaCreated = true;

      const setupClient = await poolHandle.connect();
      try {
        await setupClient.query(`SET search_path TO ${quotedSchema}, public`);
        const applied = await applyPostgresSchema({
          connectionString,
          client: setupClient,
          recordBaselineMarker: true,
        });
        assert.equal(applied.ok, true);
        assert.ok(applied.statementCount > 0);
        assert.equal(applied.connectionStringMasked, maskDatabaseUrl(connectionString));

        const requiredTables = ["schema_migrations", "app_settings", "users", "projects"];
        const tables = await setupClient.query(
          `SELECT table_name
             FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name = ANY($2::text[])`,
          [schemaName, requiredTables],
        );
        assert.deepEqual(
          tables.rows.map((row) => row.table_name).sort(),
          requiredTables.slice().sort(),
        );

        const migrations = await setupClient.query(
          "SELECT id FROM schema_migrations ORDER BY id",
        );
        assert.equal(
          migrations.rowCount,
          listMigrationFiles(path.resolve(__dirname, "..", "migrations")).length + 1,
        );
        assert.ok(migrations.rows.some((row) => row.id === BASELINE_MIGRATION_ID));
      } finally {
        setupClient.release();
      }

      runtime = createPostgresRuntime({
        connectionString,
        env: {
          PG_POOL_MAX: "2",
          PG_CONNECTION_TIMEOUT_MS: "5000",
        },
      });
      assert.equal(runtime.dialect, "postgres");
      assert.equal(await runtime.ping(), true);
      assert.equal(runtime.connectionStringMasked, maskDatabaseUrl(connectionString));

      const access = createPostgresAccess(runtime);
      const committedKey = "postgres.real.committed";
      const rolledBackKey = "postgres.real.rolled-back";
      const nestedKey = "postgres.real.nested";
      const updatedAt = "2026-08-14T00:00:00.000Z";

      await access.transaction(async () => {
        await access.run(`SET LOCAL search_path TO ${quotedSchema}, public`);
        await access.upsert("app_settings", {
          key: committedKey,
          value: "first",
          updated_at: updatedAt,
        });
        await access.upsert("app_settings", {
          key: committedKey,
          value: "committed",
          updated_at: updatedAt,
        });
        const row = await access.row(
          "SELECT value FROM app_settings WHERE key = @key",
          { key: committedKey },
        );
        assert.equal(row?.value, "committed");
      });

      const reader = await runtime.connect();
      try {
        await reader.query(`SET search_path TO ${quotedSchema}, public`);
        const committed = await reader.query(
          "SELECT value FROM app_settings WHERE key = $1",
          [committedKey],
        );
        assert.equal(committed.rows[0]?.value, "committed");

        await assert.rejects(
          () =>
            access.transaction(async () => {
              await access.run(`SET LOCAL search_path TO ${quotedSchema}, public`);
              await access.upsert("app_settings", {
                key: rolledBackKey,
                value: "discarded",
                updated_at: updatedAt,
              });
              throw new Error("rollback sentinel");
            }),
          /rollback sentinel/,
        );

        const rolledBack = await reader.query(
          "SELECT value FROM app_settings WHERE key = $1",
          [rolledBackKey],
        );
        assert.equal(rolledBack.rowCount, 0);

        await assert.rejects(
          () =>
            access.transaction(async () => {
              await access.run(`SET LOCAL search_path TO ${quotedSchema}, public`);
              await access.upsert("app_settings", {
                key: nestedKey,
                value: "outer",
                updated_at: updatedAt,
              });
              try {
                await access.transaction(async () => {
                  throw new Error("nested rollback sentinel");
                });
              } catch {
                // The outer transaction remains rollback-only after this catch.
              }
            }),
          /nested rollback sentinel/,
        );

        const nested = await reader.query(
          "SELECT value FROM app_settings WHERE key = $1",
          [nestedKey],
        );
        assert.equal(nested.rowCount, 0);
      } finally {
        reader.release();
      }
    } finally {
      if (runtime) await runtime.close();
      if (schemaCreated) await poolHandle.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      await poolHandle.close();
    }
  },
);
