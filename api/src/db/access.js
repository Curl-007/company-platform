/**
 * Unified asynchronous DB access contract (W2 option 1 / Wave 5 prep).
 *
 * Call sites should only depend on these Promise-based APIs so the same surface
 * can later target PostgreSQL without another repository rewrite.
 *
 * SQLite implementation wraps node:sqlite's synchronous statement API.
 * postgres dialect remains fail-closed in runtime.js until dual-env validation.
 */

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

module.exports = {
  createSqliteAccess,
};
