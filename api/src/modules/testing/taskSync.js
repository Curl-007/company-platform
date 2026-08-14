const { createTestingRepository } = require("./repository");

function createTestCaseTaskSync({ insert, nextId, repository: suppliedRepository, row, run }) {
  const repository = suppliedRepository || createTestingRepository({ insert, row, run });

  async function syncTestCaseTask(testCaseRow) {
    const existing = await repository.findTestCaseTask(testCaseRow.id);
    const passed = Number(testCaseRow.passed_cases) || 0;
    const failed = Number(testCaseRow.failed_cases) || 0;
    const blocked = Number(testCaseRow.blocked_cases) || 0;
    const total = Math.max(Number(testCaseRow.total_cases) || 0, passed + failed + blocked);
    const progress = total > 0 ? Math.min(100, Math.round((passed / total) * 100)) : 0;
    const completed = progress >= 100 && failed === 0 && blocked === 0;
    const taskPayload = {
      title: `测试执行：${testCaseRow.name}`,
      status: completed ? "done" : progress > 0 ? "testing" : "todo",
      status_text: completed ? "已完成" : progress > 0 ? "测试中" : "待处理",
      project_id: testCaseRow.project_id,
      owner: testCaseRow.owner,
      description: testCaseRow.description || "",
      due_date: null,
      requirement_id: testCaseRow.requirement_id,
      progress,
      blocker: blocked > 0 ? "存在阻塞用例待处理" : failed > 0 ? "存在失败用例待修复" : null,
      type: "task",
      parent_id: null,
      wbs_code: existing?.wbs_code || `TC-${String(testCaseRow.id).replace(/^(TC|TEST)-/, "")}`,
      kanban_column: completed ? "done" : progress > 0 ? "testing" : "todo",
      sort_order: existing?.sort_order || Date.now(),
      estimated_hours: existing?.estimated_hours || 6,
      actual_hours: existing?.actual_hours || 0,
      remaining_hours: completed ? 0 : Math.max(0, (existing?.estimated_hours || 6) - (existing?.actual_hours || 0)),
      assignee_role: testCaseRow.assignee_role || "qa",
      source_type: "test_case",
      source_id: testCaseRow.id,
    };

    if (existing) {
      await repository.updateTestCaseTask(existing.id, taskPayload);
      return existing.id;
    }

    const taskId = await nextId("TASK", "tasks");
    await repository.createTestCaseTask({ id: taskId, ...taskPayload });
    return taskId;
  }

  return { syncTestCaseTask };
}

module.exports = { createTestCaseTaskSync };
