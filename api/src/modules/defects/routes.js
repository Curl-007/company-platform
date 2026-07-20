const express = require("express");
const { buildDefectCreate } = require("./service");

function createDefectsRouter({
  audit,
  canAccessProject,
  canWriteProject,
  defectSeverities,
  defectStatuses,
  fail,
  mapDefect,
  nextId,
  ok,
  paginatedResponse,
  requireAnyPermission,
  repository,
  syncDefectTask,
}) {
  const router = express.Router();

  function validateRelatedResources(res, projectId, { requirementId, foundInBuild }) {
    if (requirementId) {
      const requirement = repository.findRequirementProject(requirementId);
      if (!requirement) {
        fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
        return false;
      }
      if (requirement.project_id !== projectId) {
        fail(res, 400, "VALIDATION_FAILED", "Requirement must belong to the same project as the defect.");
        return false;
      }
    }
    if (foundInBuild) {
      const build = repository.findBuildProject(foundInBuild);
      if (!build) {
        fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
        return false;
      }
      if (build.project_id !== projectId) {
        fail(res, 400, "VALIDATION_FAILED", "Build must belong to the same project as the defect.");
        return false;
      }
    }
    return true;
  }

  router.get("/defects", (req, res) => {
    const allItems = repository.listDefects(req.query)
      .filter((defect) => canAccessProject(req.user, defect.project_id))
      .map(mapDefect);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/defects", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
    const { title, severity, status, projectId, requirementId, assignee, assigneeRole, foundInBuild, affectedVersion } = req.body || {};
    if (!title || !String(title).trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Defect title is required and cannot be empty.");
    }
    if (!projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Defect projectId is required.");
    }
    if (!canWriteProject(req.user, projectId)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a defect in an archived or inaccessible project.");
    if (!canAccessProject(req.user, projectId)) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建缺陷。");
    if (severity !== undefined && severity !== null && severity !== "" && !defectSeverities.includes(severity)) {
      return fail(res, 400, "VALIDATION_FAILED", `Severity must be one of: ${defectSeverities.join(", ")}`);
    }
    if (!validateRelatedResources(res, projectId, { requirementId, foundInBuild })) return;
    const defect = buildDefectCreate({ title, severity, status, projectId, requirementId, assignee, assigneeRole, foundInBuild, affectedVersion }, { id: nextId("BUG", "defects"), reporter: req.user.name });
    repository.createDefect(defect);
    syncDefectTask(defect);
    audit(req.user, "defect.create", "defect", defect.id, null, defect, req.ip);
    res.status(201).json(ok(mapDefect(repository.findDefect(defect.id))));
  });

  router.patch("/defects/:id/status", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
    const before = repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!canWriteProject(req.user, before.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot change a defect in an archived or inaccessible project.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权变更该缺陷状态。");
    const { status } = req.body || {};
    if (!status || !defectStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Defect status must be one of: ${defectStatuses.join(", ")}`);
    }
    repository.updateDefectStatus(req.params.id, status);
    const after = repository.findDefect(req.params.id);
    syncDefectTask(after);
    audit(req.user, "defect.status_update", "defect", req.params.id, before, after, req.ip);
    res.json(ok(mapDefect(after)));
  });

  router.patch("/defects/:id", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
    const before = repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!canWriteProject(req.user, before.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot update a defect in an archived or inaccessible project.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该缺陷。");
    const { title, description, severity, assignee, assigneeRole, requirementId, foundInBuild, affectedVersion, status } = req.body || {};
    if (severity !== undefined && !defectSeverities.includes(severity)) {
      return fail(res, 400, "VALIDATION_FAILED", `Severity must be one of: ${defectSeverities.join(", ")}`);
    }
    if (status !== undefined && !defectStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Defect status must be one of: ${defectStatuses.join(", ")}`);
    }
    if (!validateRelatedResources(res, before.project_id, { requirementId, foundInBuild })) return;
    if (title !== undefined) repository.updateDefectTitle(req.params.id, String(title).trim());
    if (description !== undefined) repository.updateDefectDescription(req.params.id, description || null);
    if (severity !== undefined) repository.updateDefectSeverity(req.params.id, severity);
    if (assignee !== undefined) repository.updateDefectAssignee(req.params.id, assignee);
    if (assigneeRole !== undefined) repository.updateDefectAssigneeRole(req.params.id, assigneeRole);
    if (requirementId !== undefined) repository.updateDefectRequirement(req.params.id, requirementId);
    if (foundInBuild !== undefined) repository.updateDefectBuild(req.params.id, foundInBuild || null);
    if (affectedVersion !== undefined) repository.updateDefectAffectedVersion(req.params.id, affectedVersion || null);
    if (status !== undefined) repository.updateDefectStatus(req.params.id, status);
    const after = repository.findDefect(req.params.id);
    syncDefectTask(after);
    audit(req.user, "defect.update", "defect", req.params.id, before, after, req.ip);
    res.json(ok(mapDefect(after)));
  });

  router.delete("/defects/:id", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
    const before = repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!canWriteProject(req.user, before.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete a defect in an archived or inaccessible project.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权删除该缺陷。");
    repository.deleteDefect(req.params.id);
    audit(req.user, "defect.delete", "defect", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  return router;
}

module.exports = {
  createDefectsRouter,
};
