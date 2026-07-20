/**
 * PostgreSQL connection pool boundary (W2 Wave 1).
 *
 * Runtime selection still fails closed for DATABASE_DIALECT=postgres until the
 * async access layer and dual-environment verification land (Wave 5). This
 * module is safe to require for scripts and future runtime wiring.
 */

function resolveDatabaseUrl(env = process.env) {
  const url = String(env.DATABASE_URL || env.POSTGRES_TARGET_URL || "").trim();
  return url || null;
}

function maskDatabaseUrl(url) {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = parsed.username ? "***" : "";
    return parsed.toString();
  } catch {
    return raw.replace(/:\/\/([^:/@]+):([^@]+)@/g, "://***:***@");
  }
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

  const max = Number(env.PG_POOL_MAX || 10);
  const pool = new PgPool({
    connectionString: url,
    max: Number.isFinite(max) && max > 0 ? max : 10,
    idleTimeoutMillis: Number(env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(env.PG_CONNECTION_TIMEOUT_MS || 10_000),
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
 * Placeholder used by runtime selection once Wave 5 enables postgres.
 * Today createDatabaseRuntime still throws; this documents the future shape.
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
