/**
 * Runtime database boundary.
 *
 * Repositories currently rely on a synchronous statement API. SQLite remains
 * the only executable runtime until the repositories are moved to the
 * asynchronous PostgreSQL contract (W2 Wave 5). Keeping selection here prevents
 * an environment variable from silently pointing a SQLite process at a
 * PostgreSQL URL and corrupting the intended migration procedure.
 *
 * Wave 1 provides createPgPool / createPostgresRuntime in ./postgres.js for
 * scripts and future wiring; createDatabaseRuntime still fails closed for
 * postgres until the async access layer is complete.
 *
 * @see docs/w2-postgres-plan.md
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

  // PostgreSQL remains fail-closed at the process runtime boundary until Wave 5.
  // Pool helpers live in ./postgres.js for import scripts and progressive wiring.
  throw new Error(
    "DATABASE_DIALECT=postgres is not enabled yet: complete the asynchronous PostgreSQL access layer (docs/w2-postgres-plan.md Wave 5) and dual-environment validation before switching runtime databases.",
  );
}

module.exports = {
  createDatabaseRuntime,
  createSqliteRuntime,
  resolveDatabaseDialect,
};
