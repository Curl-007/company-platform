const express = require("express");
const { filterAsync, mapAsync, forEachAsync } = require("../../lib/asyncIter");
const { buildProjectCreate, buildProjectUpdate } = require("./service");

function createProjectsRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject,
  canManageProject,
  canTransition,
  expectedProjectVersion,
  fail,
  json,
  mapProject,
  mapSprint,
  mapTask,
  nextId,
  normalizeRole,
  now,
  ok,
  parse,
  paginatedResponse,
  projectActivationReadiness,
  projectStatuses,
  repository,
  requirePermission,
  sourceBrowser,
  statusHistory,
  transaction,
}) {
  const router = express.Router();

  function mapMember(item) {
    return {
      id: item.id,
      projectId: item.project_id,
      userId: item.user_id || null,
      userName: item.user_name,
      role: item.role,
      source: item.source,
      createdAt: item.created_at,
    };
  }

  router.get("/projects", async (req, res) => {
    const __src_allItems = await repository.listProjects(req.query);
    const __mid_allItems = await filterAsync(__src_allItems, async (project) => await canAccessProject(req.user, project.id));
    const allItems = __mid_allItems.map(mapProject);
    res.json(ok(paginatedResponse(allItems, req.query)));
  });

  router.post("/projects", requirePermission("project:*"), async (req, res) => {
    const { name, owner, status, progress, programId, productId, processMode, code, objective, description, startDate, endDate, sourcePath } = req.body || {};
    if (!name || !owner) return fail(res, 400, "VALIDATION_FAILED", "Project name and owner are required.");
    if (status !== undefined && status !== "planning") return fail(res, 400, "VALIDATION_FAILED", "New projects must start in planning status.");
    const idempotency = await beginIdempotentRequest(req, res, "project.create");
    if (!idempotency) return;
    try {
      const response = await transaction(async () => {
        const project = buildProjectCreate(
          { name, owner, status, progress, programId, productId, processMode, code, objective, description, startDate, endDate, sourcePath },
          { id: await nextId("PRJ", "projects"), now: now(), json },
        );
        await repository.createProject(project);
        await statusHistory.record({ resourceType: "project", resourceId: project.id, projectId: project.id, toStatus: project.status, reason: "项目创建", actor: req.user });
        await audit(req.user, "project.create", "project", project.id, null, project, req.ip);
        const created = ok(mapProject(await repository.findProject(project.id)));
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.get("/projects/:id/status-history", async (req, res) => {
    const project = await repository.findProjectId(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目状态历史。");
    res.json(ok(await statusHistory.list("project", project.id)));
  });

  router.patch("/projects/:id/status", requirePermission("project:*"), async (req, res) => {
    if (!req.body.status || !projectStatuses.includes(req.body.status)) return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${projectStatuses.join(", ")}`);
    const before = await repository.findProject(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canManageProject(req.user, before.id))) return fail(res, 403, "PERMISSION_DENIED", "无权变更该项目状态。");
    const expectedVersion = expectedProjectVersion(req, res, before);
    if (expectedVersion === null) return;
    if (!canTransition("project", before.status, req.body.status)) return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Project cannot transition from ${before.status} to ${req.body.status}.`);
    if (req.body.status === "active" && before.status !== "active") {
      const readiness = await projectActivationReadiness(before, repository, parse);
      if (!readiness.ok) return fail(res, 409, "PROJECT_ACTIVATION_GATE_BLOCKED", "Project needs an objective, planned dates, members, a milestone or sprint, approved capacity allocations, and matching capacity plans before activation.", readiness);
    }
    const updateResult = await repository.updateProjectStatus({ id: req.params.id, status: req.body.status, updatedAt: now(), expectedVersion });
    if (updateResult.changes === 0) {
      const current = await repository.findProjectVersion(req.params.id);
      return fail(res, 409, "VERSION_CONFLICT", "Project was changed by another user. Refresh and retry your update.", { expectedVersion, currentVersion: Number(current?.version) || null });
    }
    const after = await repository.findProject(req.params.id);
    await statusHistory.record({ resourceType: "project", resourceId: after.id, projectId: after.id, fromStatus: before.status, toStatus: after.status, reason: req.body?.statusReason, actor: req.user });
    await audit(req.user, "project.status_update", "project", req.params.id, before, after, req.ip);
    res.json(ok(mapProject(after)));
  });

  router.patch("/projects/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findProject(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canManageProject(req.user, before.id))) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该项目。");
    const expectedVersion = expectedProjectVersion(req, res, before);
    if (expectedVersion === null) return;
    const { name, code, objective, description, owner, status, progress, processMode, programId, productId, milestones, startDate, endDate, sourcePath } = req.body || {};
    const next = buildProjectUpdate(
      { ...before },
      { name, code, objective, description, owner, status, progress, processMode, programId, productId, milestones, startDate, endDate, sourcePath },
      { expectedVersion, now: now() },
    );
    if (status !== undefined) {
      if (!projectStatuses.includes(status)) return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${projectStatuses.join(", ")}`);
      if (!canTransition("project", before.status, status)) return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Project cannot transition from ${before.status} to ${status}.`);
      if (status === "active" && before.status !== "active") {
        const readiness = await projectActivationReadiness(next, repository, parse);
        if (!readiness.ok) return fail(res, 409, "PROJECT_ACTIVATION_GATE_BLOCKED", "Project needs an objective, planned dates, members, a milestone or sprint, approved capacity allocations, and matching capacity plans before activation.", readiness);
      }
    }
    const updateResult = await repository.updateProject(next);
    if (updateResult.changes === 0) {
      const current = await repository.findProjectVersion(req.params.id);
      return fail(res, 409, "VERSION_CONFLICT", "Project was changed by another user. Refresh and retry your update.", { expectedVersion, currentVersion: Number(current?.version) || null });
    }
    const after = await repository.findProject(req.params.id);
    if (status !== undefined) await statusHistory.record({ resourceType: "project", resourceId: after.id, projectId: after.id, fromStatus: before.status, toStatus: after.status, reason: req.body?.statusReason, actor: req.user });
    await audit(req.user, "project.update", "project", req.params.id, before, after, req.ip);
    res.json(ok(mapProject(after)));
  });

  router.delete("/projects/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findProject(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canManageProject(req.user, before.id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该项目。");
    const dependencies = await repository.projectDependencies(req.params.id);
    if (Object.keys(dependencies).length > 0) {
      return fail(
        res,
        409,
        "PROJECT_HAS_DEPENDENCIES",
        "项目仍有关联数据，不能直接删除。请先归档项目或解除关联数据。",
        { dependencies },
      );
    }
    await repository.softDeleteProject({ id: req.params.id, deletedAt: now() });
    await audit(req.user, "project.delete", "project", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/projects/:id", async (req, res) => {
    const project = await repository.findProject(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目。");
    const mapped = mapProject(project);
    const projectTasks = (await repository.listProjectTasks(req.params.id)).map(mapTask);
    const projectSprints = (await repository.listProjectSprints(req.params.id)).map(mapSprint);
    res.json(ok({ ...mapped, tasks: projectTasks, sprints: projectSprints }));
  });

  router.get("/projects/:id/sources", requirePermission("source:read"), async (req, res) => {
    const project = await repository.findProject(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "Cannot access sources for this project.");
    try {
      const data = sourceBrowser.browse(project.source_path, req.query.path, req.query.content === "1");
      return res.json(ok(data));
    } catch (error) {
      return fail(res, error.status || 500, error.code || "SOURCE_BROWSER_FAILED", error.message || "Unable to read project source.");
    }
  });

  router.post("/projects/:id/milestones", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findProject(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canManageProject(req.user, before.id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot add milestones to an archived or inaccessible project.");
    const { name, status, date } = req.body || {};
    if (!name) return fail(res, 400, "VALIDATION_FAILED", "Milestone name is required.");
    const milestones = parse(before.milestones, []);
    milestones.push({ name: String(name).trim(), status: status || "planned", date: date || now().slice(0, 10) });
    await repository.updateProjectMilestones({ id: before.id, milestones: json(milestones), updatedAt: now() });
    const after = await repository.findProject(before.id);
    await audit(req.user, "project.milestone_add", "project", before.id, before, after, req.ip);
    return res.status(201).json(ok({ milestones }));
  });

  router.delete("/projects/:id/milestones/:index", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findProject(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canManageProject(req.user, before.id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot remove milestones from an archived or inaccessible project.");
    const index = Number.parseInt(req.params.index, 10);
    const milestones = parse(before.milestones, []);
    if (!Number.isInteger(index) || index < 0 || index >= milestones.length) return fail(res, 400, "VALIDATION_FAILED", "Invalid milestone index.");
    milestones.splice(index, 1);
    await repository.updateProjectMilestones({ id: before.id, milestones: json(milestones), updatedAt: now() });
    const after = await repository.findProject(before.id);
    await audit(req.user, "project.milestone_remove", "project", before.id, before, after, req.ip);
    return res.json(ok({ milestones }));
  });

  router.get("/projects/:id/members", async (req, res) => {
    const project = await repository.findProject(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该项目成员。");
    const members = (await repository.listProjectMembers(req.params.id)).map(mapMember);
    res.json(ok(members));
  });

  router.post("/projects/:id/members", requirePermission("project:*"), async (req, res) => {
    const project = await repository.findProject(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canManageProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "无权管理该项目成员。");
    const userName = String(req.body?.userName || "").trim();
    const role = normalizeRole(req.body?.role);
    if (!userName) return fail(res, 400, "VALIDATION_FAILED", "userName is required.");
    if (!["pdm", "dev", "qa"].includes(role)) return fail(res, 400, "VALIDATION_FAILED", "role must be pdm, dev, or qa.");
    const user = await repository.findActiveUserByName(userName);
    if (!user) return fail(res, 400, "VALIDATION_FAILED", "userName must identify an active user.");
    const existing = await repository.findProjectMemberByIdentity({ projectId: req.params.id, userId: user.id, userName, role });
    if (existing) {
      if (!existing.user_id) await repository.reconnectProjectMemberUser(existing.id, user.id);
      return res.json(ok(mapMember({ ...existing, user_id: user.id })));
    }
    const member = {
      id: await nextId("PMEM", "project_members"),
      project_id: req.params.id,
      user_id: user.id,
      user_name: userName,
      role,
      source: "manual",
      created_at: now(),
    };
    await repository.saveProjectMember(member);
    await audit(req.user, "project.member_add", "project", req.params.id, null, member, req.ip);
    res.status(201).json(ok(mapMember(member)));
  });

  router.delete("/projects/:id/members/:memberId", requirePermission("project:*"), async (req, res) => {
    if (!(await canManageProject(req.user, req.params.id))) return fail(res, 403, "PERMISSION_DENIED", "无权管理该项目成员。");
    const member = await repository.findProjectMember(req.params.memberId, req.params.id);
    if (!member) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project member not found.");
    await repository.deleteProjectMember(req.params.memberId);
    await audit(req.user, "project.member_remove", "project", req.params.id, member, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.memberId }));
  });

  return router;
}

module.exports = {
  createProjectsRouter,
};
