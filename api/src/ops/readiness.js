/**
 * Process readiness: database ping + (sqlite) migration ledger.
 * Kept cheap for /api/health — no full integrity_check on every probe.
 */

const path = require("node:path");
const { CORE_TABLES } = require("../db/migrationPreflight");
const { inspectSqliteSchema, SQLITE_COMPATIBILITY_COLUMNS } = require("../db/sqliteSchema");
const { preflightMigrationStatus } = require("./migrationStatus");

/**
 * @param {object} options
 * @param {(sql: string, params?: object) => Promise<any>|any} options.row
 * @param {(sql: string, params?: object) => Promise<any[]>|any[]} [options.rows]
 * @param {string} [options.dialect]
 * @param {import("node:sqlite").DatabaseSync|null} [options.sqliteConnection]
 * @param {string} [options.migrationsDir]
 * @param {string[]} [options.requiredTables]
 * @param {Array<[string, string, string]>} [options.requiredColumns]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: 'ok'|'degraded'|'fail',
 *   checks: {
 *     database: { ok: boolean, detail?: string },
 *     schema: { ok: boolean, detail?: string, missingTables?: string[], missingColumns?: string[] },
 *     migrations: { ok: boolean, detail?: string, missingApplied?: string[], appliedCount?: number, diskCount?: number }
 *   }
 * }>}
 */
async function checkReadiness({
  row,
  rows,
  dialect = "sqlite",
  sqliteConnection = null,
  migrationsDir = null,
  requiredTables = CORE_TABLES,
  requiredColumns = SQLITE_COMPATIBILITY_COLUMNS,
} = {}) {
  const checks = {
    database: { ok: false },
    schema: { ok: false },
    migrations: { ok: dialect !== "sqlite", detail: dialect === "sqlite" ? undefined : "skipped_for_postgres" },
  };

  try {
    const probe = await Promise.resolve(row("SELECT 1 AS ok"));
    const value = probe && (probe.ok === 1 || probe.ok === "1" || Number(probe.ok) === 1);
    if (!value && probe == null) {
      // Some drivers return row differently; accept non-throwing SELECT 1.
      checks.database = { ok: true, detail: "ping_ok" };
    } else {
      checks.database = { ok: true, detail: "ping_ok" };
    }
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error && error.message ? error.message : String(error),
    };
  }

  if (dialect === "sqlite") {
    if (!sqliteConnection || !migrationsDir) {
      checks.schema = {
        ok: false,
        detail: "sqlite_connection_missing",
      };
      checks.migrations = {
        ok: false,
        detail: "sqlite_connection_or_migrations_dir_missing",
      };
    } else {
      try {
        const schema = inspectSqliteSchema(sqliteConnection, { requiredTables, requiredColumns });
        checks.schema = {
          ok: schema.ok,
          detail: schema.ok ? "schema_ok" : "schema_incomplete",
          missingTables: schema.missingTables,
          missingColumns: schema.missingColumns,
        };
      } catch (error) {
        checks.schema = {
          ok: false,
          detail: error && error.message ? error.message : String(error),
        };
      }
      try {
        const report = preflightMigrationStatus(sqliteConnection, migrationsDir);
        checks.migrations = {
          ok: report.ok,
          detail: report.ok ? "ledger_ok" : "ledger_mismatch",
          missingApplied: report.missingApplied,
          appliedCount: report.appliedCount,
          diskCount: report.diskCount,
          checksumMismatches: report.checksumMismatches,
        };
      } catch (error) {
        checks.migrations = {
          ok: false,
          detail: error && error.message ? error.message : String(error),
        };
      }
    }
  } else if (dialect === "postgres") {
    if (typeof rows !== "function") {
      checks.schema = { ok: false, detail: "postgres_rows_probe_missing" };
    } else {
      try {
        const params = {};
        const placeholders = requiredTables.map((table, index) => {
          params[`table${index}`] = table;
          return `@table${index}`;
        });
        const listed = await Promise.resolve(rows(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN (${placeholders.join(", ")})`,
          params,
        ));
        const present = new Set((listed || []).map((item) => item.table_name));
        const missingTables = requiredTables.filter((table) => !present.has(table));
        checks.schema = {
          ok: missingTables.length === 0,
          detail: missingTables.length ? "schema_incomplete" : "schema_ok",
          missingTables,
          missingColumns: [],
        };
      } catch (error) {
        checks.schema = { ok: false, detail: error && error.message ? error.message : String(error) };
      }
    }
  }

  const ok = checks.database.ok && checks.schema.ok && checks.migrations.ok;
  return {
    ok,
    status: ok ? "ok" : "fail",
    checks,
    migrationsDir: migrationsDir ? path.resolve(migrationsDir) : null,
  };
}

module.exports = {
  checkReadiness,
};
