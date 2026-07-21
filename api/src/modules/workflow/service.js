const { evaluateStageGate } = require("../../workflow/gateRules");

function createProjectFlowService({ row, rows, getProjectBinding, getTemplate }) {
  async function evaluateProjectFlow(projectId) {
    const project = await row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    if (!project) return null;

    const binding = typeof getProjectBinding === "function"
      ? await getProjectBinding(projectId)
      : { templateId: "fixed-project-delivery-v1", templateVersion: "2026-07-15", source: "default" };
    const template = typeof getTemplate === "function"
      ? await getTemplate(binding.templateId)
      : null;

    const reqs = await rows("SELECT status FROM requirements WHERE project_id = @pid AND deleted_at IS NULL", { pid: projectId });
    const tasks = await rows("SELECT status, estimated_hours, actual_hours, remaining_hours FROM tasks WHERE project_id = @pid", { pid: projectId });
    const defects = await rows("SELECT status, severity FROM defects WHERE project_id = @pid", { pid: projectId });
    const tests = await rows("SELECT total_cases, passed_cases, failed_cases, blocked_cases FROM test_cases WHERE project_id = @pid", { pid: projectId });
    const docs = await rows("SELECT type, ai_status FROM documents", {});
    const designDocs = docs.filter((d) => d.type === "design");
    const testDocs = docs.filter((d) => d.type === "test");

    const reqTotal = reqs.length;
    const reqApproved = reqs.filter((r) => ["approved", "in_dev", "testing", "accepted", "closed"].includes(r.status)).length;
    const reqApprovedRatio = reqTotal > 0 ? reqApproved / reqTotal : 0;

    const taskTotal = tasks.length;
    const taskDone = tasks.filter((t) => t.status === "done").length;
    const taskBlocked = tasks.filter((t) => t.status === "blocked").length;
    const taskCompletion = taskTotal > 0 ? taskDone / taskTotal : 0;
    const estSum = tasks.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
    const consumedSum = tasks.reduce((sum, task) => sum + (Number(task.actual_hours) || 0), 0);
    const leftSum = tasks.reduce((sum, task) => sum + (Number(task.remaining_hours) || 0), 0);

    const defTotal = defects.length;
    const defBlocked = defects.filter((defect) => ["new", "confirmed", "in_fix"].includes(defect.status)).length;
    const defCritical = defects.filter((defect) => defect.severity === "critical" && defect.status !== "closed" && defect.status !== "rejected").length;
    const defClosed = defects.filter((defect) => defect.status === "closed" || defect.status === "verified").length;
    const testCaseCount = tests.length;
    const plannedCaseTotal = tests.reduce((sum, testCase) => sum + (Number(testCase.total_cases) || 0), 0);
    const executedCaseTotal = tests.reduce((sum, testCase) =>
      sum + (Number(testCase.passed_cases) || 0) + (Number(testCase.failed_cases) || 0) + (Number(testCase.blocked_cases) || 0), 0);
    const tcTotal = plannedCaseTotal > 0 ? plannedCaseTotal : executedCaseTotal;
    const tcPassed = tests.reduce((sum, testCase) => sum + (Number(testCase.passed_cases) || 0), 0);
    const testPassRate = tcTotal > 0 ? tcPassed / tcTotal : 0;

    const releasedRelease = project.product_id
      ? await row("SELECT id FROM releases WHERE product_id = @pid AND status = 'released' LIMIT 1", { pid: project.product_id })
      : await row("SELECT id FROM releases WHERE status = 'released' LIMIT 1", {});
    const hasRelease = Boolean(releasedRelease);

    const metrics = {
      projectNotPlanning: project.status !== "planning",
      requirementTotal: reqTotal,
      requirementApprovedRatio: reqApprovedRatio,
      designDocCount: designDocs.length,
      taskTotal,
      taskCompletionRatio: taskCompletion,
      taskBlockedCount: taskBlocked,
      defectBlockingCount: defBlocked,
      defectCriticalOpenCount: defCritical,
      acceptanceDocCount: testDocs.length,
      testPassRatio: testPassRate,
      hasRelease,
      releaseId: releasedRelease?.id || null,
    };

    const stageCatalog = Array.isArray(template?.stages) && template.stages.length
      ? template.stages
      : [
          { id: "initiation", label: "立项" },
          { id: "requirement", label: "需求" },
          { id: "design", label: "设计" },
          { id: "development", label: "开发" },
          { id: "testing", label: "测试" },
          { id: "acceptance", label: "验收" },
          { id: "release", label: "发布" },
        ];

    const gates = [];
    for (let index = 0; index < stageCatalog.length; index += 1) {
      const stage = stageCatalog[index];
      const priorStagesPassed = gates.every((gate) => gate.state === "passed" || gate.state === "done");
      const gate = evaluateStageGate(stage, metrics, { priorStagesPassed, stageIndex: index });
      // Preserve legacy "done" for initiation-like success when project is active.
      if (gate.stage === "initiation" && gate.state === "passed" && metrics.projectNotPlanning) {
        gate.state = "done";
      }
      gates.push(gate);
    }

    return {
      projectId,
      projectName: project.name,
      status: project.status,
      healthScore: project.health_score,
      workflow: {
        templateId: template?.id || binding.templateId,
        templateName: template?.name || null,
        templateVersion: template?.version || binding.templateVersion,
        bindingSource: binding.source || "default",
        mode: template?.mode || "fixed",
      },
      gates,
      defectFunnel: {
        new: defects.filter((defect) => defect.status === "new").length,
        confirmed: defects.filter((defect) => defect.status === "confirmed").length,
        in_fix: defects.filter((defect) => defect.status === "in_fix").length,
        resolved: defects.filter((defect) => defect.status === "resolved").length,
        closed: defClosed,
        total: defTotal,
      },
      hours: { estimated: estSum, consumed: consumedSum, remaining: leftSum },
      counts: { requirements: reqTotal, tasks: taskTotal, defects: defTotal, testCases: testCaseCount },
      metrics,
    };
  }

  return { evaluateProjectFlow };
}

module.exports = {
  createProjectFlowService,
};
