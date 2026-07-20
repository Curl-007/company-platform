const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PROJECT_STATUSES,
  publicEnums,
} = require("../src/domain/enums");

test("public enum catalog exposes stable copies for shared contracts", () => {
  const first = publicEnums();
  assert.deepEqual(first.projectStatuses, ["planning", "active", "on_hold", "done", "archived"]);
  assert.deepEqual(first.requirementStatuses, ["draft", "reviewing", "approved", "in_dev", "testing", "accepted", "closed", "cancelled"]);
  assert.deepEqual(first.taskTypes, ["epic", "story", "task", "bug", "milestone", "work_package"]);
  assert.deepEqual(first.userRoles, ["admin", "pm", "pdm", "dev", "qa"]);
  assert.deepEqual(first.aiJobStatuses, ["queued", "running", "awaiting_review", "confirmed", "rejected", "failed", "retried"]);

  first.projectStatuses.push("mutated");
  assert.deepEqual(PROJECT_STATUSES, ["planning", "active", "on_hold", "done", "archived"]);
  assert.deepEqual(publicEnums().projectStatuses, ["planning", "active", "on_hold", "done", "archived"]);
});
