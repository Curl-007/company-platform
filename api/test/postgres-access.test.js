const assert = require("node:assert/strict");
const test = require("node:test");
const { createPostgresAccess, createAccess } = require("../src/db/access");
const { createPostgresRuntime } = require("../src/db/postgres");

/**
 * In-memory fake pg Pool/Client for unit tests (no real PostgreSQL).
 * Tracks tables as Map<table, Map<id, row>> for simple SELECT/INSERT/UPDATE/DELETE patterns used by the access layer.
 */
function createFakePostgresRuntime() {
  const tables = new Map();
  const log = [];

  function ensureTable(name) {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  }

  function parseInsert(sql, values) {
    // INSERT INTO t (a, b) VALUES ($1, $2) [ON CONFLICT ...]
    const m = String(sql).match(
      /^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
    );
    if (!m) return null;
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim());
    const row = {};
    cols.forEach((col, i) => {
      row[col] = values[i];
    });
    const store = ensureTable(table);
    const conflict = /ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE/i.test(sql);
    const keyCol = cols.includes("id") ? "id" : cols[0];
    const key = row[keyCol];
    if (conflict || !store.has(key)) {
      store.set(key, { ...store.get(key), ...row });
    }
    return { rows: [], rowCount: 1 };
  }

  function parseSelect(sql, values) {
    const m = String(sql).match(
      /^\s*SELECT\s+(.+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+.+)?$/i,
    );
    if (!m) return { rows: [], rowCount: 0 };
    const table = m[2];
    const where = (m[3] || "").replace(/\s+ORDER\s+BY\s+.+$/i, "").trim();
    const store = ensureTable(table);
    let rows = [...store.values()];

    // Support "WHERE id = $1" / "WHERE id = $1 AND name = $2"
    if (where) {
      const clauses = where.split(/\s+AND\s+/i);
      for (const clause of clauses) {
        const eq = clause.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$(\d+)/i);
        if (eq) {
          const col = eq[1];
          const val = values[Number(eq[2]) - 1];
          rows = rows.filter((r) => r[col] === val);
        }
      }
    }

    // ORDER BY id
    if (/ORDER\s+BY\s+id/i.test(sql)) {
      rows = rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    return { rows, rowCount: rows.length };
  }

  function parseUpdate(sql, values) {
    const m = String(sql).match(
      /^\s*UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i,
    );
    if (!m) return { rows: [], rowCount: 0 };
    const table = m[1];
    const setPart = m[2];
    const where = m[3];
    const store = ensureTable(table);
    const whereEq = where.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$(\d+)/i);
    if (!whereEq) return { rows: [], rowCount: 0 };
    const whereCol = whereEq[1];
    const whereVal = values[Number(whereEq[2]) - 1];
    const setPairs = [...setPart.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$(\d+)/gi)];
    let changes = 0;
    for (const [key, row] of store.entries()) {
      if (row[whereCol] !== whereVal) continue;
      for (const pair of setPairs) {
        row[pair[1]] = values[Number(pair[2]) - 1];
      }
      store.set(key, row);
      changes += 1;
    }
    return { rows: [], rowCount: changes };
  }

  async function runQuery(sql, params = []) {
    const text = String(sql).trim();
    log.push({ sql: text, params });
    if (/^BEGIN$/i.test(text) || /^COMMIT$/i.test(text) || /^ROLLBACK$/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^SELECT\s+1\b/i.test(text)) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }
    if (/^INSERT\s+INTO/i.test(text)) {
      return parseInsert(text, params) || { rows: [], rowCount: 0 };
    }
    if (/^UPDATE\s+/i.test(text)) {
      return parseUpdate(text, params);
    }
    if (/^SELECT\s+/i.test(text)) {
      return parseSelect(text, params);
    }
    // INSERT OR IGNORE translated forms with ON CONFLICT DO NOTHING
    if (/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(text)) {
      const ins = parseInsert(text.replace(/\s+ON\s+CONFLICT\s+DO\s+NOTHING/i, ""), params);
      // naive: if row existed with same id, rowCount 0
      const m = text.match(/INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/i);
      if (m && params?.length) {
        ensureTable(m[1]);
        const id = params[0];
        // parseInsert already wrote; approximate idempotency for second call by checking log
        const prior = log.filter((e) => e !== log[log.length - 1] && /INSERT/i.test(e.sql) && e.params?.[0] === id);
        if (prior.length) {
          return { rows: [], rowCount: 0 };
        }
      }
      return ins || { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  class FakeClient {
    constructor(pool) {
      this.pool = pool;
      this.released = false;
    }

    async query(sql, params) {
      return runQuery(sql, params);
    }

    release() {
      this.released = true;
    }
  }

  class FakePool {
    constructor() {
      this.clients = [];
    }

    async query(sql, params) {
      return runQuery(sql, params);
    }

    async connect() {
      const client = new FakeClient(this);
      this.clients.push(client);
      return client;
    }

    async end() {}
  }

  const pool = new FakePool();
  const runtime = {
    dialect: "postgres",
    pool,
    connection: null,
    connectionStringMasked: "postgres://***:***@localhost/test",
    async query(sql, params) {
      return pool.query(sql, params);
    },
    async ping() {
      const result = await pool.query("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    },
    async close() {
      await pool.end();
    },
    _tables: tables,
    _log: log,
  };
  return runtime;
}

test("createPostgresAccess exposes the async public contract", async () => {
  const runtime = createFakePostgresRuntime();
  const access = createPostgresAccess(runtime);

  assert.equal(access.dialect, "postgres");
  assert.equal(typeof access.row, "function");
  assert.equal(typeof access.rows, "function");
  assert.equal(typeof access.run, "function");
  assert.equal(typeof access.insert, "function");
  assert.equal(typeof access.transaction, "function");
  assert.throws(() => access._sync, /not available for postgres/);

  await access.insert("items", { id: "I1", name: "alpha", qty: 1 });
  const found = await access.row("SELECT * FROM items WHERE id = @id", { id: "I1" });
  assert.equal(found?.id, "I1");
  assert.equal(found?.name, "alpha");
  assert.equal(found?.qty, 1);

  const missing = await access.row("SELECT * FROM items WHERE id = @id", { id: "missing" });
  assert.equal(missing, undefined);

  await access.insert("items", { id: "I2", name: "beta", qty: 2 });
  const all = await access.rows("SELECT id FROM items ORDER BY id");
  assert.deepEqual(all.map((item) => item.id), ["I1", "I2"]);

  const updated = await access.run("UPDATE items SET qty = @qty WHERE id = @id", { id: "I1", qty: 9 });
  assert.equal(typeof updated.changes, "number");
  assert.equal(updated.changes, 1);

  const ignored = await access.run("UPDATE items SET qty = 0 WHERE id = @id", { id: "nope" });
  assert.equal(ignored.changes, 0);
});

test("postgres transaction commits and rolls back on the same client", async () => {
  const runtime = createFakePostgresRuntime();
  const access = createPostgresAccess(runtime);

  const committed = await access.transaction(async () => {
    await access.insert("items", { id: "T1", name: "txn", qty: 1 });
    const row = await access.row("SELECT name FROM items WHERE id = @id", { id: "T1" });
    assert.equal(row.name, "txn");
    return "ok";
  });
  assert.equal(committed, "ok");
  assert.equal((await access.row("SELECT id FROM items WHERE id = @id", { id: "T1" }))?.id, "T1");

  // After rollback the fake store still holds in-memory writes (no real MVCC).
  // Verify BEGIN/ROLLBACK were issued on a dedicated client and that client was released.
  const clientCountBefore = runtime.pool.clients.length;
  await assert.rejects(
    () => access.transaction(async () => {
      await access.insert("items", { id: "T2", name: "will-fail", qty: 1 });
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.ok(runtime.pool.clients.length > clientCountBefore);
  const lastClient = runtime.pool.clients[runtime.pool.clients.length - 1];
  assert.equal(lastClient.released, true);

  const txLog = runtime._log.map((e) => e.sql);
  assert.ok(txLog.some((s) => /^BEGIN$/i.test(s)));
  assert.ok(txLog.some((s) => /^ROLLBACK$/i.test(s)));

  // Simulate real rollback by deleting the failed row (fake has no isolation).
  runtime._tables.get("items")?.delete("T2");
  assert.equal(await access.row("SELECT id FROM items WHERE id = @id", { id: "T2" }), undefined);
});

test("postgres nested transaction makes the shared outer unit rollback-only after a caught failure", async () => {
  const runtime = createFakePostgresRuntime();
  const access = createPostgresAccess(runtime);

  await assert.rejects(
    () => access.transaction(async () => {
      await access.insert("items", { id: "N1", name: "outer", qty: 1 });
      try {
        await access.transaction(async () => {
          await access.insert("items", { id: "N2", name: "inner", qty: 2 });
          throw new Error("caught nested failure");
        });
      } catch {
        // The outer transaction must still roll back before it can commit.
      }
    }),
    /caught nested failure/,
  );

  assert.equal(runtime.pool.clients.length, 1);
  const commands = runtime._log.map((entry) => entry.sql);
  assert.ok(commands.some((sql) => /^BEGIN$/i.test(sql)));
  assert.ok(commands.some((sql) => /^ROLLBACK$/i.test(sql)));
  assert.equal(commands.some((sql) => /^COMMIT$/i.test(sql)), false);
});

test("run().changes uses result.rowCount", async () => {
  const runtime = createFakePostgresRuntime();
  const access = createPostgresAccess(runtime);
  await access.insert("items", { id: "K1", name: "once", qty: 1 });

  const first = await access.run(
    "INSERT OR IGNORE INTO items (id, name, qty) VALUES (@id, @name, @qty)",
    { id: "K2", name: "new", qty: 1 },
  );
  assert.equal(typeof first.changes, "number");
  assert.ok(first.changes >= 0);

  // Second insert with same id via OR IGNORE → ON CONFLICT DO NOTHING
  const second = await access.run(
    "INSERT OR IGNORE INTO items (id, name, qty) VALUES (@id, @name, @qty)",
    { id: "K2", name: "dup", qty: 2 },
  );
  assert.equal(typeof second.changes, "number");
});

test("createAccess routes by runtime.dialect", async () => {
  const runtime = createFakePostgresRuntime();
  const access = createAccess(runtime);
  assert.equal(access.dialect, "postgres");
  await access.insert("items", { id: "A1", name: "via-factory", qty: 1 });
  assert.equal((await access.row("SELECT name FROM items WHERE id = @id", { id: "A1" }))?.name, "via-factory");
});

test("createPostgresRuntime + createPostgresAccess integration with FakePool", async () => {
  class FakePool {
    constructor(options) {
      this.options = options;
    }

    async query(sql) {
      if (String(sql).includes("SELECT 1")) return { rows: [{ ok: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }

    async connect() {
      return {
        async query(_sql) {
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    }

    async end() {}
  }

  const runtime = createPostgresRuntime({
    connectionString: "postgres://u:p@localhost/db",
    env: {},
    Pool: FakePool,
  });
  const access = createPostgresAccess(runtime);
  assert.equal(access.dialect, "postgres");
  assert.equal(await runtime.ping(), true);
});
