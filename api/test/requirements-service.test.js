const assert = require("node:assert/strict");
const test = require("node:test");
const { buildRequirementCreate, buildRequirementUpdate } = require("../src/modules/requirements/service");

test("requirement service builds creation defaults and preserves absent update fields", () => {
  const created = buildRequirementCreate(
    {
      title: "  Capacity dashboard  ",
      projectId: "PRJ-001",
      owner: "Product Office",
      acceptanceCriteria: ["Show workload risk"],
    },
    { id: "REQ-001", json: JSON.stringify },
  );
  assert.equal(created.title, "Capacity dashboard");
  assert.equal(created.status, "draft");
  assert.equal(created.priority, "medium");
  assert.equal(created.assignment_status, "unassigned");
  assert.equal(created.version, 1);
  assert.deepEqual(JSON.parse(created.acceptance_criteria), ["Show workload risk"]);

  const updated = buildRequirementUpdate(
    created,
    { description: "Surface capacity risks without performance scoring.", assignee: "Developer" },
    { expectedVersion: 1, json: JSON.stringify },
  );
  assert.equal(updated.title, "Capacity dashboard");
  assert.equal(updated.description, "Surface capacity risks without performance scoring.");
  assert.equal(updated.assignee, "Developer");
  assert.equal(updated.assignmentStatus, "unassigned");
  assert.equal(updated.expectedVersion, 1);
  assert.equal(updated.acceptanceCriteria, created.acceptance_criteria);
});
