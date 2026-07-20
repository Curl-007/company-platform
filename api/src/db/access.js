/**
 * Unified asynchronous DB access contract (W2 Wave 5).
 *
 * Call sites depend only on these Promise-based APIs so the same surface
 * targets SQLite (node:sqlite) or PostgreSQL (pg.Pool).
 *
 * Public contract:
 *   row(sql, params?) → Promise<object|undefined>
 *   rows(sql, params?) → Promise<object[]>
 *   run(sql, params?) → Promise<{ changes: number }>
 *   insert(table, data) → Promise<void>
 *   transaction(work) → Promise<T>
 *
 * SQLite also exposes `_sync` for init/migration/seed only.
 * Postgres does not provide `_sync` (init must not use SQLite PRAGMA/sync).
 */

const { AsyncLocalStorage } = require("node:async_hooks");
const { toPostgresQuery, buildUpsertSql } = require("./sql");

function createSqliteAccess(databaseRuntime) {
  if (!databaseRuntime || typeof databaseRuntime.prepare !== "function") {
    throw new Error("createSqliteAccess requires a database runtime with prepare().");
  }

  function prepare(sql) {
    return databaseRuntime.prepare(sql);
  }

  function execSync(sql) {
    databaseRuntime.exec(sql);
  }

  /** Sync helpers for migrations/seed only — not part of the public contract. */
  function rowSync(sql, params = {}) {
    return prepare(sql).get(params);
  }

  function rowsSync(sql, params = {}) {
    return prepare(sql).all(params);
  }

  function runSync(sql, params = {}) {
    return prepare(sql).run(params);
  }

  function insertSync(table, data) {
    const keys = Object.keys(data);
    if (!keys.length) {
      throw new Error(`insert() requires at least one column for table ${table}`);
    }
    const placeholders = keys.map((key) => `@${key}`).join(", ");
    prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`).run(data);
  }

  async function row(sql, params = {}) {
    return rowSync(sql, params);
  }

  async function rows(sql, params = {}) {
    return rowsSync(sql, params);
  }

  async function run(sql, params = {}) {
    // Preserve node:sqlite StatementResult shape (changes is required for idempotency).
    return runSync(sql, params);
  }

  async function insert(table, data) {
    insertSync(table, data);
  }

  /**
   * @template T
   * @param {() => T | Promise<T>} work
   * @returns {Promise<T>}
   */
  async function transaction(work) {
    execSync("BEGIN IMMEDIATE");
    try {
      const result = await work();
      execSync("COMMIT");
      return result;
    } catch (error) {
      try {
        execSync("ROLLBACK");
      } catch {
        /* transaction was not opened or already closed */
      }
      throw error;
    }
  }

  return {
    dialect: "sqlite",
    row,
    rows,
    run,
    insert,
    transaction,
    // Private sync surface for init/migration/seed paths only.
    _sync: {
      row: rowSync,
      rows: rowsSync,
      run: runSync,
      insert: insertSync,
      exec: execSync,
    },
  };
}

/**
 * PostgreSQL access using the shared SQL dialect helpers.
 * Transactions bind a single client via AsyncLocalStorage so nested
 * row/rows/run/insert calls reuse the same connection.
 */
function createPostgresAccess(databaseRuntime) {
  if (!databaseRuntime || databaseRuntime.dialect !== "postgres") {
    throw new Error("createPostgresAccess requires a postgres database runtime.");
  }
  if (typeof databaseRuntime.query !== "function") {
    throw new Error("createPostgresAccess requires runtime.query().");
  }
  if (!databaseRuntime.pool || typeof databaseRuntime.pool.connect !== "function") {
    throw new Error("createPostgresAccess requires runtime.pool.connect().");
  }

  const txStorage = new AsyncLocalStorage();

  async function execute(sql, params = {}) {
    const { text, values } = toPostgresQuery(sql, params);
    const client = txStorage.getStore();
    if (client) {
      return client.query(text, values);
    }
    return databaseRuntime.query(text, values);
  }

  async function row(sql, params = {}) {
    const result = await execute(sql, params);
    return result.rows[0];
  }

  async function rows(sql, params = {}) {
    const result = await execute(sql, params);
    return result.rows;
  }

  async function run(sql, params = {}) {
    const result = await execute(sql, params);
    return { changes: typeof result.rowCount === "number" ? result.rowCount : 0 };
  }

  async function insert(table, data) {
    const keys = Object.keys(data);
    if (!keys.length) {
      throw new Error(`insert() requires at least one column for table ${table}`);
    }
    const built = buildUpsertSql(table, keys, { dialect: "postgres" });
    const values = keys.map((key) => data[key]);
    const client = txStorage.getStore();
    if (client) {
      await client.query(built.sql, values);
      return;
    }
    await databaseRuntime.query(built.sql, values);
  }

  /**
   * @template T
   * @param {() => T | Promise<T>} work
   * @returns {Promise<T>}
   */
  async function transaction(work) {
    const existing = txStorage.getStore();
    if (existing) {
      // Nested transactions reuse the outer client (no savepoints for now).
      return work();
    }

    const client = await databaseRuntime.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        const result = await txStorage.run(client, async () => work());
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* transaction was not opened or already closed */
        }
        throw error;
      }
    } finally {
      client.release();
    }
  }

  return {
    dialect: "postgres",
    row,
    rows,
    run,
    insert,
    transaction,
    // Explicitly unavailable — callers that need sync must stay on sqlite.
    get _sync() {
      throw new Error(
        "SQLite sync helpers (_sync) are not available for postgres dialect. Init/migration paths must use the async postgres access layer or apply-postgres-schema scripts.",
      );
    },
  };
}

/**
 * Factory: branch on runtime.dialect.
 * @param {{ dialect: string }} runtime
 */
function createAccess(runtime) {
  if (!runtime || !runtime.dialect) {
    throw new Error("createAccess requires a database runtime with dialect.");
  }
  if (runtime.dialect === "sqlite") return createSqliteAccess(runtime);
  if (runtime.dialect === "postgres") return createPostgresAccess(runtime);
  throw new Error(`Unsupported database runtime dialect: ${runtime.dialect}`);
}

module.exports = {
  createSqliteAccess,
  createPostgresAccess,
  createAccess,
};
