function createTestCaseTaskSync({ row, run, insert, nextId }) {
  function syncTestCaseTask(testCaseRow) {
    const existing = row(
      "SELECT * FROM tasks WHERE source_type = 'test_case' AND source_id = @sourceId",
      { sourceId: testCaseRow.id },
    );
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
      run(
        `UPDATE tasks SET
          title = @title,
          status = @status,
          status_text = @status_text,
          project_id = @project_id,
          owner = @owner,
          description = @description,
          requirement_id = @requirement_id,
          progress = @progress,
          blocker = @blocker,
          remaining_hours = @remaining_hours,
          kanban_column = @kanban_column,
          assignee_role = @assignee_role,
          version = version + 1
        WHERE id = @id`,
        {
          id: existing.id,
          title: taskPayload.title,
          status: taskPayload.status,
          status_text: taskPayload.status_text,
          project_id: taskPayload.project_id,
          owner: taskPayload.owner,
          description: taskPayload.description,
          requirement_id: taskPayload.requirement_id,
          progress: taskPayload.progress,
          blocker: taskPayload.blocker,
          remaining_hours: taskPayload.remaining_hours,
          kanban_column: taskPayload.kanban_column,
          assignee_role: taskPayload.assignee_role,
        },
      );
      return existing.id;
    }

    const taskId = nextId("TASK", "tasks");
    insert("tasks", { id: taskId, ...taskPayload });
    return taskId;
  }

  return { syncTestCaseTask };
}

module.exports = { createTestCaseTaskSync };
