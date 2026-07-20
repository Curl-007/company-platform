const assert = require("node:assert/strict");
const test = require("node:test");
const { createWorkLogHelpers } = require("../src/modules/workLogs/service");

function normalizeRole(role) {
  return ["admin", "pm", "pdm", "dev", "qa"].includes(role) ? role : "dev";
}

test("work log helpers preserve weekly summary and collaboration boundaries", async () => {
  const fixtures = {
    projects: [{ id: "PRJ-001", name: "Alpha", owner: "Pat" }],
    users: [{ id: "USR-PM", name: "Pat", role: "pm", status: "active" }],
    project_members: [{ project_id: "PRJ-001", user_name: "Dev A", role: "dev" }],
    requirements: [{ project_id: "PRJ-001", assignee: "Pdm A", assignee_role: "pdm", deleted_at: null }],
    tasks: [{ project_id: "PRJ-001", owner: "Dev B", assignee_role: "dev" }],
    test_cases: [{ project_id: "PRJ-001", owner: "Qa A" }],
    defects: [{ project_id: "PRJ-001", assignee: "Qa B", assignee_role: "qa" }],
  };

  const row = (sql, params = {}) => {
    if (sql.includes("FROM projects WHERE id")) return fixtures.projects.find((item) => item.id === params.id) || null;
    if (sql.includes("FROM projects WHERE name")) return fixtures.projects.find((item) => item.name === params.name) || null;
    if (sql.includes("FROM users WHERE name")) return fixtures.users.find((item) => item.name === params.name && item.status === "active") || null;
    return null;
  };
  const rows = (sql, params = {}) => {
    if (sql.includes("FROM project_members")) return fixtures.project_members.filter((item) => item.project_id === params.projectId);
    if (sql.includes("FROM requirements")) return fixtures.requirements.filter((item) => item.project_id === params.projectId && item.deleted_at === null);
    if (sql.includes("FROM tasks")) return fixtures.tasks.filter((item) => item.project_id === params.projectId);
    if (sql.includes("FROM test_cases")) return fixtures.test_cases.filter((item) => item.project_id === params.projectId);
    if (sql.includes("FROM defects")) return fixtures.defects.filter((item) => item.project_id === params.projectId);
    return [];
  };

  const helpers = createWorkLogHelpers({
    normalizeRole,
    parse: (value, fallback) => value ? JSON.parse(value) : fallback,
    row,
    rows,
  });

  assert.equal(helpers.canSubmitDailyLog({ role: "admin" }), false);
  assert.equal(helpers.canSubmitDailyLog({ role: "dev" }), true);
  assert.equal(helpers.canViewTeamLogs({ role: "pm" }), true);
  assert.equal(helpers.canViewTeamLogs({ role: "qa" }), false);

  const summary = helpers.buildWeeklySummary([
    {
      analysis: JSON.stringify({
        completedItems: ["完成接口", "完成接口"],
        blockers: ["等待联调"],
        linkedRequirements: [{ id: "REQ-001", title: "登录" }],
      }),
      next_plan: "继续测试",
    },
  ]);
  assert.deepEqual(summary.completedItems, ["完成接口"]);
  assert.deepEqual(summary.blockers, ["等待联调"]);
  assert.deepEqual(summary.nextPlans, ["继续测试"]);
  assert.deepEqual(summary.linkedRequirements, [{ id: "REQ-001", title: "登录" }]);

  assert.deepEqual(await helpers.resolveWorkLogProjectFilter({ projectId: "PRJ-001" }), { id: "PRJ-001", name: "Alpha" });
  assert.equal(helpers.workLogMatchesProject({ projectId: "PRJ-001", project: "Alpha" }, { id: "PRJ-001", name: "Alpha" }), true);
  assert.equal(helpers.workLogMatchesProject({ projectId: "PRJ-002", project: "Beta" }, { id: "PRJ-001", name: "Alpha" }), false);

  const members = await helpers.collectProjectMembers({ id: "PRJ-001", name: "Alpha" });
  assert.deepEqual(
    members.map((item) => `${item.name}:${item.role}`).sort(),
    ["Dev A:dev", "Dev B:dev", "Pdm A:pdm", "Qa A:qa", "Qa B:qa"],
  );

  const teamSummary = helpers.buildTeamWeeklySummary([
    { author: "Dev A", role: "dev", analysis: JSON.stringify({ completedItems: ["A"], blockers: [] }) },
  ], [{ name: "Qa A", role: "qa" }], "2026-07-13", "Alpha");
  assert.equal(teamSummary.project, "Alpha");
  assert.equal(teamSummary.submittedCount, 1);
  assert.equal(teamSummary.missingCount, 1);
  assert.equal(teamSummary.members[0].author, "Dev A");
});
