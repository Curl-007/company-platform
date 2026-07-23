const assert = require("node:assert/strict");
const test = require("node:test");
const { createDashboardRepository } = require("../src/modules/dashboard/repository");
const { createDashboardService } = require("../src/modules/dashboard/service");

test("dashboard service scopes project data before aggregating personal metrics", async () => {
  const service = createDashboardService({
    createAiSummary: async (type, metrics) => ({ type, metrics }),
    mapBuild: (item) => item,
    mapDefect: (item) => item,
    mapDocument: (item) => item,
    mapProject: (item) => item,
    mapRequirement: (item) => item,
    mapTask: (item) => item,
    projectAccess: { canAccessProject: (_user, projectId) => projectId === "PRJ-001" },
    repository: {
      listProjects: () => [
        { id: "PRJ-001", healthScore: 80, riskCount: 2 },
        { id: "PRJ-002", healthScore: 20, riskCount: 9 },
      ],
      listTasksByOwner: () => [
        { id: "TSK-001", projectId: "PRJ-001", status: "in_progress" },
        { id: "TSK-002", projectId: "PRJ-002", status: "done" },
      ],
      listRequirementsByOwner: () => [
        { id: "REQ-001", projectId: "PRJ-001", title: "Visible", completion: 60 },
        { id: "REQ-002", projectId: "PRJ-002", title: "Hidden", completion: 100 },
      ],
      listTestCases: () => [
        { project_id: "PRJ-001", total_cases: 10, passed_cases: 8 },
        { project_id: "PRJ-002", total_cases: 10, passed_cases: 10 },
      ],
      listDocuments: () => [{ id: "DOC-001", projectId: "PRJ-001" }],
      listDefectsByAssignee: () => [
        { id: "BUG-001", projectId: "PRJ-001" },
        { id: "BUG-002", projectId: "PRJ-002" },
      ],
      listBuildsByCreator: () => [
        { id: "BLD-001", projectId: "PRJ-001" },
        { id: "BLD-002", projectId: "PRJ-002" },
      ],
      findProjectName: (id) => id === "PRJ-001" ? "Visible project" : id,
      countAiJobs: (scope) => scope.projectIds?.length ? 1 : 0,
      countWorkLogs: (scope) => scope.projectIds?.length ? 2 : 0,
    },
    visibleDocumentsForUser: (_user, documents) => documents,
  });

  const result = await service.build({ accessScope: { projectIds: ["PRJ-001"] }, owner: "Alice", user: { role: "dev" } });
  assert.deepEqual(result.metrics.tasks, { total: 1, in_progress: 1 });
  assert.equal(result.metrics.projectHealthAverage, 80);
  assert.equal(result.metrics.requirementCompletionAverage, 60);
  assert.equal(result.metrics.testPassRate, 80);
  assert.equal(result.metrics.openRisks, 2);
  assert.equal(result.focusTasks.length, 1);
  assert.equal(result.requirementProgress[0].projectName, "Visible project");
  assert.deepEqual(result.myDefects.map((item) => item.id), ["BUG-001"]);
  assert.deepEqual(result.myBuilds.map((item) => item.id), ["BLD-001"]);
  assert.equal(result.ai.metrics.totalJobs, 1);
  assert.equal(result.ai.metrics.logAnalysis, 2);

  const denied = await service.build({ owner: "Alice", user: { role: "dev" } });
  assert.equal(denied.metrics.tasks.total, 0);
  assert.equal(denied.riskyProjects.length, 0);
  assert.equal(denied.ai.metrics.totalJobs, 0);
});

test("dashboard repository scopes SQL by project id and fails closed without scope", async () => {
  const calls = [];
  const repository = createDashboardRepository({
    row: async (sql, params) => {
      calls.push({ sql, params });
      return { c: 2 };
    },
    rows: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    },
  });
  assert.deepEqual(await repository.listProjects(), []);
  assert.equal(calls.length, 0);

  await repository.listTasksByOwner("Alice", { projectIds: ["PRJ-1"] });
  await repository.countWorkLogs({ projectIds: ["PRJ-1"] });
  await repository.countAiJobs({ projectIds: ["PRJ-1"] });
  assert.match(calls[0].sql, /project_id IN \(@projectId0\)/);
  assert.equal(calls[0].params.projectId0, "PRJ-1");
  assert.match(calls[1].sql, /FROM work_logs WHERE project_id IN/);
  assert.match(calls[2].sql, /FROM ai_jobs j/);
  assert.match(calls[2].sql, /COALESCE/);
});
