function normalizeDependencyIds(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((id) => String(id || "").trim()).filter(Boolean))];
}

function dependencyIdsFor(task) {
  try {
    return normalizeDependencyIds(JSON.parse(task?.dependency_ids || "[]"));
  } catch {
    return [];
  }
}

function buildSprintCreate(input = {}, { id, projectId }) {
  return {
    id,
    project_id: projectId,
    name: String(input.name).trim(),
    goal: input.goal || "",
    status: input.status || "planned",
    start_date: input.startDate || null,
    end_date: input.endDate || null,
  };
}

function buildTaskCreate(input = {}, { id, projectId, dueDate, sortOrder, json }) {
  return {
    id,
    title: input.title,
    status: "todo",
    status_text: "To Do",
    project_id: projectId,
    owner: input.owner || input.assigneeId || "Unassigned",
    due_date: dueDate,
    requirement_id: input.requirementId || null,
    progress: 0,
    blocker: null,
    type: input.type || "task",
    parent_id: input.parentId || null,
    wbs_code: input.wbsCode || "1",
    kanban_column: "todo",
    sort_order: sortOrder,
    estimated_hours: Number(input.estimatedHours) || 0,
    actual_hours: 0,
    remaining_hours: Number(input.remainingHours ?? input.estimatedHours) || 0,
    version: 1,
    sprint_id: input.sprintId || null,
    assignee_id: input.assigneeId || null,
    dependency_ids: json(normalizeDependencyIds(input.dependencyIds)),
  };
}

function buildTaskUpdate(before, input = {}, { expectedVersion, json }) {
  const status = input.status === undefined ? before.status : input.status;
  return {
    id: before.id,
    expectedVersion,
    title: input.title === undefined ? before.title : String(input.title).trim(),
    owner: input.owner === undefined ? before.owner : String(input.owner).trim(),
    progress: input.progress === undefined ? before.progress : Number(input.progress),
    status,
    statusText: input.status === undefined ? before.status_text : status.replace("_", " "),
    kanbanColumn: input.status === undefined ? before.kanban_column : status,
    type: input.type === undefined ? before.type : input.type,
    estimatedHours: input.estimatedHours === undefined ? before.estimated_hours : Number(input.estimatedHours),
    actualHours: input.actualHours === undefined ? before.actual_hours : Number(input.actualHours),
    remainingHours: input.remainingHours === undefined ? before.remaining_hours : Number(input.remainingHours),
    dueDate: input.dueDate === undefined ? before.due_date : input.dueDate,
    sprintId: input.sprintId === undefined ? before.sprint_id : input.sprintId || null,
    assigneeId: input.assigneeId === undefined ? before.assignee_id : input.assigneeId || null,
    dependencyIds: input.dependencyIds === undefined ? before.dependency_ids : json(normalizeDependencyIds(input.dependencyIds)),
  };
}

const HANDOFF_ACTIONS = Object.freeze({
  submit_for_testing: Object.freeze({
    targetStatus: "testing",
    targetRole: "qa",
    fromStatuses: Object.freeze(["in_progress", "code_review"]),
    label: "提交测试",
  }),
  return_for_fix: Object.freeze({
    targetStatus: "in_progress",
    targetRole: "dev",
    fromStatuses: Object.freeze(["testing", "acceptance"]),
    label: "打回开发修复",
  }),
});

function resolveHandoffAction(action) {
  const key = String(action || "").trim();
  return HANDOFF_ACTIONS[key] || null;
}

function buildTaskHandoffUpdate(before, { expectedVersion, owner, assigneeId, assigneeRole, status, progress }) {
  return {
    id: before.id,
    expectedVersion,
    owner: String(owner || before.owner || "").trim(),
    assigneeId: assigneeId || null,
    assigneeRole: assigneeRole || null,
    status,
    statusText: String(status).replace(/_/g, " "),
    progress: progress === undefined ? before.progress : Number(progress),
    remainingHours: status === "done" || status === "cancelled" ? 0 : before.remaining_hours,
  };
}

module.exports = {
  HANDOFF_ACTIONS,
  buildSprintCreate,
  buildTaskCreate,
  buildTaskUpdate,
  buildTaskHandoffUpdate,
  dependencyIdsFor,
  normalizeDependencyIds,
  resolveHandoffAction,
};
