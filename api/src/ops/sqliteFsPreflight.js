/**
 * SQLite filesystem preflight: parent directory exists (or is creatable) and is writable.
 * Safe to call before or after opening the DB handle.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function resolveDatabaseDialect(env = process.env) {
  const value = String(env.DATABASE_DIALECT || env.DB_DIALECT || "sqlite").trim().toLowerCase();
  if (value === "postgres" || value === "postgresql") return "postgres";
  return "sqlite";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ defaultDatabaseFile?: string, fsImpl?: typeof fs, pathImpl?: typeof path }} [options]
 * @returns {string|null} absolute path when sqlite; null when postgres or unresolved
 */
function resolveSqliteDatabaseFile(env = process.env, { defaultDatabaseFile, pathImpl = path } = {}) {
  if (resolveDatabaseDialect(env) === "postgres") return null;
  const configured = String(env.DATABASE_FILE || "").trim();
  if (configured) return pathImpl.resolve(configured);
  if (defaultDatabaseFile) return pathImpl.resolve(defaultDatabaseFile);
  return null;
}

/**
 * Probe that `dir` can accept a create/write/unlink cycle.
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function probeDirectoryWritable(dir, { fsImpl = fs, pathImpl = path } = {}) {
  try {
    fsImpl.mkdirSync(dir, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      code: "DATABASE_DIR_NOT_CREATABLE",
      message: `Cannot create database directory ${dir}: ${error && error.message ? error.message : error}`,
    };
  }

  const probeName = `.pm-write-probe-${process.pid}-${Date.now()}`;
  const probePath = pathImpl.join(dir, probeName);
  try {
    fsImpl.writeFileSync(probePath, "ok", "utf8");
    fsImpl.unlinkSync(probePath);
    return { ok: true };
  } catch (error) {
    try {
      if (fsImpl.existsSync(probePath)) fsImpl.unlinkSync(probePath);
    } catch {
      /* ignore cleanup */
    }
    return {
      ok: false,
      code: "DATABASE_DIR_NOT_WRITABLE",
      message: `Database directory is not writable: ${dir} (${error && error.message ? error.message : error})`,
    };
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ defaultDatabaseFile?: string, fsImpl?: typeof fs, pathImpl?: typeof path, isProd?: boolean }} [options]
 * @returns {{ ok: boolean, databaseFile: string|null, issues: Array<{ level: 'error'|'warn', code: string, message: string }> }}
 */
function preflightSqliteFilesystem(env = process.env, options = {}) {
  const { defaultDatabaseFile, fsImpl = fs, pathImpl = path } = options;
  const isProd =
    typeof options.isProd === "boolean"
      ? options.isProd
      : String(env.NODE_ENV || "development") === "production";
  const issues = [];
  const dialect = resolveDatabaseDialect(env);

  if (dialect === "postgres") {
    return { ok: true, databaseFile: null, issues };
  }

  const databaseFile = resolveSqliteDatabaseFile(env, { defaultDatabaseFile, pathImpl });
  if (!databaseFile) {
    // Soft: CLI without DATABASE_FILE and without default is still ok for secret-only checks.
    if (isProd) {
      issues.push({
        level: "warn",
        code: "DATABASE_FILE_UNRESOLVED",
        message: "SQLite database path was not resolved; set DATABASE_FILE for explicit layout checks.",
      });
    }
    return { ok: true, databaseFile: null, issues };
  }

  // Refuse obviously bad targets (directory path as file, empty basename).
  const base = pathImpl.basename(databaseFile);
  if (!base || base === "." || base === "..") {
    issues.push({
      level: "error",
      code: "DATABASE_FILE_INVALID",
      message: `DATABASE_FILE is not a file path: ${databaseFile}`,
    });
    return { ok: false, databaseFile, issues };
  }

  if (fsImpl.existsSync(databaseFile)) {
    let stat;
    try {
      stat = fsImpl.statSync(databaseFile);
    } catch (error) {
      issues.push({
        level: "error",
        code: "DATABASE_FILE_UNREADABLE",
        message: `Cannot stat database file ${databaseFile}: ${error && error.message ? error.message : error}`,
      });
      return { ok: false, databaseFile, issues };
    }
    if (stat.isDirectory()) {
      issues.push({
        level: "error",
        code: "DATABASE_FILE_IS_DIRECTORY",
        message: `DATABASE_FILE points to a directory: ${databaseFile}`,
      });
      return { ok: false, databaseFile, issues };
    }
  }

  const dir = pathImpl.dirname(databaseFile);
  const probe = probeDirectoryWritable(dir, { fsImpl, pathImpl });
  if (!probe.ok) {
    issues.push({
      level: "error",
      code: probe.code || "DATABASE_DIR_NOT_WRITABLE",
      message: probe.message || `Database directory is not writable: ${dir}`,
    });
  }

  // Optional storage dir (uploads) when co-located with API cwd layout.
  const storageDir = String(env.STORAGE_DIR || "").trim();
  if (storageDir) {
    const storageProbe = probeDirectoryWritable(pathImpl.resolve(storageDir), { fsImpl, pathImpl });
    if (!storageProbe.ok) {
      issues.push({
        level: isProd ? "error" : "warn",
        code: "STORAGE_DIR_NOT_WRITABLE",
        message: storageProbe.message || `STORAGE_DIR is not writable: ${storageDir}`,
      });
    }
  }

  const errors = issues.filter((item) => item.level === "error");
  return { ok: errors.length === 0, databaseFile, issues };
}

/**
 * Quick exclusive-open probe used after graceful shutdown to ensure no lingering lock.
 * @param {string} databaseFile
 * @param {{ DatabaseSync?: typeof import("node:sqlite").DatabaseSync }} [options]
 */
function assertSqliteReopenable(databaseFile, { DatabaseSync } = {}) {
  if (!DatabaseSync) {
    // Lazy require so unit tests can inject.
    ({ DatabaseSync } = require("node:sqlite"));
  }
  const connection = new DatabaseSync(databaseFile);
  try {
    const integrity = connection.prepare("PRAGMA integrity_check").all();
    const values = integrity.map((row) => row.integrity_check || Object.values(row)[0]);
    const ok = values.every((value) => value === "ok");
    if (!ok) {
      throw new Error(`SQLite integrity_check failed: ${values.join("; ")}`);
    }
    // Write probe confirms WAL/main is not stuck exclusive by a dead process.
    connection.exec("CREATE TABLE IF NOT EXISTS __shutdown_probe (id INTEGER PRIMARY KEY)");
    connection.exec("DROP TABLE IF EXISTS __shutdown_probe");
    return { ok: true, integrity: values };
  } finally {
    connection.close();
  }
}

module.exports = {
  assertSqliteReopenable,
  preflightSqliteFilesystem,
  probeDirectoryWritable,
  resolveDatabaseDialect,
  resolveSqliteDatabaseFile,
  // exposed for tests
  _tmpRoot: () => os.tmpdir(),
};
