const express = require("express");
const { filterAsync } = require("../../lib/asyncIter");
const { hasPermission } = require("../../security/accessControl");
const { canTransition } = require("../../workflow/stateMachine");
const {
  buildRequirementCreate,
  buildRequirementUpdate,
  validateRequirementCreate,
  validateRequirementUpdate,
} = require("./service");

function expectedRequirementVersion(req, res, requirement, fail) {
  const version = Number(req.body?.version);
  if (!Number.isInteger(version) || version < 1) {
    fail(res, 400, "VERSION_REQUIRED", "A positive integer version is required when updating a requirement.");
    return null;
  }
  return version;
}

async function versionConflict(res, requirement, expectedVersion, repository, fail) {
  const current = await repository.findRequirementVersion(requirement.id);
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

  function hasCatalogAccess(user) {
    return hasPermission(user, "product:*") || hasPermission(user, "project:*");
  }

  function portfolioProductIds(portfolio) {
    const source = portfolio?.product_ids;
    if (Array.isArray(source)) return source.map((id) => String(id).trim()).filter(Boolean);
    if (typeof source !== "string") return [];
    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed.map((id) => String(id).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async function canAccessProduct(user, productId) {
    if (hasCatalogAccess(user)) return true;
    const projects = await repository.listActiveProjectIdsByProduct(productId);
    return (await filterAsync(projects, async (project) => await canAccessProject(user, project.id))).length > 0;
  }

  async function canAccessPortfolio(user, portfolio) {
    if (hasCatalogAccess(user)) return true;
    for (const productId of portfolioProductIds(portfolio)) {
      if (await canAccessProduct(user, productId)) return true;
    }
    return false;
  }

  async function validateRequirementReferences(user, { productId, portfolioId }) {
    const product = productId ? await repository.findProduct(productId) : null;
    if (productId && !product) {
      return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND", message: "Product not found." };
    }
    if (product && !(await canAccessProduct(user, product.id))) {
      return { ok: false, status: 403, code: "PERMISSION_DENIED", message: "Cannot access this product." };
    }

    const portfolio = portfolioId ? await repository.findPortfolio(portfolioId) : null;
    if (portfolioId && !portfolio) {
      return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND", message: "Portfolio not found." };
    }
    if (portfolio && !(await canAccessPortfolio(user, portfolio))) {
      return { ok: false, status: 403, code: "PERMISSION_DENIED", message: "Cannot access this portfolio." };
    }
    if (product && portfolio && !portfolioProductIds(portfolio).includes(product.id)) {
      return {
        ok: false,
        status: 409,
        code: "PRODUCT_PORTFOLIO_MISMATCH",
        message: "Product must belong to the selected portfolio.",
      };
    }
    return { ok: true };
  }

  function failReferenceValidation(res, validation) {
    return fail(res, validation.status, validation.code, validation.message);
  }

  async function validateParentRequirement(res, { requirementId, parentId, projectId }) {
    if (!parentId) return true;
    const visited = new Set();
    let current = await repository.findRequirement(parentId);
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
      current = current.parent_id ? await repository.findRequirement(current.parent_id) : null;
    }
    return true;
  }

  router.get("/requirements", async (req, res) => {
    const __src_allItems = await repository.listRequirements(req.query);
    const __mid_allItems = await filterAsync(__src_allItems, async (requirement) => await canAccessProject(req.user, requirement.project_id));
    const allItems = __mid_allItems.map(mapRequirement);;
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/requirements", requirePermission("requirement:*"), async (req, res) => {
    const parsed = validateRequirementCreate(req.body || {}, { priorities: requirementPriorities });
    if (!parsed.ok) {
      return fail(res, 400, "VALIDATION_FAILED", parsed.message, parsed.field ? { field: parsed.field } : undefined);
    }
    const {
      title,
      projectId,
      owner,
      priority,
      description,
      acceptanceCriteria,
      productId,
      portfolioId,
      parentId,
      assignee,
      assigneeRole,
    } = parsed.data;
    if (!(await canWriteProject(req.user, projectId))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a requirement in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, projectId))) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建需求。");
    const referenceValidation = await validateRequirementReferences(req.user, { productId, portfolioId });
    if (!referenceValidation.ok) return failReferenceValidation(res, referenceValidation);
    if (!(await validateParentRequirement(res, { parentId, projectId }))) return;
    const idempotency = await beginIdempotentRequest(req, res, "requirement.create");
    if (!idempotency) return;
    try {
      const response = await transaction(async () => {
        const currentReferenceValidation = await validateRequirementReferences(req.user, { productId, portfolioId });
        if (!currentReferenceValidation.ok) return { referenceValidation: currentReferenceValidation };
        const requirement = buildRequirementCreate(
          { title, projectId, owner, priority, description, acceptanceCriteria, productId, portfolioId, parentId, assignee, assigneeRole },
          { id: await nextId("REQ", "requirements"), json },
        );
        await repository.createRequirement(requirement);
        await statusHistory.record({
          resourceType: "requirement",
          resourceId: requirement.id,
          projectId: requirement.project_id,
          toStatus: requirement.status,
          reason: "需求创建",
          actor: req.user,
        });
        const taskId = await syncRequirementTask(requirement);
        await mergeRequirementLinkedTask(requirement.id, taskId);
        const created = ok(mapRequirement(await repository.findRequirement(requirement.id)));
        await audit(req.user, "requirement.create", "requirement", requirement.id, null, created.data, req.ip);
        await idempotency.commit(201, created);
        return created;
      });
      if (response.referenceValidation) {
        await idempotency.abort();
        return failReferenceValidation(res, response.referenceValidation);
      }
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.get("/requirements/:id/completion-score", async (req, res) => {
    const requirement = await repository.findRequirementProject(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canAccessProject(req.user, requirement.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求。");
    const score = await requirementScore(req.params.id);
    res.json(ok(score));
  });

  router.get("/requirements/:id", async (req, res) => {
    const requirement = await repository.findRequirement(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canAccessProject(req.user, requirement.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求。");
    res.json(ok(mapRequirement(requirement)));
  });

  router.get("/requirements/:id/status-history", async (req, res) => {
    const requirement = await repository.findRequirementId(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canAccessProject(req.user, requirement.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求状态历史。");
    res.json(ok(await statusHistory.list("requirement", requirement.id)));
  });

  router.patch("/requirements/:id", async (req, res) => {
    const before = await repository.findRequirement(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canOperateRequirement(req.user, before))) {
      return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
    }
    const parsed = validateRequirementUpdate(req.body || {}, { priorities: requirementPriorities });
    if (!parsed.ok) {
      // Keep VERSION_REQUIRED for missing/invalid version so existing clients and tests stay consistent.
      if (parsed.field === "version") {
        return fail(res, 400, "VERSION_REQUIRED", parsed.message, { field: "version" });
      }
      return fail(res, 400, "VALIDATION_FAILED", parsed.message, parsed.field ? { field: parsed.field } : undefined);
    }
    const expectedVersion = parsed.data.version;
    const {
      title,
      description,
      priority,
      acceptanceCriteria,
      parentId,
      assignee,
      assigneeRole,
      assignmentStatus,
      completion,
      productId,
      portfolioId,
    } = parsed.data;
    if (parentId !== undefined && parentId === req.params.id) {
      return fail(res, 400, "VALIDATION_FAILED", "A requirement cannot be its own parent.");
    }
    if (parentId !== undefined && !(await validateParentRequirement(res, {
      requirementId: req.params.id,
      parentId,
      projectId: before.project_id,
    }))) return;
    const referenceValidation = await validateRequirementReferences(req.user, {
      productId: productId === undefined ? before.product_id || null : productId,
      portfolioId: portfolioId === undefined ? before.portfolio_id || null : portfolioId,
    });
    if (!referenceValidation.ok) return failReferenceValidation(res, referenceValidation);
    const next = buildRequirementUpdate(
      before,
      { title, description, priority, acceptanceCriteria, productId, portfolioId, parentId, assignee, assigneeRole, assignmentStatus, completion },
      { expectedVersion, json },
    );
    const outcome = await transaction(async () => {
      const currentReferenceValidation = await validateRequirementReferences(req.user, {
        productId: next.productId,
        portfolioId: next.portfolioId,
      });
      if (!currentReferenceValidation.ok) return { referenceValidation: currentReferenceValidation };
      const updateResult = await repository.updateRequirement(next);
      if (updateResult.changes === 0) return { conflict: true };
      const after = await repository.findRequirement(req.params.id);
      const taskId = await syncRequirementTask(after);
      await mergeRequirementLinkedTask(req.params.id, taskId);
      const result = await repository.findRequirement(req.params.id);
      await audit(req.user, "requirement.update", "requirement", req.params.id, before, result, req.ip);
      return { data: mapRequirement(result) };
    });
    if (outcome.referenceValidation) return failReferenceValidation(res, outcome.referenceValidation);
    if (outcome.conflict) return await versionConflict(res, before, expectedVersion, repository, fail);
    res.json(ok(outcome.data));
  });

  router.get("/requirements/:id/children", async (req, res) => {
    const requirement = await repository.findRequirementId(req.params.id);
    if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canAccessProject(req.user, requirement.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该需求。");
    const children = (await repository.listChildren(req.params.id)).map(mapRequirement);
    res.json(ok(children));
  });

  router.patch("/requirements/:id/status", async (req, res) => {
    const before = await repository.findRequirement(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权变更该需求状态。");
    if (!(await canOperateRequirement(req.user, before))) {
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
    const outcome = await transaction(async () => {
      const updateResult = await repository.updateRequirementStatus({
        id: req.params.id,
        status,
        completion: releaseReadyRequirementStatuses.has(status) ? 100 : before.completion,
        expectedVersion,
      });
      if (updateResult.changes === 0) return { conflict: true };
      const after = await repository.findRequirement(req.params.id);
      await statusHistory.record({
        resourceType: "requirement",
        resourceId: after.id,
        projectId: after.project_id,
        fromStatus: before.status,
        toStatus: after.status,
        reason: req.body?.statusReason,
        actor: req.user,
      });
      await syncRequirementTask(after);
      await audit(req.user, "requirement.status_update", "requirement", req.params.id, before, after, req.ip);
      return { data: mapRequirement(after) };
    });
    if (outcome.conflict) return await versionConflict(res, before, expectedVersion, repository, fail);
    res.json(ok(outcome.data));
  });

  router.delete("/requirements/:id", requirePermission("requirement:*"), async (req, res) => {
    const before = await repository.findRequirement(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该需求。");
    const wantsCascade = req.query.cascade === "true";
    if (wantsCascade) {
      const removed = await transaction(() => repository.cascadeDeleteRequirement({ id: req.params.id, now: now() }));
      await audit(req.user, "requirement.cascade_delete", "requirement", req.params.id, before, null, req.ip);
      for (const item of removed.tasks) await audit(req.user, "requirement.cascade_delete", "task", item.id, { id: item.id, requirementId: req.params.id }, null, req.ip);
      for (const item of removed.defects) await audit(req.user, "requirement.cascade_delete", "defect", item.id, { id: item.id, requirementId: req.params.id }, null, req.ip);
      for (const item of removed.testCases) await audit(req.user, "requirement.cascade_delete", "test_case", item.id, { id: item.id, requirementId: req.params.id }, null, req.ip);
      for (const item of removed.testRuns) await audit(req.user, "requirement.cascade_delete", "test_run", item.id, { id: item.id, testCaseId: item.testCaseId }, null, req.ip);
      for (const item of removed.syncTasks) await audit(req.user, "requirement.cascade_delete", "task", item.id, { id: item.id, testCaseId: item.testCaseId }, null, req.ip);
      for (const item of removed.children) await audit(req.user, "requirement.cascade_delete", "requirement", item.id, { id: item.id, parentId: req.params.id }, null, req.ip);
      return res.json(ok({ deleted: true, id: req.params.id, cascaded: true }));
    }
    const dependencies = await repository.requirementDependencies(req.params.id);
    if (Object.keys(dependencies).length > 0) {
      return fail(
        res,
        409,
        "REQUIREMENT_HAS_DEPENDENCIES",
        "需求仍有关联数据，不能直接删除。请先关闭或解除关联数据。",
        { dependencies },
      );
    }
    await repository.softDeleteRequirement({ id: req.params.id, deletedAt: now() });
    await audit(req.user, "requirement.delete", "requirement", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  return router;
}

module.exports = {
  createRequirementsRouter,
};
