const express = require("express");
const { filterAsync, mapAsync, forEachAsync } = require("../../lib/asyncIter");
const { canTransition } = require("../../workflow/stateMachine");
const {
  buildSprintCreate,
  buildTaskCreate,
  buildTaskUpdate,
  buildTaskHandoffUpdate,
  dependencyIdsFor,
  normalizeDependencyIds,
  resolveHandoffAction,
} = require("./service");

const KANBAN_COLUMNS = ["todo", "in_progress", "blocked", "code_review", "testing", "acceptance", "done", "cancelled"];

function expectedTaskVersion(req, res, task, fail) {
  const version = Number(req.body?.version);
  if (!Number.isInteger(version) || version < 1) {
    fail(res, 400, "VERSION_REQUIRED", "A positive integer version is required when updating a task.");
    return null;
  }
  return version;
}

async function taskVersionConflict(res, task, expectedVersion, repository, fail) {
  const current = await repository.findTaskVersion(task.id);
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
  canWriteProject,
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
  requireAnyPermission,
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

  function isTaskOwner(user, task) {
    if (!user || !task) return false;
    if (task.owner && user.name && task.owner === user.name) return true;
    if (task.assignee_id && user.id && task.assignee_id === user.id) return true;
    return false;
  }

  async function resolveHandoffTarget(projectId, { assigneeId, assigneeName, targetRole }) {
    let user = null;
    if (assigneeId) user = await repository.findActiveUserById(assigneeId);
    if (!user && assigneeName) user = await repository.findActiveUserByName(String(assigneeName).trim());
    if (!user) {
      const members = await repository.listProjectMembers(projectId);
      const roleMembers = members.filter((m) => String(m.role || "").toLowerCase() === targetRole);
      if (roleMembers.length === 1) {
        const m = roleMembers[0];
        if (m.user_id) user = await repository.findActiveUserById(m.user_id);
        if (!user && m.user_name) user = await repository.findActiveUserByName(m.user_name);
      }
    }
    return user;
  }

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

  async function sprintActivationReadiness(sprint, candidate = {}) {
    const missing = [];
    const startDate = candidate.startDate !== undefined ? candidate.startDate : sprint.start_date;
    const endDate = candidate.endDate !== undefined ? candidate.endDate : sprint.end_date;
    if (!startDate || !endDate) missing.push("sprintDates");
    if (startDate && endDate && String(endDate) < String(startDate)) missing.push("validDateRange");
    const taskCount = await repository.taskCountForSprint(sprint.id);
    if (taskCount === 0) missing.push("committedTasks");
    return { ok: missing.length === 0, missing, taskCount };
  }

  async function dependencyPathExists(taskId, targetId, visited = new Set()) {
    if (taskId === targetId) return true;
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    const task = await repository.findTaskDependencyIds(taskId);
    for (const dependencyId of dependencyIdsFor(task)) {
      if (await dependencyPathExists(dependencyId, targetId, visited)) return true;
    }
    return false;
  }

  async function validateTaskDependencies({ taskId, projectId, dependencyIds }) {
    const normalized = normalizeDependencyIds(dependencyIds);
    for (const dependencyId of normalized) {
      if (dependencyId === taskId) return { ok: false, message: "A task cannot depend on itself." };
      const dependency = await repository.findTaskDependency(dependencyId);
      if (!dependency) return { ok: false, message: `Dependency task ${dependencyId} was not found.` };
      if (dependency.project_id !== projectId) return { ok: false, message: "Dependencies must belong to the same project." };
      if (await dependencyPathExists(dependencyId, taskId)) return { ok: false, message: "Task dependency would create a cycle." };
    }
    return { ok: true, dependencyIds: normalized };
  }

  async function unresolvedDependencies(task) {
    const deps = await mapAsync(dependencyIdsFor(task), async (id) => await repository.findTaskStatus(id));
    return deps.filter((dependency) => !dependency || !closedTaskStatuses.has(dependency.status));
  }

  async function ensureTaskCanComplete(res, task) {
    const unresolved = await unresolvedDependencies(task);
    if (!unresolved.length) return true;
    fail(res, 409, "TASK_DEPENDENCIES_UNRESOLVED", "Task dependencies must be completed or cancelled before completion.", {
      dependencyIds: unresolved.map((dependency) => dependency?.id).filter(Boolean),
    });
    return false;
  }

  router.get("/projects/:projectId/sprints", async (req, res) => {
    if (!(await canAccessProject(req.user, req.params.projectId))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目迭代。");
    const allItems = (await repository.listSprints(req.params.projectId)).map(mapSprint);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/projects/:projectId/sprints", requirePermission("project:*"), async (req, res) => {
    const { name, goal, status, startDate, endDate } = req.body || {};
    if (!name || !String(name).trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Sprint name is required and cannot be empty.");
    }
    if (status !== undefined && status !== "planned") {
      return fail(res, 400, "VALIDATION_FAILED", "New sprints must start in planned status.");
    }
    const idempotency = await beginIdempotentRequest(req, res, "sprint.create");
    if (!idempotency) return;
    try {
      const project = await repository.findProject(req.params.projectId);
      if (!project) {
        await idempotency.abort();
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      }
      if (!(await canManageProject(req.user, project.id))) {
        await idempotency.abort();
        return fail(res, 403, "PERMISSION_DENIED", "无权创建该项目迭代。");
      }
      const response = await transaction(async () => {
        const sprint = buildSprintCreate(
          { name, goal, status, startDate, endDate },
          { id: await nextId("SPR", "sprints"), projectId: req.params.projectId },
        );
        await repository.createSprint(sprint);
        await statusHistory.record({
          resourceType: "sprint",
          resourceId: sprint.id,
          projectId: sprint.project_id,
          toStatus: sprint.status,
          reason: "迭代创建",
          actor: req.user,
        });
        const created = ok(mapSprint(await repository.findSprint(sprint.id)));
        await audit(req.user, "sprint.create", "sprint", sprint.id, null, created.data, req.ip);
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.get("/tasks", async (req, res) => {
    const __src_tasks = await repository.listTasks(req.query);
    const __mid_tasks = await filterAsync(__src_tasks, async (task) => await canAccessProject(req.user, task.project_id));
    const allItems = __mid_tasks.map(mapTask);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.get("/projects/:projectId/tasks", async (req, res) => {
    const project = await repository.findProjectId(req.params.projectId);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目任务。");
    const allItems = (await repository.listTasks({ ...req.query, projectId: project.id })).map(mapTask);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.get("/projects/:id/wbs", async (req, res) => {
    if (!(await canAccessProject(req.user, req.params.id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目 WBS。");
    res.json(ok((await repository.listProjectTasksByWbs(req.params.id)).map(mapTask)));
  });

  router.get("/projects/:id/kanban", async (req, res) => {
    if (!(await canAccessProject(req.user, req.params.id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目看板。");
    const tasks = (await repository.listProjectTasks(req.params.id)).map(mapTask);
    res.json(ok(KANBAN_COLUMNS.map((id) => ({ id, title: id.replace("_", " "), tasks: tasks.filter((task) => task.kanbanColumn === id) }))));
  });

  router.post("/projects/:id/wbs/tasks", requirePermission("project:*"), async (req, res) => {
    if (!req.body.title || !String(req.body.title).trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Task title is required and cannot be empty.");
    }
    if (req.body.type !== undefined && req.body.type !== null && req.body.type !== "" && !taskTypes.includes(req.body.type)) {
      return fail(res, 400, "VALIDATION_FAILED", `Task type must be one of: ${taskTypes.join(", ")}`);
    }
    const idempotency = await beginIdempotentRequest(req, res, "task.create");
    if (!idempotency) return;
    try {
      const project = await repository.findProjectId(req.params.id);
      if (!project) {
        await idempotency.abort();
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      }
      if (req.body.requirementId) {
        const requirement = await repository.findRequirementProject(req.body.requirementId);
        if (!requirement) {
          await idempotency.abort();
          return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
        }
        if (requirement.project_id !== project.id) {
          await idempotency.abort();
          return fail(res, 400, "VALIDATION_FAILED", "Requirement must belong to the same project as the task.");
        }
      }
      if (req.body.parentId) {
        const parentTask = await repository.findTaskProject(req.body.parentId);
        if (!parentTask) {
          await idempotency.abort();
          return fail(res, 404, "RESOURCE_NOT_FOUND", "Parent task not found.");
        }
        if (parentTask.project_id !== project.id) {
          await idempotency.abort();
          return fail(res, 400, "VALIDATION_FAILED", "Parent task must belong to the same project as the task.");
        }
      }
      const targetSprint = req.body.sprintId ? await repository.findSprint(req.body.sprintId) : null;
      if (req.body.sprintId && !targetSprint) {
        await idempotency.abort();
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
      }
      if (targetSprint && targetSprint.project_id !== project.id) {
        await idempotency.abort();
        return fail(res, 400, "VALIDATION_FAILED", "Sprint must belong to the same project as the task.");
      }
      const createScopeReason = targetSprint ? requireScopeChangeReason(res, targetSprint, req.body) : "";
      if (targetSprint?.status === "active" && !createScopeReason) {
        await idempotency.abort();
        return;
      }
      const taskId = await nextId("TASK", "tasks");
      const dependencyValidation = await validateTaskDependencies({
        taskId,
        projectId: project.id,
        dependencyIds: req.body.dependencyIds,
      });
      if (!dependencyValidation.ok) {
        await idempotency.abort();
        return fail(res, 400, "TASK_DEPENDENCY_INVALID", dependencyValidation.message);
      }
      if (!(await canManageProject(req.user, project.id))) {
        await idempotency.abort();
        return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建任务。");
      }
      const response = await transaction(async () => {
        const task = buildTaskCreate(
          { ...req.body, dependencyIds: dependencyValidation.dependencyIds },
          { id: taskId, projectId: req.params.id, dueDate: now().slice(0, 10), sortOrder: Date.now(), json },
        );
        await repository.createTask(task);
        await statusHistory.record({
          resourceType: "task",
          resourceId: task.id,
          projectId: task.project_id,
          toStatus: task.status,
          reason: "任务创建",
          actor: req.user,
        });
        if (task.sprint_id) await recordBurndownSnapshot(task.sprint_id);
        if (targetSprint?.status === "active") {
          await sprintCommitment.recordScopeChange({ sprint: targetSprint, task, changeType: "add", impactHours: task.estimated_hours, reason: createScopeReason, actor: req.user });
        }
        const created = ok(mapTask(await repository.findTask(task.id)));
        await audit(req.user, "task.create", "task", task.id, null, created.data, req.ip);
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.patch("/tasks/:id/kanban-position", requirePermission("project:*"), async (req, res) => {
    if (!req.body.kanbanColumn || !taskStatuses.includes(req.body.kanbanColumn)) {
      return fail(res, 400, "VALIDATION_FAILED", `kanbanColumn must be one of: ${taskStatuses.join(", ")}`);
    }
    const before = await repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canManageProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权移动该任务。");
    const expectedVersion = expectedTaskVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    if (!canTransition("task", before.status, req.body.kanbanColumn)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Task cannot transition from ${before.status} to ${req.body.kanbanColumn}.`);
    }
    if (req.body.kanbanColumn === "done" && !await ensureTaskCanComplete(res, before)) return;
    const updateResult = await repository.updateTaskKanban({
      id: req.params.id,
      expectedVersion,
      column: req.body.kanbanColumn,
      statusText: req.body.kanbanColumn.replace("_", " "),
      sortOrder: Number(req.body.sortOrder) || Date.now(),
      remainingHours: closedTaskStatuses.has(req.body.kanbanColumn) ? 0 : before.remaining_hours,
      progress: req.body.kanbanColumn === "done" ? 100 : before.progress,
    });
    if (updateResult.changes === 0) return await taskVersionConflict(res, before, expectedVersion, repository, fail);
    const after = await repository.findTask(req.params.id);
    await statusHistory.record({
      resourceType: "task",
      resourceId: after.id,
      projectId: after.project_id,
      fromStatus: before.status,
      toStatus: after.status,
      reason: req.body?.statusReason,
      actor: req.user,
    });
    await audit(req.user, "task.kanban_move", "task", req.params.id, before, after, req.ip);
    res.json(ok(mapTask(after)));
  });

  router.get("/tasks/:id", async (req, res) => {
    const task = await repository.findTask(req.params.id);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canAccessProject(req.user, task.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务。");
    res.json(ok(mapTask(task)));
  });

  router.get("/tasks/:id/work-logs", async (req, res) => {
    const task = await repository.findTask(req.params.id);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canAccessProject(req.user, task.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务工作日志。");
    const project = await repository.findProject(task.project_id);
    const logs = await repository.listWorkLogsForProjectEvidence({ projectId: task.project_id, projectName: project?.name });
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

  router.get("/tasks/:id/status-history", async (req, res) => {
    const task = await repository.findTaskId(req.params.id);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canAccessProject(req.user, task.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务状态历史。");
    res.json(ok(await statusHistory.list("task", task.id)));
  });

  router.patch("/tasks/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canManageProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该任务。");
    const expectedVersion = expectedTaskVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    const { title, owner, progress, status, type, estimatedHours, actualHours, remainingHours, dueDate, sprintId, assigneeId, dependencyIds } = req.body || {};
    const oldSprint = before.sprint_id ? await repository.findSprint(before.sprint_id) : null;
    const targetSprint = sprintId !== undefined && sprintId ? await repository.findSprint(sprintId) : null;
    if (sprintId !== undefined && sprintId && !targetSprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (targetSprint && targetSprint.project_id !== before.project_id) return fail(res, 400, "VALIDATION_FAILED", "Sprint must belong to the same project as the task.");
    const membershipChanged = sprintId !== undefined && sprintId !== before.sprint_id;
    const estimateChanged = estimatedHours !== undefined && Number(estimatedHours) !== Number(before.estimated_hours);
    const requiresScopeReason = (membershipChanged && (oldSprint?.status === "active" || targetSprint?.status === "active")) || (estimateChanged && oldSprint?.status === "active" && !membershipChanged);
    const updateScopeReason = requiresScopeReason ? scopeChangeReason(req.body) : "";
    if (requiresScopeReason && !updateScopeReason) return fail(res, 400, "SCOPE_CHANGE_REASON_REQUIRED", "Active sprint scope changes require a reason.");
    const dependencyValidation = dependencyIds !== undefined
      ? await validateTaskDependencies({ taskId: before.id, projectId: before.project_id, dependencyIds })
      : null;
    if (dependencyValidation && !dependencyValidation.ok) return fail(res, 400, "TASK_DEPENDENCY_INVALID", dependencyValidation.message);
    if (status !== undefined && !taskStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${taskStatuses.join(", ")}`);
    }
    if (status !== undefined && !canTransition("task", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Task cannot transition from ${before.status} to ${status}.`);
    }
    if (status === "done" && !await ensureTaskCanComplete(res, before)) return;
    if (type !== undefined && !taskTypes.includes(type)) {
      return fail(res, 400, "VALIDATION_FAILED", `Task type must be one of: ${taskTypes.join(", ")}`);
    }
    const next = buildTaskUpdate(
      before,
      { title, owner, progress, status, type, estimatedHours, actualHours, remainingHours, dueDate, sprintId, assigneeId, dependencyIds: dependencyValidation?.dependencyIds },
      { expectedVersion, json },
    );
    const updateResult = await repository.updateTask(next);
    if (updateResult.changes === 0) return await taskVersionConflict(res, before, expectedVersion, repository, fail);
    const after = await repository.findTask(req.params.id);
    if (membershipChanged && oldSprint?.status === "active") {
      await sprintCommitment.recordScopeChange({ sprint: oldSprint, task: before, changeType: "remove", impactHours: -Number(before.estimated_hours || 0), reason: updateScopeReason, actor: req.user });
    }
    if (membershipChanged && targetSprint?.status === "active") {
      await sprintCommitment.recordScopeChange({ sprint: targetSprint, task: after, changeType: "add", impactHours: Number(after.estimated_hours || 0), reason: updateScopeReason, actor: req.user });
    }
    if (!membershipChanged && estimateChanged && oldSprint?.status === "active") {
      await sprintCommitment.recordScopeChange({ sprint: oldSprint, task: after, changeType: "reestimate", impactHours: Number(after.estimated_hours || 0) - Number(before.estimated_hours || 0), reason: updateScopeReason, actor: req.user });
    }
    if (status !== undefined) {
      await statusHistory.record({
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
      await recordBurndownSnapshot(after.sprint_id);
    }
    await audit(req.user, "task.update", "task", req.params.id, before, after, req.ip);
    res.json(ok(mapTask(after)));
  });

  router.patch("/tasks/:id/status", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canManageProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权变更该任务状态。");
    const expectedVersion = expectedTaskVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    const { status, progress } = req.body || {};
    if (!status) return fail(res, 400, "VALIDATION_FAILED", "status is required.");
    if (!taskStatuses.includes(status)) return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${taskStatuses.join(", ")}`);
    if (!canTransition("task", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Task cannot transition from ${before.status} to ${status}.`);
    }
    if (status === "done" && !await ensureTaskCanComplete(res, before)) return;
    const updateResult = await repository.updateTaskStatus({
      id: req.params.id,
      expectedVersion,
      status,
      statusText: status.replace("_", " "),
      remainingHours: closedTaskStatuses.has(status) ? 0 : before.remaining_hours,
      progress: progress === undefined ? (status === "done" ? 100 : before.progress) : Number(progress),
    });
    if (updateResult.changes === 0) return await taskVersionConflict(res, before, expectedVersion, repository, fail);
    const after = await repository.findTask(req.params.id);
    await statusHistory.record({
      resourceType: "task",
      resourceId: after.id,
      projectId: after.project_id,
      fromStatus: before.status,
      toStatus: after.status,
      reason: req.body?.reason,
      actor: req.user,
    });
    await audit(req.user, "task.status_update", "task", req.params.id, before, after, req.ip);
    res.json(ok(mapTask(after)));
  });

  /**
   * Cross-role handoff without project:*:
   * - submit_for_testing: owner/dev → testing + assign QA
   * - return_for_fix: owner/qa → in_progress + assign DEV
   * PM/admin (project:*) can also handoff any accessible task.
   */
  router.post(
    "/tasks/:id/handoff",
    requireAnyPermission ? requireAnyPermission(["project:*", "project:read", "test:*", "defect:*"]) : requirePermission("project:*"),
    async (req, res) => {
      const before = await repository.findTask(req.params.id);
      if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
      if (!(await canAccessProject(req.user, before.project_id))) {
        return fail(res, 403, "PERMISSION_DENIED", "无权访问该任务。");
      }
      if (typeof canWriteProject === "function" && !(await canWriteProject(req.user, before.project_id))) {
        return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot handoff a task in an archived or inaccessible project.");
      }

      const actionSpec = resolveHandoffAction(req.body?.action);
      if (!actionSpec) {
        return fail(res, 400, "VALIDATION_FAILED", "action must be one of: submit_for_testing, return_for_fix");
      }
      if (!actionSpec.fromStatuses.includes(before.status)) {
        return fail(
          res,
          409,
          "STATE_TRANSITION_NOT_ALLOWED",
          `Cannot ${actionSpec.label} from status ${before.status}. Allowed from: ${actionSpec.fromStatuses.join(", ")}`,
        );
      }
      if (!canTransition("task", before.status, actionSpec.targetStatus)) {
        return fail(
          res,
          409,
          "STATE_TRANSITION_NOT_ALLOWED",
          `Task cannot transition from ${before.status} to ${actionSpec.targetStatus}.`,
        );
      }

      const isManager = await canManageProject(req.user, before.project_id);
      const ownsTask = isTaskOwner(req.user, before);
      if (!isManager && !ownsTask) {
        return fail(res, 403, "PERMISSION_DENIED", "仅任务负责人或项目管理员可交接该任务。");
      }

      // Soft role check for non-managers: prefer matching workflow direction
      const actorRole = String(req.user?.role || "").toLowerCase();
      if (!isManager) {
        if (actionSpec.targetRole === "qa" && actorRole === "qa") {
          return fail(res, 403, "PERMISSION_DENIED", "测试工程师请使用「打回开发修复」；提交测试由开发工程师发起。");
        }
        if (actionSpec.targetRole === "dev" && actorRole === "dev") {
          return fail(res, 403, "PERMISSION_DENIED", "开发工程师请使用「提交测试」；打回修复由测试工程师发起。");
        }
      }

      const expectedVersion = expectedTaskVersion(req, res, before, fail);
      if (expectedVersion === null) return;

      const targetUser = await resolveHandoffTarget(before.project_id, {
        assigneeId: req.body?.assigneeId,
        assigneeName: req.body?.assignee || req.body?.owner,
        targetRole: actionSpec.targetRole,
      });
      if (!targetUser) {
        return fail(
          res,
          400,
          "VALIDATION_FAILED",
          actionSpec.targetRole === "qa"
            ? "请指定测试工程师（assignee/assigneeId），或确保项目中仅有一名测试成员。"
            : "请指定开发工程师（assignee/assigneeId），或确保项目中仅有一名开发成员。",
        );
      }

      const next = buildTaskHandoffUpdate(before, {
        expectedVersion,
        owner: targetUser.name,
        assigneeId: targetUser.id,
        assigneeRole: actionSpec.targetRole,
        status: actionSpec.targetStatus,
        progress: req.body?.progress === undefined
          ? (actionSpec.targetStatus === "testing" ? Math.max(Number(before.progress) || 0, 80) : before.progress)
          : Number(req.body.progress),
      });
      const updateResult = await repository.handoffTask(next);
      if (updateResult.changes === 0) return await taskVersionConflict(res, before, expectedVersion, repository, fail);

      const after = await repository.findTask(req.params.id);
      const reason = String(req.body?.reason || req.body?.statusReason || actionSpec.label).trim().slice(0, 500);
      await statusHistory.record({
        resourceType: "task",
        resourceId: after.id,
        projectId: after.project_id,
        fromStatus: before.status,
        toStatus: after.status,
        reason,
        actor: req.user,
      });
      await audit(req.user, `task.handoff.${req.body?.action}`, "task", req.params.id, before, after, req.ip);
      res.json(ok(mapTask(after)));
    },
  );

  router.delete("/tasks/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findTask(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (!(await canManageProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该任务。");
    const dependents = (await repository.listProjectTaskDependencies(before.project_id))
      .filter((task) => task.id !== before.id && dependencyIdsFor(task).includes(before.id))
      .map((task) => task.id);
    if (dependents.length) {
      return fail(res, 409, "TASK_HAS_DEPENDENTS", "Task is still referenced by dependent tasks.", { dependentTaskIds: dependents });
    }
    await repository.deleteTask(req.params.id);
    await audit(req.user, "task.delete", "task", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.patch("/sprints/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findSprint(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canManageProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该迭代。");
    const { name, goal, status, startDate, endDate } = req.body || {};
    if (status !== undefined && !sprintStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${sprintStatuses.join(", ")}`);
    }
    if (status !== undefined && !canTransition("sprint", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Sprint cannot transition from ${before.status} to ${status}.`);
    }
    if (status === "active" && before.status !== "active") {
      const readiness = await sprintActivationReadiness(before, { startDate, endDate });
      if (!readiness.ok) return fail(res, 409, "SPRINT_ACTIVATION_GATE_BLOCKED", "Sprint needs valid dates and committed tasks before activation.", readiness);
    }
    if (name !== undefined) await repository.updateSprintName(req.params.id, String(name).trim());
    if (goal !== undefined) await repository.updateSprintGoal(req.params.id, goal);
    if (status !== undefined) await repository.updateSprintStatus(req.params.id, status);
    if (startDate !== undefined) await repository.updateSprintStartDate(req.params.id, startDate);
    if (endDate !== undefined) await repository.updateSprintEndDate(req.params.id, endDate);
    const after = await repository.findSprint(req.params.id);
    if (status === "active" && before.status !== "active") await sprintCommitment.createBaseline(after, req.user);
    if (status !== undefined) {
      await statusHistory.record({
        resourceType: "sprint",
        resourceId: after.id,
        projectId: after.project_id,
        fromStatus: before.status,
        toStatus: after.status,
        reason: req.body?.statusReason,
        actor: req.user,
      });
    }
    await audit(req.user, "sprint.update", "sprint", req.params.id, before, after, req.ip);
    res.json(ok(mapSprint(after)));
  });

  router.delete("/sprints/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findSprint(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canManageProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该迭代。");
    if (before.status === "active") return fail(res, 409, "SPRINT_ACTIVE_CANNOT_DELETE", "Active sprint must be closed before deletion.");
    const taskCount = await repository.taskCountForSprint(req.params.id);
    if (taskCount > 0) {
      return fail(
        res,
        409,
        "SPRINT_HAS_TASKS",
        "迭代仍有关联任务，不能直接删除。请先将任务移出迭代。",
        { dependencies: { tasks: taskCount } },
      );
    }
    await repository.deleteSprint(req.params.id);
    await audit(req.user, "sprint.delete", "sprint", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/sprints/:id/status-history", async (req, res) => {
    const sprint = await repository.findSprintId(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canAccessProject(req.user, sprint.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代状态历史。");
    res.json(ok(await statusHistory.list("sprint", sprint.id)));
  });

  router.get("/sprints/:id/commitment", async (req, res) => {
    const sprint = await repository.findSprintId(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canAccessProject(req.user, sprint.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代承诺基线。");
    res.json(ok(await sprintCommitment.getCommitment(sprint.id)));
  });

  router.get("/sprints/:id/scope-changes", async (req, res) => {
    const sprint = await repository.findSprintId(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canAccessProject(req.user, sprint.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代范围变更记录。");
    res.json(ok(await sprintCommitment.listScopeChanges(sprint.id)));
  });

  router.post("/sprints/:id/tasks", requirePermission("project:*"), async (req, res) => {
    const sprint = await repository.findSprint(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canManageProject(req.user, sprint.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权管理该迭代任务。");
    const { taskId } = req.body || {};
    if (!taskId) return fail(res, 400, "VALIDATION_FAILED", "taskId is required.");
    const task = await repository.findTask(taskId);
    if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
    if (task.project_id !== sprint.project_id) {
      return fail(res, 400, "VALIDATION_FAILED", "Task must belong to the same project as the sprint.");
    }
    const addScopeReason = requireScopeChangeReason(res, sprint, req.body);
    if (sprint.status === "active" && !addScopeReason) return;
    await repository.assignTaskToSprint(taskId, req.params.id);
    const updated = await repository.findTask(taskId);
    await recordBurndownSnapshot(req.params.id);
    if (sprint.status === "active") {
      await sprintCommitment.recordScopeChange({ sprint, task: updated, changeType: "add", impactHours: updated.estimated_hours, reason: addScopeReason, actor: req.user });
    }
    await audit(req.user, "sprint.add_task", "task", taskId, task, updated, req.ip);
    res.json(ok(mapTask(updated)));
  });

  router.get("/sprints/:id/burndown", async (req, res) => {
    const sprint = await repository.findSprint(req.params.id);
    if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    if (!(await canAccessProject(req.user, sprint.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该迭代燃尽图。");
    const data = await buildSprintBurndown(req.params.id);
    if (!data) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
    res.json(ok(data));
  });

  return router;
}

module.exports = {
  createTasksRouter,
};
