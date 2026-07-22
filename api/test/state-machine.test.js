const assert = require("node:assert/strict");
const test = require("node:test");
const { allowedTransitions, canTransition, isKnownStatus } = require("../src/workflow/stateMachine");

test("state machine accepts only known statuses and configured transitions", () => {
  assert.equal(isKnownStatus("project", "active"), true);
  assert.equal(isKnownStatus("project", "unknown"), false);
  assert.deepEqual(allowedTransitions("project", "planning"), ["active", "on_hold", "archived"]);

  assert.equal(canTransition("project", "planning", "active"), true);
  assert.equal(canTransition("project", "planning", "done"), false);
  assert.equal(canTransition("requirement", "draft", "accepted"), false);
  assert.equal(canTransition("requirement", "testing", "accepted"), true);
  assert.equal(canTransition("task", "todo", "done"), false);
  assert.equal(canTransition("task", "in_progress", "code_review"), true);
  // DEV submit for testing / QA return for fix
  assert.equal(canTransition("task", "in_progress", "testing"), true);
  assert.equal(canTransition("task", "testing", "in_progress"), true);
  assert.equal(canTransition("sprint", "planned", "active"), true);
  assert.equal(canTransition("sprint", "closed", "active"), false);
  assert.equal(canTransition("aiJob", "queued", "running"), true);
  assert.equal(canTransition("aiJob", "running", "awaiting_review"), true);
  assert.equal(canTransition("aiJob", "awaiting_review", "confirmed"), true);
  assert.equal(canTransition("aiJob", "confirmed", "retried"), false);
  assert.equal(canTransition("aiJob", "failed", "retried"), true);
  assert.equal(canTransition("aiJob", "retried", "queued"), true);
});
