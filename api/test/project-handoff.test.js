const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveProjectHandoffTarget } = require("../src/lib/projectHandoff");

function createRepo({ users = [], members = [] } = {}) {
  return {
    findActiveUserById: async (id) => users.find((user) => user.id === id && user.status !== "disabled") || null,
    findActiveUserByName: async (name) => users.find((user) => user.name === name && user.status !== "disabled") || null,
    listProjectMembers: async () => members,
  };
}

test("resolveProjectHandoffTarget accepts explicit project member with matching role", async () => {
  const repo = createRepo({
    users: [{ id: "USR-DEV", name: "开发工程师", role: "dev" }],
    members: [{ user_id: "USR-DEV", user_name: "开发工程师", role: "dev" }],
  });
  const result = await resolveProjectHandoffTarget(repo, "PRJ-1", {
    assigneeName: "开发工程师",
    targetRole: "dev",
  });
  assert.equal(result.ok, true);
  assert.equal(result.user.id, "USR-DEV");
  assert.equal(result.user.role, "dev");
});

test("resolveProjectHandoffTarget rejects global active user who is not a project member", async () => {
  const repo = createRepo({
    users: [
      { id: "USR-DEV", name: "开发工程师", role: "dev" },
      { id: "USR-OUTSIDER", name: "外部开发", role: "dev" },
    ],
    members: [{ user_id: "USR-DEV", user_name: "开发工程师", role: "dev" }],
  });
  const result = await resolveProjectHandoffTarget(repo, "PRJ-1", {
    assigneeName: "外部开发",
    targetRole: "dev",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NOT_PROJECT_MEMBER");
});

test("resolveProjectHandoffTarget rejects admin/PM masquerading as dev/qa without membership role", async () => {
  const repo = createRepo({
    users: [{ id: "USR-ADMIN", name: "系统管理员", role: "admin" }],
    members: [{ user_id: "USR-ADMIN", user_name: "系统管理员", role: "pm" }],
  });
  const asDev = await resolveProjectHandoffTarget(repo, "PRJ-1", {
    assigneeId: "USR-ADMIN",
    targetRole: "dev",
  });
  assert.equal(asDev.ok, false);
  assert.equal(asDev.reason, "ROLE_MISMATCH");

  const asQa = await resolveProjectHandoffTarget(repo, "PRJ-1", {
    assigneeName: "系统管理员",
    targetRole: "qa",
  });
  assert.equal(asQa.ok, false);
  assert.equal(asQa.reason, "ROLE_MISMATCH");
});

test("resolveProjectHandoffTarget auto-picks sole matching project role member when target omitted", async () => {
  const repo = createRepo({
    users: [
      { id: "USR-QA", name: "测试工程师", role: "qa" },
      { id: "USR-DEV", name: "开发工程师", role: "dev" },
    ],
    members: [
      { user_id: "USR-QA", user_name: "测试工程师", role: "qa" },
      { user_id: "USR-DEV", user_name: "开发工程师", role: "dev" },
    ],
  });
  const result = await resolveProjectHandoffTarget(repo, "PRJ-1", { targetRole: "qa" });
  assert.equal(result.ok, true);
  assert.equal(result.user.id, "USR-QA");
});

test("resolveProjectHandoffTarget does not silently auto-pick when explicit unknown name is provided", async () => {
  const repo = createRepo({
    users: [{ id: "USR-DEV", name: "开发工程师", role: "dev" }],
    members: [{ user_id: "USR-DEV", user_name: "开发工程师", role: "dev" }],
  });
  const result = await resolveProjectHandoffTarget(repo, "PRJ-1", {
    assigneeName: "不存在的用户",
    targetRole: "dev",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "USER_NOT_FOUND");
});
