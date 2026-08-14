const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildRequirementCreate,
  buildRequirementUpdate,
  validateRequirementCreate,
  validateRequirementUpdate,
} = require("../src/modules/requirements/service");
const {
  REQUIREMENT_ASSIGNMENT_STATUSES,
  openApiRequirementSchemas,
} = require("../src/modules/requirements/schema");

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

test("requirement create schema rejects empty title and invalid enums", () => {
  assert.equal(validateRequirementCreate({}).ok, false);
  assert.equal(validateRequirementCreate({ title: "  ", projectId: "PRJ-1" }).ok, false);
  assert.equal(validateRequirementCreate({ title: "ok", projectId: "" }).ok, false);
  assert.equal(validateRequirementCreate({ title: "ok", projectId: "PRJ-1", priority: "urgent" }).ok, false);
  assert.equal(validateRequirementCreate({ title: "ok", projectId: "PRJ-1", assigneeRole: "admin" }).ok, false);
  assert.equal(
    validateRequirementCreate({ title: "ok", projectId: "PRJ-1", acceptanceCriteria: "not-array" }).ok,
    false,
  );

  const ok = validateRequirementCreate({
    title: "  New capability ",
    projectId: "PRJ-1",
    priority: "high",
    acceptanceCriteria: [" a ", "b"],
    assigneeRole: "dev",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.title, "New capability");
  assert.deepEqual(ok.data.acceptanceCriteria, ["a", "b"]);
});

test("requirement update schema enforces title, assignmentStatus, completion, and version", () => {
  assert.equal(validateRequirementUpdate({ title: "x" }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 0, title: "x" }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1.5, title: "x" }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, title: "   " }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, assignmentStatus: "in_progress" }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, completion: -1 }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, completion: 101 }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, completion: 12.5 }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, acceptanceCriteria: { a: 1 } }).ok, false);
  assert.equal(validateRequirementUpdate({ version: 1, unknownField: true }).ok, false);

  const ok = validateRequirementUpdate({
    version: 3,
    title: " Renamed ",
    assignmentStatus: "assigned",
    completion: 40,
    acceptanceCriteria: ["one"],
    productId: " PROD-1 ",
    portfolioId: null,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.title, "Renamed");
  assert.equal(ok.data.assignmentStatus, "assigned");
  assert.equal(ok.data.completion, 40);
  assert.deepEqual(ok.data.acceptanceCriteria, ["one"]);
  assert.equal(ok.data.productId, "PROD-1");
  assert.equal(ok.data.portfolioId, null);
  assert.equal(validateRequirementUpdate({ version: 1, productId: {} }).ok, false);

  const versionOnly = validateRequirementUpdate({ version: 2 });
  assert.equal(versionOnly.ok, true);
  assert.equal(versionOnly.data.version, 2);

  assert.deepEqual(REQUIREMENT_ASSIGNMENT_STATUSES, ["unassigned", "assigned"]);
  const contract = openApiRequirementSchemas();
  assert.deepEqual(contract.updateRequired, ["version"]);
  assert.deepEqual(contract.assignmentStatuses, ["unassigned", "assigned"]);
});

test("buildRequirementUpdate keeps validated completion without coercing invalid values to zero", () => {
  const before = {
    id: "REQ-1",
    title: "T",
    description: "",
    priority: "medium",
    acceptance_criteria: "[]",
    product_id: "PROD-1",
    portfolio_id: "PORT-1",
    parent_id: null,
    assignee: null,
    assignee_role: null,
    assignment_status: "unassigned",
    completion: 10,
  };
  const next = buildRequirementUpdate(
    before,
    { completion: 0, assignmentStatus: "assigned" },
    { expectedVersion: 1, json: JSON.stringify },
  );
  assert.equal(next.completion, 0);
  assert.equal(next.assignmentStatus, "assigned");
  assert.equal(next.productId, "PROD-1");
  assert.equal(next.portfolioId, "PORT-1");
});
