const { filterAsync, mapAsync } = require("../../lib/asyncIter");
function createDashboardService({
  createAiSummary,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRequirement,
  mapTask,
  projectAccess,
  repository,
  visibleDocumentsForUser,
}) {
  async function build(scope = {}) {
    const { owner, user } = scope;
    const allProjects = (await repository.listProjects()).map(mapProject);
    const projects = await filterAsync(allProjects, async (project) => await projectAccess.canAccessProject(user, project.id));
    const accessibleProjectIds = new Set(projects.map((project) => project.id));
    const tasks = (await repository.listTasksByOwner(owner))
      .map(mapTask)
      .filter((task) => accessibleProjectIds.has(task.projectId));
    const requirements = (await repository.listRequirementsByOwner(owner))
      .map(mapRequirement)
      .filter((requirement) => accessibleProjectIds.has(requirement.projectId));
    const tests = (await repository.listTestCases()).filter((testCase) => accessibleProjectIds.has(testCase.project_id));
    const documents = visibleDocumentsForUser(user, (await repository.listDocuments()).map(mapDocument))
      .filter((document) => !document.projectId || accessibleProjectIds.has(document.projectId));
    const myDefects = owner
      ? (await repository.listDefectsByAssignee(owner)).map(mapDefect).filter((defect) => accessibleProjectIds.has(defect.projectId))
      : [];
    const myBuilds = owner
      ? (await repository.listBuildsByCreator(owner)).map(mapBuild).filter((build) => accessibleProjectIds.has(build.projectId))
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
        projectName: await repository.findProjectName(requirement.projectId),
      })),
      ai: await createAiSummary("dashboard", {
        ...metrics,
        totalJobs: await repository.countAiJobs(),
        logAnalysis: await repository.countWorkLogs(),
      }, {
        cacheKey: `${user?.id || owner || user?.role || "dashboard"}:${[...accessibleProjectIds].sort().join(",") || "none"}`,
        projectIds: [...accessibleProjectIds],
        backgroundRefresh: true,
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
