function createRequirementTaskSync({ row, run, insert, nextId, json, parse }) {
  function syncRequirementTask(requirementRow) {
    const existing = row(
      "SELECT * FROM tasks WHERE source_type = 'requirement' AND source_id = @sourceId",
      { sourceId: requirementRow.id },
    );
    const progress = Number(requirementRow.completion) || 0;
    const completed = progress >= 100;
    const assignee = requirementRow.assignee || requirementRow.owner;
    const taskPayload = {
      title: `需求跟进：${requirementRow.title}`,
      status: completed ? "done" : progress > 0 ? "in_progress" : "todo",
      status_text: completed ? "已完成" : progress > 0 ? "进行中" : "待处理",
      project_id: requirementRow.project_id,
      owner: assignee,
      description: requirementRow.description || "",
      due_date: null,
      requirement_id: requirementRow.id,
      progress,
      blocker: null,
      type: "story",
      parent_id: null,
      wbs_code: existing?.wbs_code || `REQ-${String(requirementRow.id).replace("REQ-", "")}`,
      kanban_column: completed ? "done" : progress > 0 ? "in_progress" : "todo",
      sort_order: existing?.sort_order || Date.now(),
      estimated_hours: existing?.estimated_hours || 8,
      actual_hours: existing?.actual_hours || 0,
      remaining_hours: completed ? 0 : Math.max(0, (existing?.estimated_hours || 8) - (existing?.actual_hours || 0)),
      assignee_role: requirementRow.assignee_role || null,
      source_type: "requirement",
      source_id: requirementRow.id,
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

    const taskId = nextId("TASK", "tasks");
    insert("tasks", { id: taskId, ...taskPayload });
    return taskId;
  }

  function mergeRequirementLinkedTask(requirementId, taskId) {
    if (!requirementId || !taskId) return;
    const requirement = row("SELECT linked_tasks FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId });
    if (!requirement) return;
    const linkedTasks = parse(requirement?.linked_tasks, []);
    const merged = [...new Set([...(Array.isArray(linkedTasks) ? linkedTasks : []), taskId])];
    run("UPDATE requirements SET linked_tasks = @tasks WHERE id = @id", { id: requirementId, tasks: json(merged) });
  }

  return { syncRequirementTask, mergeRequirementLinkedTask };
}

module.exports = { createRequirementTaskSync };
