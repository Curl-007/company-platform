const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDefectCreate } = require("../src/modules/defects/service");

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
});
