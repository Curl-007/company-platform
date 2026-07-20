const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createDatabaseRuntime, resolveDatabaseDialect } = require("../src/db/runtime");

test("database runtime defaults to SQLite", () => {
  assert.equal(resolveDatabaseDialect({}), "sqlite");
  assert.equal(resolveDatabaseDialect({ DATABASE_DIALECT: "postgresql" }), "postgres");
  assert.throws(() => resolveDatabaseDialect({ DATABASE_DIALECT: "mysql" }), /Unsupported DATABASE_DIALECT/);

  const sqlite = createDatabaseRuntime({ env: { DATABASE_DIALECT: "sqlite" }, DatabaseSync, databaseFile: ":memory:" });
  sqlite.exec("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
  sqlite.prepare("INSERT INTO items (id, name) VALUES (@id, @name)").run({ id: "ITM-1", name: "adapter boundary" });
  assert.equal(sqlite.prepare("SELECT name FROM items WHERE id = @id").get({ id: "ITM-1" }).name, "adapter boundary");
  sqlite.close();
});

test("postgres runtime requires DATABASE_URL (or POSTGRES_TARGET_URL)", () => {
  assert.throws(
    () => createDatabaseRuntime({ env: { DATABASE_DIALECT: "postgres" }, DatabaseSync, databaseFile: ":memory:" }),
    /DATABASE_URL/,
  );
});

test("postgres runtime succeeds with injected Pool and DATABASE_URL", async () => {
  const ended = [];
  class FakePool {
    constructor(options) {
      this.options = options;
      this.queries = [];
    }

    async query(sql, params) {
      this.queries.push({ sql, params });
      if (String(sql).includes("SELECT 1")) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    async connect() {
      return {
        query: async (sql, params) => this.query(sql, params),
        release() {},
      };
    }

    async end() {
      ended.push(true);
    }
  }

  const runtime = createDatabaseRuntime({
    env: {
      DATABASE_DIALECT: "postgres",
      DATABASE_URL: "postgres://user:pass@localhost:5432/pm",
      PG_POOL_MAX: "4",
    },
    Pool: FakePool,
  });

  assert.equal(runtime.dialect, "postgres");
  assert.equal(runtime.connection, null);
  assert.equal(runtime.pool.options.max, 4);
  assert.equal(await runtime.ping(), true);
  assert.equal(typeof runtime.query, "function");
  await runtime.close();
  assert.equal(ended.length, 1);
});
