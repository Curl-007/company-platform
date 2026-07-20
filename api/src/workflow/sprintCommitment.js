function mapCommitment(item) {
  if (!item) return null;
  return {
    id: item.id,
    sprintId: item.sprint_id,
    projectId: item.project_id,
    taskIds: JSON.parse(item.baseline_task_ids || "[]"),
    taskCount: Number(item.baseline_task_count) || 0,
    estimatedHours: Number(item.baseline_estimated_hours) || 0,
    remainingHours: Number(item.baseline_remaining_hours) || 0,
    committedBy: item.committed_by || null,
    committedByName: item.committed_by_name || "",
    committedAt: item.committed_at,
  };
}

function mapScopeChange(item) {
  return {
    id: item.id,
    sprintId: item.sprint_id,
    projectId: item.project_id,
    taskId: item.task_id || null,
    changeType: item.change_type,
    impactHours: Number(item.impact_hours) || 0,
    reason: item.reason || "",
    actorId: item.actor_id || null,
    actorName: item.actor_name || "",
    createdAt: item.created_at,
  };
}

function createSprintCommitment({ insert, nextId, now, row, rows }) {
  function getCommitment(sprintId) {
    return mapCommitment(row("SELECT * FROM sprint_commitments WHERE sprint_id = @sprintId", { sprintId }));
  }

  function createBaseline(sprint, actor) {
    const existing = getCommitment(sprint.id);
    if (existing) return existing;
    const tasks = rows("SELECT id, estimated_hours, remaining_hours FROM tasks WHERE sprint_id = @sprintId ORDER BY id", { sprintId: sprint.id });
    const commitment = {
      id: nextId("COM", "sprint_commitments"),
      sprint_id: sprint.id,
      project_id: sprint.project_id,
      baseline_task_ids: JSON.stringify(tasks.map((task) => task.id)),
      baseline_task_count: tasks.length,
      baseline_estimated_hours: tasks.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0),
      baseline_remaining_hours: tasks.reduce((sum, task) => sum + (Number(task.remaining_hours) || 0), 0),
      committed_by: actor?.id || null,
      committed_by_name: actor?.name || "",
      committed_at: now(),
    };
    insert("sprint_commitments", commitment);
    return mapCommitment(commitment);
  }

  function recordScopeChange({ sprint, task, changeType, impactHours = 0, reason, actor }) {
    const change = {
      id: nextId("SCP", "sprint_scope_changes"),
      sprint_id: sprint.id,
      project_id: sprint.project_id,
      task_id: task?.id || null,
      change_type: changeType,
      impact_hours: Number(impactHours) || 0,
      reason: String(reason || "").trim(),
      actor_id: actor?.id || null,
      actor_name: actor?.name || "",
      created_at: now(),
    };
    insert("sprint_scope_changes", change);
    return mapScopeChange(change);
  }

  function listScopeChanges(sprintId) {
    return rows("SELECT * FROM sprint_scope_changes WHERE sprint_id = @sprintId ORDER BY created_at DESC, id DESC", { sprintId })
      .map(mapScopeChange);
  }

  return { createBaseline, getCommitment, listScopeChanges, recordScopeChange };
}

module.exports = { createSprintCommitment };
