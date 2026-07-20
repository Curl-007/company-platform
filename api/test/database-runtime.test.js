const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createDatabaseRuntime, resolveDatabaseDialect } = require("../src/db/runtime");

test("database runtime defaults to SQLite and fails closed before an unsafe PostgreSQL switch", () => {
  assert.equal(resolveDatabaseDialect({}), "sqlite");
  assert.equal(resolveDatabaseDialect({ DATABASE_DIALECT: "postgresql" }), "postgres");
  assert.throws(() => resolveDatabaseDialect({ DATABASE_DIALECT: "mysql" }), /Unsupported DATABASE_DIALECT/);

  const sqlite = createDatabaseRuntime({ env: { DATABASE_DIALECT: "sqlite" }, DatabaseSync, databaseFile: ":memory:" });
  sqlite.exec("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
  sqlite.prepare("INSERT INTO items (id, name) VALUES (@id, @name)").run({ id: "ITM-1", name: "adapter boundary" });
  assert.equal(sqlite.prepare("SELECT name FROM items WHERE id = @id").get({ id: "ITM-1" }).name, "adapter boundary");
  sqlite.close();

  assert.throws(
    () => createDatabaseRuntime({ env: { DATABASE_DIALECT: "postgres" }, DatabaseSync, databaseFile: ":memory:" }),
    /not enabled yet/,
  );
});
