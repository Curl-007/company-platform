const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildDefectCreate,
  buildDefectHandoffUpdate,
  resolveDefectHandoffAction,
} = require("../src/modules/defects/service");

test("defect service builds normalized creation defaults", () => {
  const defect = buildDefectCreate(
    { title: "  Login regression ", projectId: "PRJ-001", assignee: "Developer", foundInBuild: "BLD-001", reporter: "Untrusted reporter" },
    { id: "BUG-001", reporter: "Reporter" },
  );
  assert.equal(defect.title, "Login regression");
  assert.equal(defect.severity, "medium");
  assert.equal(defect.status, "new");
  assert.equal(defect.assignee_role, "dev");
  assert.equal(defect.reporter, "Reporter");
  assert.equal(defect.found_in_build, "BLD-001");
  assert.equal(defect.version, 1);
});

test("defect handoff action derives status and rejects free-form overrides at service layer", () => {
  const toDev = resolveDefectHandoffAction("assign_to_dev");
  assert.equal(toDev.targetRole, "dev");
  assert.equal(toDev.deriveStatus("new"), "in_fix");
  assert.equal(toDev.deriveStatus("in_fix"), "in_fix");
  assert.equal(toDev.deriveStatus("resolved"), "in_fix");

  const toQa = resolveDefectHandoffAction("assign_to_qa");
  assert.equal(toQa.targetRole, "qa");
  assert.equal(toQa.deriveStatus("in_fix"), "resolved");
  assert.equal(toQa.deriveStatus("resolved"), "resolved");

  assert.equal(resolveDefectHandoffAction("close"), null);
  assert.equal(resolveDefectHandoffAction(""), null);

  const next = buildDefectHandoffUpdate(
    { id: "BUG-1", status: "new", version: 1 },
    { expectedVersion: 1, assignee: "开发工程师", assigneeRole: "dev", status: "in_fix" },
  );
  assert.deepEqual(next, {
    id: "BUG-1",
    expectedVersion: 1,
    assignee: "开发工程师",
    assigneeRole: "dev",
    status: "in_fix",
  });
});
