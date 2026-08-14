/**
 * PostgreSQL connection pool boundary (W2 Wave 1 / Wave 5 runtime wiring).
 *
 * Used by scripts (import/apply) and by createDatabaseRuntime when
 * DATABASE_DIALECT=postgres. Credentials must come from env only.
 */

function resolveDatabaseUrl(env = process.env) {
  const url = String(env.DATABASE_URL || env.POSTGRES_TARGET_URL || "").trim();
  return url || null;
}

function maskDatabaseUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = parsed.username ? "***" : "";
    // Connection URL query parameters can contain passwords, tokens, or TLS
    // material. They are not needed in operational output, so omit them all.
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    // Keep malformed URLs from leaking an authority or query-string secret in
    // an error path. A valid URL takes the branch above.
    return raw
      .replace(/:\/\/[^@/?#]*@/g, "://***:***@")
      .replace(/([?&][^=&#]+)(?:=[^&#]*)?/g, "$1=***")
      .replace(/#.*/, "");
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function createPgPool({ connectionString, env = process.env, Pool } = {}) {
  const url = connectionString || resolveDatabaseUrl(env);
  if (!url) {
    throw new Error(
      "PostgreSQL requires DATABASE_URL (or POSTGRES_TARGET_URL for target scripts). Do not store credentials in git.",
    );
  }

  let PgPool = Pool;
  if (!PgPool) {
    try {
      ({ Pool: PgPool } = require("pg"));
    } catch (error) {
      throw new Error(
        "The 'pg' package is required for PostgreSQL. Install it in the api workspace (npm install pg -w api).",
        { cause: error },
      );
    }
  }

  const pool = new PgPool({
    connectionString: url,
    max: positiveInteger(env.PG_POOL_MAX, 10),
    idleTimeoutMillis: nonNegativeInteger(env.PG_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: nonNegativeInteger(env.PG_CONNECTION_TIMEOUT_MS, 10_000),
  });

  return {
    dialect: "postgres",
    pool,
    connectionStringMasked: maskDatabaseUrl(url),
    async ping() {
      const result = await pool.query("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1 || result.rows[0]?.ok === "1";
    },
    async query(sql, params) {
      return pool.query(sql, params);
    },
    async connect() {
      return pool.connect();
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * Process runtime shape for DATABASE_DIALECT=postgres.
 * No sync prepare/exec — repositories must use the async access layer.
 */
function createPostgresRuntime(options = {}) {
  const handle = createPgPool(options);
  return {
    dialect: "postgres",
    pool: handle.pool,
    connectionStringMasked: handle.connectionStringMasked,
    // No sync prepare/exec — repositories must use the async access layer.
    connection: null,
    async exec(sql) {
      await handle.query(sql);
    },
    async query(sql, params) {
      return handle.query(sql, params);
    },
    async connect() {
      return handle.connect();
    },
    async ping() {
      return handle.ping();
    },
    async close() {
      await handle.close();
    },
  };
}

module.exports = {
  createPgPool,
  createPostgresRuntime,
  maskDatabaseUrl,
  resolveDatabaseUrl,
};
