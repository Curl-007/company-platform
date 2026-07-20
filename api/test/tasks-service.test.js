const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSprintCreate, buildTaskCreate, buildTaskUpdate, dependencyIdsFor, normalizeDependencyIds } = require("../src/modules/tasks/service");

test("task service normalizes dependencies and preserves task update fields", () => {
  assert.deepEqual(normalizeDependencyIds([" TASK-1 ", "TASK-1", "", null, "TASK-2"]), ["TASK-1", "TASK-2"]);
  assert.deepEqual(dependencyIdsFor({ dependency_ids: '["TASK-1", "TASK-1", "TASK-2"]' }), ["TASK-1", "TASK-2"]);
  assert.deepEqual(dependencyIdsFor({ dependency_ids: "not-json" }), []);

  const sprint = buildSprintCreate({ name: "  Sprint 1 ", goal: "Capacity baseline" }, { id: "SPR-001", projectId: "PRJ-001" });
  assert.equal(sprint.name, "Sprint 1");
  assert.equal(sprint.status, "planned");

  const created = buildTaskCreate(
    { title: "Plan capacity", estimatedHours: 8, dependencyIds: ["TASK-0", "TASK-0"] },
    { id: "TASK-001", projectId: "PRJ-001", dueDate: "2026-07-13", sortOrder: 1, json: JSON.stringify },
  );
  assert.equal(created.status, "todo");
  assert.equal(created.remaining_hours, 8);
  assert.deepEqual(JSON.parse(created.dependency_ids), ["TASK-0"]);

  const updated = buildTaskUpdate(created, { owner: "Developer", status: "in_progress" }, { expectedVersion: 1, json: JSON.stringify });
  assert.equal(updated.title, "Plan capacity");
  assert.equal(updated.owner, "Developer");
  assert.equal(updated.statusText, "in progress");
  assert.equal(updated.expectedVersion, 1);
  assert.equal(updated.dependencyIds, created.dependency_ids);
});
