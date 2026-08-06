const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");
const { createDefectsRepository } = require("../src/modules/defects/repository");

function fixture() {
  const runtime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  runtime.exec(`
    CREATE TABLE defects (
      id TEXT PRIMARY KEY, title TEXT, description TEXT, severity TEXT, status TEXT,
      project_id TEXT, requirement_id TEXT, assignee TEXT, assignee_role TEXT,
      found_in_build TEXT, affected_version TEXT, reporter TEXT, version INTEGER
    );
    CREATE TABLE tasks (id TEXT PRIMARY KEY, source_type TEXT, source_id TEXT);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, resource_id TEXT);
  `);
  const access = createSqliteAccess(runtime);
  const repository = createDefectsRepository(access);
  return { runtime, access, repository };
}

test("defect create, derived task, and audit failure roll back as one unit", async () => {
  const { runtime, access, repository } = fixture();
  await assert.rejects(
    access.transaction(async () => {
      await repository.createDefect({ id: "BUG-1", title: "atomic", version: 1 });
      await access.insert("tasks", { id: "TASK-1", source_type: "defect", source_id: "BUG-1" });
      await access.insert("audit_logs", { id: "AUD-1", resource_id: "BUG-1" });
      throw new Error("audit failed");
    }),
    /audit failed/,
  );
  assert.equal(await repository.findDefect("BUG-1"), undefined);
  assert.equal(await access.row("SELECT id FROM tasks WHERE id = 'TASK-1'"), undefined);
  assert.equal(await access.row("SELECT id FROM audit_logs WHERE id = 'AUD-1'"), undefined);
  runtime.close();
});

test("ordinary defect PATCH updates all fields once and rejects a stale version", async () => {
  const { runtime, repository } = fixture();
  await repository.createDefect({ id: "BUG-2", title: "before", severity: "low", status: "new", version: 1 });

  const updated = await repository.updateDefect("BUG-2", 1, {
    title: "after",
    severity: "high",
    status: "confirmed",
  });
  assert.equal(updated.changes, 1);
  const after = await repository.findDefect("BUG-2");
  assert.equal(after.title, "after");
  assert.equal(after.severity, "high");
  assert.equal(after.status, "confirmed");
  assert.equal(after.version, 2);

  const stale = await repository.updateDefect("BUG-2", 1, { title: "lost update" });
  assert.equal(stale.changes, 0);
  assert.equal((await repository.findDefect("BUG-2")).title, "after");
  runtime.close();
});

test("defect and derived task deletion roll back when audit fails", async () => {
  const { runtime, access, repository } = fixture();
  await repository.createDefect({ id: "BUG-3", title: "keep", version: 1 });
  await access.insert("tasks", { id: "TASK-3", source_type: "defect", source_id: "BUG-3" });

  await assert.rejects(
    access.transaction(async () => {
      await repository.deleteDefect("BUG-3");
      throw new Error("delete audit failed");
    }),
    /delete audit failed/,
  );
  assert.equal((await repository.findDefect("BUG-3")).id, "BUG-3");
  assert.equal((await access.row("SELECT id FROM tasks WHERE id = 'TASK-3'")).id, "TASK-3");
  runtime.close();
});
