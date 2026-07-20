const assert = require("node:assert/strict");
const test = require("node:test");
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
      countAiJobs: () => 3,
      countWorkLogs: () => 5,
    },
    visibleDocumentsForUser: (_user, documents) => documents,
  });

  const result = await service.build({ owner: "Alice", user: { role: "dev" } });
  assert.deepEqual(result.metrics.tasks, { total: 1, in_progress: 1 });
  assert.equal(result.metrics.projectHealthAverage, 80);
  assert.equal(result.metrics.requirementCompletionAverage, 60);
  assert.equal(result.metrics.testPassRate, 80);
  assert.equal(result.metrics.openRisks, 2);
  assert.equal(result.focusTasks.length, 1);
  assert.equal(result.requirementProgress[0].projectName, "Visible project");
  assert.deepEqual(result.myDefects.map((item) => item.id), ["BUG-001"]);
  assert.deepEqual(result.myBuilds.map((item) => item.id), ["BLD-001"]);
  assert.equal(result.ai.metrics.totalJobs, 3);
  assert.equal(result.ai.metrics.logAnalysis, 5);
});
