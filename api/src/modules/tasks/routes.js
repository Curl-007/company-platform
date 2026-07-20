const express = require("express");
const { canTransition } = require("../../workflow/stateMachine");
const { buildSprintCreate, buildTaskCreate, buildTaskUpdate, dependencyIdsFor, normalizeDependencyIds } = require("./service");

const KANBAN_COLUMNS = ["todo", "in_progress", "blocked", "code_review", "testing", "acceptance", "done", "cancelled"];

function expectedTaskVersion(req, res, task, fail) {
  const version = Number(req.body?.version);
  if (!Number.isInteger(version) || version < 1) {
    fail(res, 400, "VERSION_REQUIRED", "A positive integer version is required when updating a task.");
    return null;
  }
  return version;
}

function taskVersionConflict(res, task, expectedVersion, repository, fail) {
  const current = repository.findTaskVersion(task.id);
  return fail(res, 409, "VERSION_CONFLICT", "Task was changed by another user. Refresh and retry your update.", {
    expectedVersion,
    currentVersion: Number(current?.version) || null,
  });
}

function includesText(haystack, needle) {
  const target = String(needle || "").trim();
  if (!target) return false;
  return String(haystack || "").toLowerCase().includes(target.toLowerCase());
}

function mapTaskWorkLogEvidence(item, { match, parse, weekKeyOf }) {
  return {
    id: item.id,
    author: item.author,
    authorId: item.author_id || null,
    role: item.role || "dev",
    projectId: item.project_id || null,
    project: item.project,
    content: item.content,
    blockers: item.blockers,
    nextPlan: item.next_plan,
    analysis: parse(item.analysis, {}),
    logDate: item.log_date || item.created_at?.slice(0, 10),
    sourceDocumentId: item.source_document_id || null,
    fileName: item.file_name || null,
    fileType: item.file_type || null,
    weekKey: item.week_key || weekKeyOf(item.log_date || item.created_at),
    weeklySummary: item.weekly_summary || "",
    createdAt: item.created_at,
    match,
  };
}

function createTasksRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject,
  canManageProject,
  buildSprintBurndown,
  closedTaskStatuses,
  fail,
  json,
  mapSprint,
  mapTask,
  nextId,
  now,
  ok,
  paginatedResponse,
  parse,
  recordBurndownSnapshot,
  requirePermission,
  repository,
  sprintCommitment,
  statusHistory,
  sprintStatuses,
  taskStatuses,
  taskTypes,
  transaction,
  weekKeyOf,
}) {
  const router = express.Router();

  function scopeChangeReason(body) {
    return String(body?.scopeChangeReason || body?.reason || "").trim();
  }

  function requireScopeChangeReason(res, sprint, body) {
    const reason = scopeChangeReason(body);
    if (sprint?.status === "active" && !reason) {
      fail(res, 400, "SCOPE_CHANGE_REASON_REQUIRED", "Active sprint scope changes require a reason.");
      return null;
    }
    return reason;
  }

  function sprintActivationReadiness(sprint, candidate = {}) {
    const missing = [];
    const startDate = candidate.startDate !== undefined ? candidate.startDate : sprint.start_date;
    const endDate = candidate.endDate !== undefined ? candidate.endDate : sprint.end_date;
    if (!startDate || !endDate) missing.push("sprintDates");
    if (startDate && endDate && String(endDate) < String(startDate)) missing.push("validDateRange");
    const taskCount = repository.taskCountForSprint(sprint.id);
    if (taskCount === 0) missing.push("committedTasks");
    return { ok: missing.length === 0, missing, taskCount };
  }

  function dependencyPathExists(taskId, targetId, visited = new Set()) {
    if (taskId === targetId) return true;
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    const task = repository.findTaskDependencyIds(taskId);
    return dependencyIdsFor(task).some((dependencyId) => dependencyPathExists(dependencyId, targetId, visited));
  }

  function validateTaskDependencies({ taskId, projectId, dependencyIds }) {
    const normalized = normalizeDependencyIds(dependencyIds);
    for (const dependencyId of normalized) {
      if (dependencyId === taskId) return { ok: false, message: "A task cannot depend on itself." };
      const dependency = repository.findTaskDependency(dependencyId);
      if (!dependency) return { ok: false, message: `Dependency task ${dependencyId} was not found.` };
      if (dependency.project_id !== projectId) return { ok: false, message: "Dependencies must belong to the same project." };
      if (dependencyPathExists(dependencyId, taskId)) return { ok: false, message: "Task dependency would create a cycle." };
    }
    return { ok: true, dependencyIds: normalized };
  }

  function unresolvedDependencies(task) {
    return dependencyIdsFor(task)
      .map((id) => repository.findTaskStatus(id))
      .filter((dependency) => !dependency || !closedTaskStatuses.has(dependency.status));
  }

  function ensureTaskCanComplete(res, task) {
    const unresolved = unresolvedDependencies(task);
    if (!unresolved.length) return true;
    fail(res, 409, "TASK_DEPENDENCIES_UNRESOLVED", "Task dependencies must be completed or cancelled before completion.", {
      dependencyIds: unresolved.map((dependency) => dependency?.id).filter(Boolean),
    });
    return false;
  }

  router.get("/projects/:projectId/sprints", (req, res) => {
    if (!canAccessProject(req.user, req.params.projectId)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目迭代。");
    const allItems = repository.listSprints(req.params.projectId).map(mapSprint);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/projects/:projectId/sprints", requirePermission("project:*"), (req, res) => {
    const { name, goal, status, startDate, endDate } = req.body || {};
    if (!name || !String(name).trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Sprint name is required and cannot be empty.");
    }
    if (status !== undefined && status !== "planned") {
      return fail(res, 400, "VALIDATION_FAILED", "New sprints must start in planned status.");
    }
    const idempotency = beginIdempotentRequest(req, res, "sprint.create");
    if (!idempotency) return;
    try {
      const project = repository.findProject(req.params.projectId);
      if (!project) {
        idempotency.abort();
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      }
      if (!canManageProject(req.user, project.id)) {
        idempotency.abort();
        return fail(res, 403, "PERMISSION_DENIED", "无权创建该项目迭代。");
      }
      const response = transaction(() => {
        const sprint = buildSprintCreate(
          { name, goal, status, startDate, endDate },
          { id: nextId("SPR", "sprints"), projectId: req.params.projectId },
        );
        repository.createSprint(sprint);
        statusHistory.record({
          resourceType: "sprint",
          resourceId: sprint.id,
          projectId: sprint.project_id,
          toStatus: sprint.status,
          reason: "迭代创建",
          actor: req.user,
        });
        const created = ok(mapSprint(repository.findSprint(sprint.id)));
        audit(req.user, "sprint.create", "sprint", sprint.id, null, created.data, req.ip);
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.get("/tasks", (req, res) => {
    const allItems = repository.listTasks(req.query)
      .filter((task) => canAccessProject(req.user, task.project_id))
      .map(mapTask);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.get("/projects/:projectId/tasks", (req, res) => {
    const project = repository.findProjectId(req.params.projectId);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!canAccessProject(req.user, project.id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目任务。");
    const allItems = repository.listTasks({ ...req.query, projectId: project.id }).map(mapTask);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.get("/projects/:id/wbs", (req, res) => {
    if (!canAccessProject(req.user, req.params.id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目 WBS。");
    res.json(ok(repository.listProjectTasksByWbs(req.params.id).map(mapTask)));
  });

  router.get("/projects/:id/kanban", (req, res) => {
    if (!canAccessProject(req.user, req.params.id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目看板。");
    const tasks = repository.listProjectTasks(req.params.id).map(mapTask);
    res.json(ok(KANBAN_COLUMNS.map((id) => ({ id, title: id.replace("_", " "), tasks: tasks.filter((task) => task.kanbanColumn === id) }))));
  });

  router.post("/projects/:id/wbs/tasks", requirePermission("project:*"), (req, res) => {
    if (!req.body.title || !String(req.body.title).trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Task title is required and cannot be empty.");
    }
    if (req.body.type !== undefined && req.body.type !== null && req.body.type !== "" && !taskTypes.includes(req.body.type)) {
      return fail(res, 400, "VALIDATION_FAILED", `Task type must be one of: ${taskTypes.join(", ")}`);
    }
    const idempotency = beginIdempotentRequest(req, res, "task.create");
    if (!idempotency) return;
    try {
      const project = repository.findProjectId(req.params.id);
      if (!project) {
        idempotency.abort();
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      }
      if (req.body.requirementId) {
        const requirement = repository.findRequirementProject(req.body.requirementId);
        if (!requirement) {
          idempotency.abort();
          return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
        }
        if (requirement.project_id !== project.id) {
          idempotency.abort();
          return fail(res, 400, "VALIDATION_FAILED", "Requirement must belong to the same project as the task.");
        }
      }
      if (req.body.parentId) {
        const parentTask = repository.findTaskProject(req.body.parentId);
        if (!parentTask) {
          idempotency.abort();
          return fail(res, 404, "RESOURCE_NOT_FOUND", "Parent task not found.");
        }
        if (parentTask.project_id !== project.id) {
          idempotency.abort();
          return fail(res, 400, "VALIDATION_FAILED", "Parent task must belong to the same project as the task.");
        }
      }
      const targetSprint = req.body.sprintId ? repository.findSprint(req.body.sprintId) : null;
      if (req.body.sprintId && !targetSprint) {
        idempotency.abort();
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
      }
      if (targetSprint && targetSprint.project_id !== project.id) {
        idempotency.abort();
        return fail(res, 400, "VALIDATION_FAILED", "Sprint must belong to the same project as the task.");
      }
      const createScopeReason = targetSprint ? requireScopeChangeReason(res, targetSprint, req.body) : "";
      if (targetSprint?.status === "active" && !createScopeReason) {
        idempotency.abort();
        return;
      }
      const taskId = nextId("TASK", "tasks");
      const dependencyValidation = validateTaskDependencies({
        taskId,
        projectId: project.id,
        dependencyIds: req.body.dependencyIds,
      });
      if (!dependencyValidation.ok) {
        idempotency.abort();
        return fail(res, 400, "TASK_DEPENDENCY_INVALID", dependencyValidation.message);
      }
      if (!canManageProject(req.user, project.id)) {
        idempotency.abort();
        return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建任务。");
      }
      const response = transaction(() => {
        const task = buildTaskCreate(
          { ...req.body, dependencyIds: dependencyValidation.dependencyIds },
          { id: taskId, projectId: req.params.id, dueDate: now().slice(0, 10), sortOrder: Date.now(), json },
        );
        repository.createTask(task);
        statusHistory.record({
          resourceType: "task",
          resourceId: task.id,
          projectId: task.project_id,
          toStatus: task.status,
          reason: "任务创建",
          actor: req.user,
        });
        if (task.sprint_id) recordBurndownSnapshot(task.sprint_id);
        if (targetSprint?.status === "active") {
          sprintCommitment.recordScopeChange({ sprint: targetSprint, task, changeType: "add", impactHours: task.estimated_hours, reason: createScopeReason, actor: req.user });
        }
        const created = ok(mapTask(repository.findTask(task.id)));
        audit(req.user, "task.create", "task", task.id, null, created.data, req.ip);
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.patch("/tasks/:id/kanban-position", requirePermission("project:*"), (req, res) => {
    if (!req.body.kanbanColumn || !taskStatuses.includes(req.body.kanbanColumn)) {
      return fail(res, 400, "VALIDATION_FAILED", `kanbanColumn must be one of: ${taskStatuses.join(", ")}`);
    }
    const before = repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canManageProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权移动该任务。");
    const expectedVersion = expectedTaskVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    if (!canTransition("task", before.status, req.body.kanbanColumn)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Task cannot transition from ${before.status} to ${req.body.kanbanColumn}.`);
    }
    if (req.body.kanbanColumn === "done" && !ensureTaskCanComplete(res, before)) return;
    const updateResult = repository.updateTaskKanban({
      id: req.params.id,
      expectedVersion,
      column: req.body.kanbanColumn,
      statusText: req.body.kanbanColumn.replace("_", " "),
      sortOrder: Number(req.body.sortOrder) || Date.now(),
      remainingHours: closedTaskStatuses.has(req.body.kanbanColumn) ? 0 : before.remaining_hours,
      progress: req.body.kanbanColumn === "done" ? 100 : before.progress,
    });
    if (updateResult.changes === 0) return taskVersionConflict(res, before, expectedVersion, repository, fail);
    const after = repository.findTask(req.params.id);
    statusHistory.record({
      resourceType: "task",
      resourceId: after.id,
      projectId: after.project_id,
      fromStatus: before.status,
      toStatus: after.status,
      reason: req.body?.statusReason,
      actor: req.user,
    });
    audit(req.user, "task.kanban_move", "task", req.params.id, before, after, req.ip);
    res.json(ok(mapTask(after)));
  });

  router.get("/tasks/:id", (req, res) => {
    const task = repository.findTask(req.params.id);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canAccessProject(req.user, task.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务。");
    res.json(ok(mapTask(task)));
  });

  router.get("/tasks/:id/work-logs", (req, res) => {
    const task = repository.findTask(req.params.id);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canAccessProject(req.user, task.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务工作日志。");
    const project = repository.findProject(task.project_id);
    const logs = repository.listWorkLogsForProjectEvidence({ projectId: task.project_id, projectName: project?.name });
    const title = String(task.title || "").trim();
    const titleIsSpecific = title.length >= 4;
    const matched = logs.map((item) => {
      const analysis = parse(item.analysis, {});
      const searchable = [
        item.content,
        item.blockers,
        item.next_plan,
        JSON.stringify(analysis),
      ].join("\n");
      const matchedBy = [];
      if (includesText(searchable, task.id)) matchedBy.push("taskId");
      if (titleIsSpecific && includesText(searchable, title)) matchedBy.push("taskTitle");
      if (!matchedBy.length) return null;
      return mapTaskWorkLogEvidence(item, {
        match: { taskId: task.id, taskTitle: title, matchedBy },
        parse,
        weekKeyOf,
      });
    }).filter(Boolean);
    res.json(ok(paginatedResponse(matched, req.query)));
  });

  router.get("/tasks/:id/status-history", (req, res) => {
    const task = repository.findTaskId(req.params.id);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canAccessProject(req.user, task.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务状态历史。");
    res.json(ok(statusHistory.list("task", task.id)));
  });

  router.patch("/tasks/:id", requirePermission("project:*"), (req, res) => {
    const before = repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canManageProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该任务。");
    const expectedVersion = expectedTaskVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    const { title, owner, progress, status, type, estimatedHours, actualHours, remainingHours, dueDate, sprintId, assigneeId, dependencyIds } = req.body || {};
    const oldSprint = before.sprint_id ? repository.findSprint(before.sprint_id) : null;
    const targetSprint = sprintId !== undefined && sprintId ? repository.findSprint(sprintId) : null;
    if (sprintId !== undefined && sprintId && !targetSprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (targetSprint && targetSprint.project_id !== before.project_id) return fail(res, 400, "VALIDATION_FAILED", "Sprint must belong to the same project as the task.");
    const membershipChanged = sprintId !== undefined && sprintId !== before.sprint_id;
    const estimateChanged = estimatedHours !== undefined && Number(estimatedHours) !== Number(before.estimated_hours);
    const requiresScopeReason = (membershipChanged && (oldSprint?.status === "active" || targetSprint?.status === "active")) || (estimateChanged && oldSprint?.status === "active" && !membershipChanged);
    const updateScopeReason = requiresScopeReason ? scopeChangeReason(req.body) : "";
    if (requiresScopeReason && !updateScopeReason) return fail(res, 400, "SCOPE_CHANGE_REASON_REQUIRED", "Active sprint scope changes require a reason.");
    const dependencyValidation = dependencyIds !== undefined
      ? validateTaskDependencies({ taskId: before.id, projectId: before.project_id, dependencyIds })
      : null;
    if (dependencyValidation && !dependencyValidation.ok) return fail(res, 400, "TASK_DEPENDENCY_INVALID", dependencyValidation.message);
    if (status !== undefined && !taskStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${taskStatuses.join(", ")}`);
    }
    if (status !== undefined && !canTransition("task", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Task cannot transition from ${before.status} to ${status}.`);
    }
    if (status === "done" && !ensureTaskCanComplete(res, before)) return;
    if (type !== undefined && !taskTypes.includes(type)) {
      return fail(res, 400, "VALIDATION_FAILED", `Task type must be one of: ${taskTypes.join(", ")}`);
    }
    const next = buildTaskUpdate(
      before,
      { title, owner, progress, status, type, estimatedHours, actualHours, remainingHours, dueDate, sprintId, assigneeId, dependencyIds: dependencyValidation?.dependencyIds },
      { expectedVersion, json },
    );
    const updateResult = repository.updateTask(next);
    if (updateResult.changes === 0) return taskVersionConflict(res, before, expectedVersion, repository, fail);
    const after = repository.findTask(req.params.id);
    if (membershipChanged && oldSprint?.status === "active") {
      sprintCommitment.recordScopeChange({ sprint: oldSprint, task: before, changeType: "remove", impactHours: -Number(before.estimated_hours || 0), reason: updateScopeReason, actor: req.user });
    }
    if (membershipChanged && targetSprint?.status === "active") {
      sprintCommitment.recordScopeChange({ sprint: targetSprint, task: after, changeType: "add", impactHours: Number(after.estimated_hours || 0), reason: updateScopeReason, actor: req.user });
    }
    if (!membershipChanged && estimateChanged && oldSprint?.status === "active") {
      sprintCommitment.recordScopeChange({ sprint: oldSprint, task: after, changeType: "reestimate", impactHours: Number(after.estimated_hours || 0) - Number(before.estimated_hours || 0), reason: updateScopeReason, actor: req.user });
    }
    if (status !== undefined) {
      statusHistory.record({
        resourceType: "task",
        resourceId: after.id,
        projectId: after.project_id,
        fromStatus: before.status,
        toStatus: after.status,
        reason: req.body?.statusReason,
        actor: req.user,
      });
    }
    if (after.sprint_id && (estimatedHours !== undefined || actualHours !== undefined || remainingHours !== undefined || sprintId !== undefined)) {
      recordBurndownSnapshot(after.sprint_id);
    }
    audit(req.user, "task.update", "task", req.params.id, before, after, req.ip);
    res.json(ok(mapTask(after)));
  });

  router.patch("/tasks/:id/status", requirePermission("project:*"), (req, res) => {
    const before = repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canManageProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权变更该任务状态。");
    const expectedVersion = expectedTaskVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    const { status, progress } = req.body || {};
    if (!status) return fail(res, 400, "VALIDATION_FAILED", "status is required.");
    if (!taskStatuses.includes(status)) return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${taskStatuses.join(", ")}`);
    if (!canTransition("task", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Task cannot transition from ${before.status} to ${status}.`);
    }
    if (status === "done" && !ensureTaskCanComplete(res, before)) return;
    const updateResult = repository.updateTaskStatus({
      id: req.params.id,
      expectedVersion,
      status,
      statusText: status.replace("_", " "),
      remainingHours: closedTaskStatuses.has(status) ? 0 : before.remaining_hours,
      progress: progress === undefined ? (status === "done" ? 100 : before.progress) : Number(progress),
    });
    if (updateResult.changes === 0) return taskVersionConflict(res, before, expectedVersion, repository, fail);
    const after = repository.findTask(req.params.id);
    statusHistory.record({
      resourceType: "task",
      resourceId: after.id,
      projectId: after.project_id,
      fromStatus: before.status,
      toStatus: after.status,
      reason: req.body?.reason,
      actor: req.user,
    });
    audit(req.user, "task.status_update", "task", req.params.id, before, after, req.ip);
    res.json(ok(mapTask(after)));
  });

  router.delete("/tasks/:id", requirePermission("project:*"), (req, res) => {
    const before = repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!canManageProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权删除该任务。");
    const dependents = repository.listProjectTaskDependencies(before.project_id)
      .filter((task) => task.id !== before.id && dependencyIdsFor(task).includes(before.id))
      .map((task) => task.id);
    if (dependents.length) {
      return fail(res, 409, "TASK_HAS_DEPENDENTS", "Task is still referenced by dependent tasks.", { dependentTaskIds: dependents });
    }
    repository.deleteTask(req.params.id);
    audit(req.user, "task.delete", "task", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.patch("/sprints/:id", requirePermission("project:*"), (req, res) => {
    const before = repository.findSprint(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canManageProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该迭代。");
    const { name, goal, status, startDate, endDate } = req.body || {};
    if (status !== undefined && !sprintStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${sprintStatuses.join(", ")}`);
    }
    if (status !== undefined && !canTransition("sprint", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Sprint cannot transition from ${before.status} to ${status}.`);
    }
    if (status === "active" && before.status !== "active") {
      const readiness = sprintActivationReadiness(before, { startDate, endDate });
      if (!readiness.ok) return fail(res, 409, "SPRINT_ACTIVATION_GATE_BLOCKED", "Sprint needs valid dates and committed tasks before activation.", readiness);
    }
    if (name !== undefined) repository.updateSprintName(req.params.id, String(name).trim());
    if (goal !== undefined) repository.updateSprintGoal(req.params.id, goal);
    if (status !== undefined) repository.updateSprintStatus(req.params.id, status);
    if (startDate !== undefined) repository.updateSprintStartDate(req.params.id, startDate);
    if (endDate !== undefined) repository.updateSprintEndDate(req.params.id, endDate);
    const after = repository.findSprint(req.params.id);
    if (status === "active" && before.status !== "active") sprintCommitment.createBaseline(after, req.user);
    if (status !== undefined) {
      statusHistory.record({
        resourceType: "sprint",
        resourceId: after.id,
        projectId: after.project_id,
        fromStatus: before.status,
        toStatus: after.status,
        reason: req.body?.statusReason,
        actor: req.user,
      });
    }
    audit(req.user, "sprint.update", "sprint", req.params.id, before, after, req.ip);
    res.json(ok(mapSprint(after)));
  });

  router.delete("/sprints/:id", requirePermission("project:*"), (req, res) => {
    const before = repository.findSprint(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canManageProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权删除该迭代。");
    if (before.status === "active") return fail(res, 409, "SPRINT_ACTIVE_CANNOT_DELETE", "Active sprint must be closed before deletion.");
    const taskCount = repository.taskCountForSprint(req.params.id);
    if (taskCount > 0) {
      return fail(
        res,
        409,
        "SPRINT_HAS_TASKS",
        "迭代仍有关联任务，不能直接删除。请先将任务移出迭代。",
        { dependencies: { tasks: taskCount } },
      );
    }
    repository.deleteSprint(req.params.id);
    audit(req.user, "sprint.delete", "sprint", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/sprints/:id/status-history", (req, res) => {
    const sprint = repository.findSprintId(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canAccessProject(req.user, sprint.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代状态历史。");
    res.json(ok(statusHistory.list("sprint", sprint.id)));
  });

  router.get("/sprints/:id/commitment", (req, res) => {
    const sprint = repository.findSprintId(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canAccessProject(req.user, sprint.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代承诺基线。");
    res.json(ok(sprintCommitment.getCommitment(sprint.id)));
  });

  router.get("/sprints/:id/scope-changes", (req, res) => {
    const sprint = repository.findSprintId(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canAccessProject(req.user, sprint.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代范围变更记录。");
    res.json(ok(sprintCommitment.listScopeChanges(sprint.id)));
  });

  router.post("/sprints/:id/tasks", requirePermission("project:*"), (req, res) => {
    const sprint = repository.findSprint(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canManageProject(req.user, sprint.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权管理该迭代任务。");
    const { taskId } = req.body || {};
    if (!taskId) return fail(res, 400, "VALIDATION_FAILED", "taskId is required.");
    const task = repository.findTask(taskId);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (task.project_id !== sprint.project_id) {
      return fail(res, 400, "VALIDATION_FAILED", "Task must belong to the same project as the sprint.");
    }
    const addScopeReason = requireScopeChangeReason(res, sprint, req.body);
    if (sprint.status === "active" && !addScopeReason) return;
    repository.assignTaskToSprint(taskId, req.params.id);
    const updated = repository.findTask(taskId);
    recordBurndownSnapshot(req.params.id);
    if (sprint.status === "active") {
      sprintCommitment.recordScopeChange({ sprint, task: updated, changeType: "add", impactHours: updated.estimated_hours, reason: addScopeReason, actor: req.user });
    }
    audit(req.user, "sprint.add_task", "task", taskId, task, updated, req.ip);
    res.json(ok(mapTask(updated)));
  });

  router.get("/sprints/:id/burndown", (req, res) => {
    const sprint = repository.findSprint(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!canAccessProject(req.user, sprint.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代燃尽图。");
    const data = buildSprintBurndown(req.params.id);
    if (!data) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    res.json(ok(data));
  });

  return router;
}

module.exports = {
  createTasksRouter,
};
