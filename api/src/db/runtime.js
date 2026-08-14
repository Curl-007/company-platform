/**
 * Runtime database boundary (W2 Wave 5).
 *
 * Selects SQLite (default) or PostgreSQL based on DATABASE_DIALECT.
 * PostgreSQL requires DATABASE_URL (or POSTGRES_TARGET_URL) and uses
 * createPostgresRuntime from ./postgres.js (injectable Pool for tests).
 *
 * Default remains sqlite for local/dev and normal test execution. Real
 * PostgreSQL validation is explicit opt-in through the dedicated CI test.
 *
 * @see docs/w2-postgres-plan.md
 */

const { createPostgresRuntime } = require("./postgres");

function resolveDatabaseDialect(env = process.env) {
  const value = String(env.DATABASE_DIALECT || "sqlite").trim().toLowerCase();
  if (value === "sqlite") return value;
  if (value === "postgres" || value === "postgresql") return "postgres";
  throw new Error(`Unsupported DATABASE_DIALECT: ${value}. Use sqlite or postgres.`);
}

function createSqliteRuntime({ DatabaseSync, databaseFile }) {
  if (!DatabaseSync) throw new Error("SQLite runtime requires DatabaseSync.");
  if (!databaseFile) throw new Error("SQLite runtime requires a database file.");
  const connection = new DatabaseSync(databaseFile);
  return {
    dialect: "sqlite",
    connection,
    exec: (sql) => connection.exec(sql),
    prepare: (sql) => connection.prepare(sql),
    close: () => connection.close(),
  };
}

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof import("node:sqlite").DatabaseSync} [options.DatabaseSync]
 * @param {string} [options.databaseFile]
 * @param {typeof import("pg").Pool} [options.Pool] - injectable for tests
 */
function createDatabaseRuntime({ env = process.env, DatabaseSync, databaseFile, Pool } = {}) {
  const dialect = resolveDatabaseDialect(env);
  if (dialect === "sqlite") {
    return createSqliteRuntime({ DatabaseSync, databaseFile });
  }

  // Wave 5: postgres is enabled when DATABASE_URL / POSTGRES_TARGET_URL is set.
  // createPostgresRuntime / createPgPool throw a clear error if the URL is missing.
  return createPostgresRuntime({ env, Pool });
}

module.exports = {
  createDatabaseRuntime,
  createSqliteRuntime,
  resolveDatabaseDialect,
};
