const express = require("express");
const { canTransition } = require("../../workflow/stateMachine");
const { buildRequirementCreate, buildRequirementUpdate } = require("./service");

function expectedRequirementVersion(req, res, requirement, fail) {
  const version = Number(req.body?.version);
  if (!Number.isInteger(version) || version < 1) {
    fail(res, 400, "VERSION_REQUIRED", "A positive integer version is required when updating a requirement.");
    return null;
  }
  return version;
}

function versionConflict(res, requirement, expectedVersion, repository, fail) {
  const current = repository.findRequirementVersion(requirement.id);
  return fail(res, 409, "VERSION_CONFLICT", "Requirement was changed by another user. Refresh and retry your update.", {
    expectedVersion,
    currentVersion: Number(current?.version) || null,
  });
}

function createRequirementsRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject,
  canWriteProject,
  canOperateRequirement,
  ensureRoleAllowed,
  fail,
  json,
  mapRequirement,
  mergeRequirementLinkedTask,
  nextId,
  now,
  ok,
  paginatedResponse,
  releaseReadyRequirementStatuses,
  requirementPriorities,
  requirementScore,
  requirementStatuses,
  requirePermission,
  repository,
  statusHistory,
  syncRequirementTask,
  transaction,
}) {
  const router = express.Router();

  function validateParentRequirement(res, { requirementId, parentId, projectId }) {
    if (!parentId) return true;
    const visited = new Set();
    let current = repository.findRequirement(parentId);
    if (!current) {
      fail(res, 404, "RESOURCE_NOT_FOUND", "Parent requirement not found.");
      return false;
    }
    if (current.project_id !== projectId) {
      fail(res, 400, "VALIDATION_FAILED", "Parent requirement must belong to the same project.");
      return false;
    }
    while (current) {
      if (current.id === requirementId || visited.has(current.id)) {
        fail(res, 400, "VALIDATION_FAILED", "Requirement parent relation must not contain a cycle.");
        return false;
      }
      visited.add(current.id);
      current = current.parent_id ? repository.findRequirement(current.parent_id) : null;
    }
    return true;
  }

  router.get("/requirements", (req, res) => {
    const allItems = repository.listRequirements(req.query)
      .filter((requirement) => canAccessProject(req.user, requirement.project_id))
      .map(mapRequirement);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/requirements", requirePermission("requirement:*"), (req, res) => {
    const { title, projectId, owner, priority, description, acceptanceCriteria, productId, portfolioId, parentId, assignee, assigneeRole } = req.body || {};
    if (!title || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Requirement title and projectId are required.");
    if (!canWriteProject(req.user, projectId)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a requirement in an archived or inaccessible project.");
    if (!canAccessProject(req.user, projectId)) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建需求。");
    if (!validateParentRequirement(res, { parentId, projectId })) return;
    if (assigneeRole) {
      const roleError = ensureRoleAllowed(assigneeRole, ["dev", "qa"], "assigneeRole");
      if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
    }
    const idempotency = beginIdempotentRequest(req, res, "requirement.create");
    if (!idempotency) return;
    try {
      const response = transaction(() => {
        const requirement = buildRequirementCreate(
          { title, projectId, owner, priority, description, acceptanceCriteria, productId, portfolioId, parentId, assignee, assigneeRole },
          { id: nextId("REQ", "requirements"), json },
        );
        repository.createRequirement(requirement);
        statusHistory.record({
          resourceType: "requirement",
          resourceId: requirement.id,
          projectId: requirement.project_id,
          toStatus: requirement.status,
          reason: "需求创建",
          actor: req.user,
        });
        const taskId = syncRequirementTask(requirement);
        mergeRequirementLinkedTask(requirement.id, taskId);
        const created = ok(mapRequirement(repository.findRequirement(requirement.id)));
        audit(req.user, "requirement.create", "requirement", requirement.id, null, created.data, req.ip);
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.get("/requirements/:id/completion-score", (req, res) => {
    const requirement = repository.findRequirementProject(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canAccessProject(req.user, requirement.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求。");
    const score = requirementScore(req.params.id);
    res.json(ok(score));
  });

  router.get("/requirements/:id", (req, res) => {
    const requirement = repository.findRequirement(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canAccessProject(req.user, requirement.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求。");
    res.json(ok(mapRequirement(requirement)));
  });

  router.get("/requirements/:id/status-history", (req, res) => {
    const requirement = repository.findRequirementId(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canAccessProject(req.user, requirement.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求状态历史。");
    res.json(ok(statusHistory.list("requirement", requirement.id)));
  });

  router.patch("/requirements/:id", (req, res) => {
    const before = repository.findRequirement(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canOperateRequirement(req.user, before)) {
      return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
    }
    const expectedVersion = expectedRequirementVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    const { title, description, priority, acceptanceCriteria, parentId, assignee, assigneeRole, assignmentStatus, completion } = req.body || {};
    if (priority !== undefined && !requirementPriorities.includes(priority)) {
      return fail(res, 400, "VALIDATION_FAILED", `Priority must be one of: ${requirementPriorities.join(", ")}`);
    }
    if (assigneeRole !== undefined && assigneeRole !== null && assigneeRole !== "") {
      const roleError = ensureRoleAllowed(assigneeRole, ["dev", "qa"], "assigneeRole");
      if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
    }
    if (parentId !== undefined && parentId === req.params.id) {
      return fail(res, 400, "VALIDATION_FAILED", "A requirement cannot be its own parent.");
    }
    if (parentId !== undefined && !validateParentRequirement(res, {
      requirementId: req.params.id,
      parentId,
      projectId: before.project_id,
    })) return;
    const next = buildRequirementUpdate(
      before,
      { title, description, priority, acceptanceCriteria, parentId, assignee, assigneeRole, assignmentStatus, completion },
      { expectedVersion, json },
    );
    const outcome = transaction(() => {
      const updateResult = repository.updateRequirement(next);
      if (updateResult.changes === 0) return { conflict: true };
      const after = repository.findRequirement(req.params.id);
      const taskId = syncRequirementTask(after);
      mergeRequirementLinkedTask(req.params.id, taskId);
      const result = repository.findRequirement(req.params.id);
      audit(req.user, "requirement.update", "requirement", req.params.id, before, result, req.ip);
      return { data: mapRequirement(result) };
    });
    if (outcome.conflict) return versionConflict(res, before, expectedVersion, repository, fail);
    res.json(ok(outcome.data));
  });

  router.get("/requirements/:id/children", (req, res) => {
    const requirement = repository.findRequirementId(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canAccessProject(req.user, requirement.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求。");
    const children = repository.listChildren(req.params.id).map(mapRequirement);
    res.json(ok(children));
  });

  router.patch("/requirements/:id/status", (req, res) => {
    const before = repository.findRequirement(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权变更该需求状态。");
    if (!canOperateRequirement(req.user, before)) {
      return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
    }
    const expectedVersion = expectedRequirementVersion(req, res, before, fail);
    if (expectedVersion === null) return;
    const { status } = req.body || {};
    if (!status || !requirementStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Requirement status must be one of: ${requirementStatuses.join(", ")}`);
    }
    if (!canTransition("requirement", before.status, status)) {
      return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Requirement cannot transition from ${before.status} to ${status}.`);
    }
    const outcome = transaction(() => {
      const updateResult = repository.updateRequirementStatus({
        id: req.params.id,
        status,
        completion: releaseReadyRequirementStatuses.has(status) ? 100 : before.completion,
        expectedVersion,
      });
      if (updateResult.changes === 0) return { conflict: true };
      const after = repository.findRequirement(req.params.id);
      statusHistory.record({
        resourceType: "requirement",
        resourceId: after.id,
        projectId: after.project_id,
        fromStatus: before.status,
        toStatus: after.status,
        reason: req.body?.statusReason,
        actor: req.user,
      });
      syncRequirementTask(after);
      audit(req.user, "requirement.status_update", "requirement", req.params.id, before, after, req.ip);
      return { data: mapRequirement(after) };
    });
    if (outcome.conflict) return versionConflict(res, before, expectedVersion, repository, fail);
    res.json(ok(outcome.data));
  });

  router.delete("/requirements/:id", requirePermission("requirement:*"), (req, res) => {
    const before = repository.findRequirement(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权删除该需求。");
    const dependencies = repository.requirementDependencies(req.params.id);
    if (Object.keys(dependencies).length > 0) {
      return fail(
        res,
        409,
        "REQUIREMENT_HAS_DEPENDENCIES",
        "需求仍有关联数据，不能直接删除。请先关闭或解除关联数据。",
        { dependencies },
      );
    }
    repository.softDeleteRequirement({ id: req.params.id, deletedAt: now() });
    audit(req.user, "requirement.delete", "requirement", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  return router;
}

module.exports = {
  createRequirementsRouter,
};
