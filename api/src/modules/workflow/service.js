function createProjectFlowService({ row, rows }) {
  function evaluateProjectFlow(projectId) {
    const project = row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    if (!project) return null;

    const reqs = rows("SELECT status FROM requirements WHERE project_id = @pid AND deleted_at IS NULL", { pid: projectId });
    const tasks = rows("SELECT status, estimated_hours, actual_hours, remaining_hours FROM tasks WHERE project_id = @pid", { pid: projectId });
    const defects = rows("SELECT status, severity FROM defects WHERE project_id = @pid", { pid: projectId });
    const tests = rows("SELECT total_cases, passed_cases, failed_cases, blocked_cases FROM test_cases WHERE project_id = @pid", { pid: projectId });
    const docs = rows("SELECT type, ai_status FROM documents", {});
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

    const gates = [
      {
        stage: "initiation",
        label: "立项",
        state: project.status !== "planning" ? "done" : "in_progress",
        checks: [{ name: "项目已立项", passed: project.status !== "planning" }],
      },
      {
        stage: "requirement",
        label: "需求",
        state: reqTotal === 0 ? "pending" : reqApprovedRatio >= 0.5 ? "passed" : "blocked",
        checks: [{
          name: ">= 50% 需求已批准",
          passed: reqTotal > 0 && reqApprovedRatio >= 0.5,
          detail: reqTotal > 0 ? `${reqApproved}/${reqTotal} 已批准` : "无需求",
        }],
      },
      {
        stage: "design",
        label: "设计",
        state: designDocs.length > 0 ? "passed" : "pending",
        checks: [{ name: "设计文档存在", passed: designDocs.length > 0, detail: designDocs.length > 0 ? `${designDocs.length} 份` : "未上传" }],
      },
      {
        stage: "development",
        label: "开发",
        state: taskTotal === 0 ? "pending" : taskCompletion >= 0.8 ? "passed" : taskCompletion < 0.5 || taskBlocked > 0 ? "blocked" : "in_progress",
        checks: [
          { name: "任务完成率 >= 80%", passed: taskTotal > 0 && taskCompletion >= 0.8, detail: taskTotal > 0 ? `${Math.round(taskCompletion * 100)}% (${taskDone}/${taskTotal})` : "无任务" },
          { name: "无阻塞任务", passed: taskBlocked === 0, detail: taskBlocked > 0 ? `${taskBlocked} 个阻塞` : "无阻塞" },
        ],
      },
      {
        stage: "testing",
        label: "测试",
        state: defTotal === 0 && tcTotal === 0 ? "pending" : defBlocked === 0 && defCritical === 0 ? "passed" : "blocked",
        checks: [
          { name: "阻塞缺陷 = 0", passed: defBlocked === 0, detail: defBlocked > 0 ? `${defBlocked} 个未关闭` : "已清零" },
          { name: "无未关闭严重缺陷", passed: defCritical === 0, detail: defCritical > 0 ? `${defCritical} 个严重` : "无" },
        ],
      },
      {
        stage: "acceptance",
        label: "验收",
        state: testDocs.length === 0 ? "pending" : testPassRate >= 0.8 ? "passed" : "in_progress",
        checks: [
          { name: "验收文档存在", passed: testDocs.length > 0, detail: testDocs.length > 0 ? `${testDocs.length} 份` : "未上传" },
          { name: "测试通过率 >= 80%", passed: testPassRate >= 0.8, detail: tcTotal > 0 ? `${Math.round(testPassRate * 100)}%` : "无测试数据" },
        ],
      },
      {
        stage: "release",
        label: "发布",
        state: "pending",
        checks: [
          { name: "前置门禁全部通过", passed: false, detail: "待前置阶段完成" },
          { name: "存在已发布记录", passed: false, detail: "无发布记录" },
        ],
      },
    ];

    const priorPassed = gates.slice(0, 6).every((gate) => gate.state === "passed" || gate.state === "done");
    const releasedRelease = project.product_id
      ? row("SELECT id FROM releases WHERE product_id = @pid AND status = 'released' LIMIT 1", { pid: project.product_id })
      : row("SELECT id FROM releases WHERE status = 'released' LIMIT 1", {});
    const hasRelease = Boolean(releasedRelease);
    gates[6].checks[0].passed = priorPassed;
    gates[6].checks[0].detail = priorPassed ? "全部前置门禁已通过" : "前置阶段未全部通过";
    gates[6].checks[1].passed = hasRelease;
    gates[6].checks[1].detail = hasRelease ? `存在已发布记录 ${releasedRelease.id}` : "无已发布记录";
    gates[6].state = priorPassed && hasRelease ? "passed" : priorPassed ? "in_progress" : "pending";

    return {
      projectId,
      projectName: project.name,
      status: project.status,
      healthScore: project.health_score,
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
    };
  }

  return { evaluateProjectFlow };
}

module.exports = {
  createProjectFlowService,
};
