const assert = require("node:assert/strict");
const test = require("node:test");
const { createRequirementPolicy } = require("../src/modules/requirements/policy");

test("requirement policy keeps write, permission, and assignee boundaries distinct", async () => {
  const policy = createRequirementPolicy({
    canWriteProject: async (_user, projectId) => projectId === "PRJ-1",
    hasPermission: (user, permission) => user.permissions?.includes(permission),
    normalizeRole: (role) => String(role || "").toLowerCase(),
  });
  const requirement = { project_id: "PRJ-1", assignee: "Dev", assignee_role: "dev" };

  assert.equal(await policy.canOperateRequirement(null, requirement), false);
  assert.equal(await policy.canOperateRequirement({ name: "Dev", role: "dev" }, requirement), true);
  assert.equal(await policy.canOperateRequirement({ name: "Other", role: "dev" }, requirement), false);
  assert.equal(await policy.canOperateRequirement({ name: "PM", role: "pm", permissions: ["requirement:*"] }, requirement), true);
  assert.equal(await policy.canOperateRequirement({ name: "Dev", role: "dev" }, { ...requirement, project_id: "PRJ-2" }), false);
});
