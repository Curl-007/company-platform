const { mapAsync } = require("../../lib/asyncIter");
function createDashboardService({
  createAiSummary,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRequirement,
  mapTask,
  repository,
  visibleDocumentsForUser,
}) {
  async function build(scope = {}) {
    const { accessScope, owner, skipCache = false, user } = scope;
    const requestedProjectIds = accessScope?.all === true
      ? null
      : new Set(Array.isArray(accessScope?.projectIds) ? accessScope.projectIds.map(String) : []);
    const projects = (await repository.listProjects(accessScope))
      .map(mapProject)
      .filter((project) => requestedProjectIds === null || requestedProjectIds.has(project.id));
    const accessibleProjectIds = new Set(projects.map((project) => project.id));
    const effectiveAccessScope = accessScope?.all === true
      ? { all: true }
      : { projectIds: [...accessibleProjectIds].sort() };
    const tasks = (await repository.listTasksByOwner(owner, effectiveAccessScope))
      .map(mapTask)
      .filter((task) => accessibleProjectIds.has(task.projectId));
    const requirements = (await repository.listRequirementsByOwner(owner, effectiveAccessScope))
      .map(mapRequirement)
      .filter((requirement) => accessibleProjectIds.has(requirement.projectId));
    const tests = (await repository.listTestCases(effectiveAccessScope)).filter((testCase) => accessibleProjectIds.has(testCase.project_id));
    const documents = visibleDocumentsForUser(user, (await repository.listDocuments(effectiveAccessScope)).map(mapDocument))
      .filter((document) => !document.projectId || accessibleProjectIds.has(document.projectId));
    const myDefects = owner
      ? (await repository.listDefectsByAssignee(owner, effectiveAccessScope)).map(mapDefect).filter((defect) => accessibleProjectIds.has(defect.projectId))
      : [];
    const myBuilds = owner
      ? (await repository.listBuildsByCreator(owner, effectiveAccessScope)).map(mapBuild).filter((build) => accessibleProjectIds.has(build.projectId))
      : [];

    const taskCounts = tasks.reduce((counts, task) => {
      counts.total += 1;
      counts[task.status] = (counts[task.status] || 0) + 1;
      return counts;
    }, { total: 0 });
    const projectHealthAverage = projects.length
      ? Math.round(projects.reduce((sum, project) => sum + project.healthScore, 0) / projects.length)
      : 0;
    const requirementCompletionAverage = requirements.length
      ? Math.round(requirements.reduce((sum, requirement) => sum + requirement.completion, 0) / requirements.length)
      : 0;
    const totalCases = tests.reduce((sum, test) => sum + test.total_cases, 0);
    const passedCases = tests.reduce((sum, test) => sum + test.passed_cases, 0);
    const myProjectIds = new Set(tasks.map((task) => task.projectId));
    const riskyProjects = (owner ? projects.filter((project) => myProjectIds.has(project.id)) : projects)
      .filter((project) => project.riskCount > 0)
      .sort((left, right) => right.riskCount - left.riskCount);
    const metrics = {
      tasks: taskCounts,
      projectHealthAverage,
      requirementCompletionAverage,
      testPassRate: totalCases ? Math.round((passedCases / totalCases) * 100) : 0,
      openRisks: riskyProjects.reduce((sum, project) => sum + project.riskCount, 0),
      documentCount: documents.length,
    };
    const result = {
      metrics,
      focusTasks: tasks,
      riskyProjects,
      requirementProgress: await mapAsync(requirements, async (requirement) => ({
        id: requirement.id,
        title: requirement.title,
        completion: requirement.completion,
        projectId: requirement.projectId,
        projectName: await repository.findProjectName(requirement.projectId, effectiveAccessScope),
      })),
      ai: await createAiSummary("dashboard", {
        ...metrics,
        totalJobs: await repository.countAiJobs(effectiveAccessScope),
        logAnalysis: await repository.countWorkLogs(effectiveAccessScope),
      }, {
        cacheKey: `${user?.id || owner || user?.role || "dashboard"}:${[...accessibleProjectIds].sort().join(",") || "none"}`,
        accessScope: effectiveAccessScope,
        backgroundRefresh: !skipCache,
        skipCache,
        timeoutMs: 14000,
      }),
    };
    if (owner) {
      result.myDefects = myDefects;
      result.myBuilds = myBuilds;
    }
    return result;
  }

  return { build };
}

module.exports = { createDashboardService };
