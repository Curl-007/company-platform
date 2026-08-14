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
 *   insert(table, data) → Promise<void> (strict create)
 *   upsert(table, data, options?) → Promise<void> (explicit replace/update)
 *   transaction(work) → Promise<T>
 *
 * SQLite also exposes `_sync` for init/migration/seed only.
 * Postgres does not provide `_sync` (init must not use SQLite PRAGMA/sync).
 */

const { AsyncLocalStorage } = require("node:async_hooks");
const { toPostgresQuery, buildInsertSql, buildUpsertSql } = require("./sql");

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
    prepare(buildInsertSql(table, keys, { dialect: "sqlite" }).sql).run(data);
  }

  function upsertSync(table, data, options = {}) {
    const keys = Object.keys(data);
    if (!keys.length) {
      throw new Error(`upsert() requires at least one column for table ${table}`);
    }
    prepare(buildUpsertSql(table, keys, { ...options, dialect: "sqlite" }).sql).run(data);
  }

  // node:sqlite exposes one synchronous connection. Keep every public access on
  // one FIFO, while allowing the transaction owner to use that connection
  // directly until its callback has committed or rolled back.
  const txStorage = new AsyncLocalStorage();
  let activeTransactionOwner = null;
  let queueTail = Promise.resolve();

  function enqueue(work) {
    const result = queueTail.then(work, work);
    queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function execute(work) {
    const owner = txStorage.getStore();
    if (owner && owner === activeTransactionOwner) {
      return Promise.resolve().then(work);
    }
    return enqueue(work);
  }

  async function row(sql, params = {}) {
    return execute(() => rowSync(sql, params));
  }

  async function rows(sql, params = {}) {
    return execute(() => rowsSync(sql, params));
  }

  async function run(sql, params = {}) {
    // Preserve node:sqlite StatementResult shape (changes is required for idempotency).
    return execute(() => runSync(sql, params));
  }

  async function insert(table, data) {
    return execute(() => insertSync(table, data));
  }

  async function upsert(table, data, options = {}) {
    return execute(() => upsertSync(table, data, options));
  }

  /**
   * @template T
   * @param {() => T | Promise<T>} work
   * @returns {Promise<T>}
   */
  async function transaction(work) {
    const existingOwner = txStorage.getStore();
    if (existingOwner && existingOwner === activeTransactionOwner) {
      // Nested transactions share the outer atomic unit. Once nested work
      // fails, that unit remains rollback-only even if its caller catches the
      // error; committing a partially recovered unit would be ambiguous.
      try {
        return await work();
      } catch (error) {
        existingOwner.rollbackError ||= error;
        throw error;
      }
    }

    return enqueue(async () => {
      const owner = { rollbackError: null };
      activeTransactionOwner = owner;
      try {
        execSync("BEGIN IMMEDIATE");
        const result = await txStorage.run(owner, async () => work());
        if (owner.rollbackError) throw owner.rollbackError;
        execSync("COMMIT");
        return result;
      } catch (error) {
        try {
          execSync("ROLLBACK");
        } catch {
          /* transaction was not opened or already closed */
        }
        throw error;
      } finally {
        activeTransactionOwner = null;
      }
    });
  }

  return {
    dialect: "sqlite",
    row,
    rows,
    run,
    insert,
    upsert,
    transaction,
    // Private sync surface for init/migration/seed paths only.
    _sync: {
      row: rowSync,
      rows: rowsSync,
      run: runSync,
      insert: insertSync,
      upsert: upsertSync,
      exec: execSync,
    },
  };
}

/**
 * PostgreSQL access using the shared SQL dialect helpers.
 * Transactions bind a single client via AsyncLocalStorage so nested
 * row/rows/run/insert calls reuse the same connection. Nested work shares
 * the outer atomic unit and marks it rollback-only when it fails, matching
 * the SQLite access contract.
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
    const context = txStorage.getStore();
    if (context?.client) {
      return context.client.query(text, values);
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
    const built = buildInsertSql(table, keys, { dialect: "postgres" });
    const values = keys.map((key) => data[key]);
    const context = txStorage.getStore();
    if (context?.client) {
      await context.client.query(built.sql, values);
      return;
    }
    await databaseRuntime.query(built.sql, values);
  }

  async function upsert(table, data, options = {}) {
    const keys = Object.keys(data);
    if (!keys.length) {
      throw new Error(`upsert() requires at least one column for table ${table}`);
    }
    const built = buildUpsertSql(table, keys, { ...options, dialect: "postgres" });
    const values = keys.map((key) => data[key]);
    const context = txStorage.getStore();
    if (context?.client) {
      await context.client.query(built.sql, values);
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
      // Do not allow a caller to catch an inner failure and then commit a
      // partially recovered outer transaction. This is deliberately the same
      // rollback-only contract used by the SQLite adapter.
      try {
        return await work();
      } catch (error) {
        existing.rollbackError ||= error;
        throw error;
      }
    }

    const client = await databaseRuntime.pool.connect();
    const context = { client, rollbackError: null };
    try {
      await client.query("BEGIN");
      try {
        const result = await txStorage.run(context, async () => work());
        if (context.rollbackError) throw context.rollbackError;
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
    upsert,
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
