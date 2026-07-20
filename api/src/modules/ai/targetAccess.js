function createAiTargetAccess({
  row,
  fail,
  canViewDocument,
  canAccessProject,
  canWriteProject,
  isOrganizationProjectManager,
}) {
  function aiTargetScope(targetType, targetId) {
    if (targetType === "project") {
      const project = row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id: targetId });
      return project ? { projectId: project.id } : null;
    }
    if (targetType === "requirement") {
      const requirement = row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: targetId });
      return requirement ? { projectId: requirement.project_id } : null;
    }
    if (["test_case", "defect", "build"].includes(targetType)) {
      const table = targetType === "test_case" ? "test_cases" : targetType === "defect" ? "defects" : "builds";
      const item = row(`SELECT project_id FROM ${table} WHERE id = @id`, { id: targetId });
      return item ? { projectId: item.project_id } : null;
    }
    if (targetType === "release") {
      const release = row("SELECT build_id FROM releases WHERE id = @id", { id: targetId });
      if (!release) return null;
      const build = release.build_id ? row("SELECT project_id FROM builds WHERE id = @id", { id: release.build_id }) : null;
      return { projectId: build?.project_id || null };
    }
    if (targetType === "document") {
      const document = row("SELECT * FROM documents WHERE id = @id", { id: targetId });
      return document ? { projectId: document.project_id || null, document } : null;
    }
    return null;
  }

  function ensureAiTargetAccess(req, res, targetType, targetId, { write = false } = {}) {
    const scope = aiTargetScope(targetType, targetId);
    if (!scope) {
      fail(res, 404, "RESOURCE_NOT_FOUND", "AI target not found.");
      return false;
    }
    if (scope.document && !canViewDocument(req.user, scope.document)) {
      fail(res, 403, "PERMISSION_DENIED", "You cannot access this document.");
      return false;
    }
    if (scope.projectId && !(write ? canWriteProject(req.user, scope.projectId) : canAccessProject(req.user, scope.projectId))) {
      fail(res, 403, "PERMISSION_DENIED", "You cannot access this AI target.");
      return false;
    }
    if (!scope.projectId && !scope.document && !isOrganizationProjectManager(req.user)) {
      fail(res, 403, "PERMISSION_DENIED", "Only project managers and administrators can access unscoped AI targets.");
      return false;
    }
    return true;
  }

  return { aiTargetScope, ensureAiTargetAccess };
}

module.exports = { createAiTargetAccess };
