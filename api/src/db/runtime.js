/**
 * Runtime database boundary.
 *
 * Repositories currently rely on a synchronous statement API. SQLite remains
 * the only executable runtime until the repositories are moved to the
 * asynchronous PostgreSQL contract. Keeping selection here prevents an
 * environment variable from silently pointing a SQLite process at a
 * PostgreSQL URL and corrupting the intended migration procedure.
 */
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

function createDatabaseRuntime({ env = process.env, DatabaseSync, databaseFile }) {
  const dialect = resolveDatabaseDialect(env);
  if (dialect === "sqlite") return createSqliteRuntime({ DatabaseSync, databaseFile });

  // PostgreSQL migration is intentionally fail-closed for now. The export,
  // preflight and runbook are available, but production repositories are
  // still synchronous. Starting with this setting before the async adapter
  // and dual-environment verification exist would be unsafe.
  throw new Error(
    "DATABASE_DIALECT=postgres is not enabled yet: complete the asynchronous PostgreSQL repository adapter and dual-environment validation before switching runtime databases.",
  );
}

module.exports = {
  createDatabaseRuntime,
  createSqliteRuntime,
  resolveDatabaseDialect,
};
