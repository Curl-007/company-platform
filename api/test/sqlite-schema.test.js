const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  addColumnIfMissing,
  inspectSqliteSchema,
} = require("../src/db/sqliteSchema");

test("sqlite schema helper adds missing columns and treats existing columns as a no-op", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    assert.equal(addColumnIfMissing(db, "samples", "status", "TEXT NOT NULL DEFAULT 'active'"), true);
    assert.equal(addColumnIfMissing(db, "samples", "status", "TEXT NOT NULL DEFAULT 'active'"), false);
    assert.equal(db.prepare("PRAGMA table_info(samples)").all().filter((item) => item.name === "status").length, 1);
  } finally {
    db.close();
  }
});

test("sqlite schema helper fails closed when ALTER TABLE cannot be applied", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.throws(() => addColumnIfMissing(db, "missing_table", "status", "TEXT"));
  } finally {
    db.close();
  }
});

test("sqlite schema inspection reports missing tables and columns", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
    const report = inspectSqliteSchema(db, {
      requiredTables: ["users", "projects"],
      requiredColumns: [["users", "status", "TEXT"]],
    });
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingTables, ["projects"]);
    assert.deepEqual(report.missingColumns, ["users.status"]);
  } finally {
    db.close();
  }
});
