/**
 * Process readiness: database ping + (sqlite) migration ledger.
 * Kept cheap for /api/health — no full integrity_check on every probe.
 */

const path = require("node:path");
const { preflightMigrationStatus } = require("./migrationStatus");

/**
 * @param {object} options
 * @param {(sql: string, params?: object) => Promise<any>|any} options.row
 * @param {string} [options.dialect]
 * @param {import("node:sqlite").DatabaseSync|null} [options.sqliteConnection]
 * @param {string} [options.migrationsDir]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: 'ok'|'degraded'|'fail',
 *   checks: {
 *     database: { ok: boolean, detail?: string },
 *     migrations: { ok: boolean, detail?: string, missingApplied?: string[], appliedCount?: number, diskCount?: number }
 *   }
 * }>}
 */
async function checkReadiness({
  row,
  dialect = "sqlite",
  sqliteConnection = null,
  migrationsDir = null,
} = {}) {
  const checks = {
    database: { ok: false },
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
      checks.migrations = {
        ok: false,
        detail: "sqlite_connection_or_migrations_dir_missing",
      };
    } else {
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
  }

  const ok = checks.database.ok && checks.migrations.ok;
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
