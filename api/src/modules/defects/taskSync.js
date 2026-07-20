function createDefectTaskSync({ row, run, insert, nextId, closedDefectStatuses }) {
  async function syncDefectTask(defectRow) {
    const existing = await row(
      "SELECT * FROM tasks WHERE source_type = 'defect' AND source_id = @sourceId",
      { sourceId: defectRow.id },
    );
    const assignee = defectRow.assignee || defectRow.reporter || "未分配";
    const status = closedDefectStatuses.has(defectRow.status)
      ? "done"
      : defectRow.status === "resolved"
        ? "testing"
        : defectRow.status === "in_fix"
          ? "in_progress"
          : "todo";
    const taskPayload = {
      title: `缺陷修复：${defectRow.title}`,
      status,
      status_text: status === "done" ? "已关闭" : status === "testing" ? "待验证" : status === "in_progress" ? "修复中" : "待处理",
      project_id: defectRow.project_id,
      owner: assignee,
      description: defectRow.description || "",
      due_date: null,
      requirement_id: defectRow.requirement_id || null,
      progress: status === "done" ? 100 : status === "testing" ? 85 : status === "in_progress" ? 50 : 0,
      blocker: null,
      type: "bug",
      parent_id: null,
      wbs_code: existing?.wbs_code || `BUG-${String(defectRow.id).replace("BUG-", "")}`,
      kanban_column: status === "done" ? "done" : status === "testing" ? "testing" : status === "in_progress" ? "in_progress" : "todo",
      sort_order: existing?.sort_order || Date.now(),
      estimated_hours: existing?.estimated_hours || 6,
      actual_hours: existing?.actual_hours || 0,
      remaining_hours: status === "done" ? 0 : Math.max(0, (existing?.estimated_hours || 6) - (existing?.actual_hours || 0)),
      assignee_role: defectRow.assignee_role || null,
      source_type: "defect",
      source_id: defectRow.id,
    };

    if (existing) {
      await run(
        `UPDATE tasks SET
          title = @title,
          status = @status,
          status_text = @status_text,
          project_id = @project_id,
          owner = @owner,
          description = @description,
          requirement_id = @requirement_id,
          progress = @progress,
          remaining_hours = @remaining_hours,
          type = @type,
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
          remaining_hours: taskPayload.remaining_hours,
          type: taskPayload.type,
          kanban_column: taskPayload.kanban_column,
          assignee_role: taskPayload.assignee_role,
        },
      );
      return existing.id;
    }

    const taskId = await nextId("TASK", "tasks");
    await insert("tasks", { id: taskId, ...taskPayload });
    return taskId;
  }

  return { syncDefectTask };
}

module.exports = { createDefectTaskSync };
