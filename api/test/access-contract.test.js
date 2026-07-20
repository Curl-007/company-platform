const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");

function createAccess() {
  const runtime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  runtime.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0
    );
  `);
  return { runtime, access: createSqliteAccess(runtime) };
}

test("createSqliteAccess exposes the async public contract", async () => {
  const { runtime, access } = createAccess();
  assert.equal(typeof access.row, "function");
  assert.equal(typeof access.rows, "function");
  assert.equal(typeof access.run, "function");
  assert.equal(typeof access.insert, "function");
  assert.equal(typeof access.transaction, "function");
  assert.equal(typeof access._sync?.row, "function");
  assert.equal(typeof access._sync?.rows, "function");
  assert.equal(typeof access._sync?.run, "function");
  assert.equal(typeof access._sync?.insert, "function");
  assert.equal(typeof access._sync?.exec, "function");

  const inserted = access.insert("items", { id: "I1", name: "alpha", qty: 1 });
  assert.ok(inserted && typeof inserted.then === "function");
  await inserted;

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

  runtime.close();
});

test("transaction commits async work and rolls back on failure", async () => {
  const { runtime, access } = createAccess();

  const committed = await access.transaction(async () => {
    await access.insert("items", { id: "T1", name: "txn", qty: 1 });
    const row = await access.row("SELECT name FROM items WHERE id = @id", { id: "T1" });
    assert.equal(row.name, "txn");
    return "ok";
  });
  assert.equal(committed, "ok");
  assert.equal((await access.row("SELECT id FROM items WHERE id = @id", { id: "T1" }))?.id, "T1");

  await assert.rejects(
    () => access.transaction(async () => {
      await access.insert("items", { id: "T2", name: "will-fail", qty: 1 });
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(await access.row("SELECT id FROM items WHERE id = @id", { id: "T2" }), undefined);

  // Sync work callback is still supported.
  await access.transaction(() => {
    access._sync.insert("items", { id: "T3", name: "sync-work", qty: 3 });
  });
  assert.equal((await access.row("SELECT name FROM items WHERE id = @id", { id: "T3" }))?.name, "sync-work");

  runtime.close();
});

test("rows returns an empty array when no rows match", async () => {
  const { runtime, access } = createAccess();
  await access.insert("items", { id: "E1", name: "exists", qty: 1 });

  const empty = await access.rows("SELECT * FROM items WHERE id = @id", { id: "nope" });
  assert.ok(Array.isArray(empty));
  assert.equal(empty.length, 0);

  const nonEmpty = await access.rows("SELECT * FROM items WHERE id = @id", { id: "E1" });
  assert.equal(nonEmpty.length, 1);

  runtime.close();
});

test("run().changes supports idempotency-style INSERT OR IGNORE", async () => {
  const { runtime, access } = createAccess();
  await access.insert("items", { id: "K1", name: "once", qty: 1 });

  const first = await access.run(
    "INSERT OR IGNORE INTO items (id, name, qty) VALUES (@id, @name, @qty)",
    { id: "K2", name: "new", qty: 1 },
  );
  assert.equal(first.changes, 1);

  const second = await access.run(
    "INSERT OR IGNORE INTO items (id, name, qty) VALUES (@id, @name, @qty)",
    { id: "K2", name: "dup", qty: 2 },
  );
  assert.equal(second.changes, 0);
  assert.equal((await access.row("SELECT name FROM items WHERE id = @id", { id: "K2" }))?.name, "new");

  runtime.close();
});
