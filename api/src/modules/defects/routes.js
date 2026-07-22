const express = require("express");
const { filterAsync, mapAsync, forEachAsync } = require("../../lib/asyncIter");
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

  async function validateRelatedResources(res, projectId, { requirementId, foundInBuild }) {
    if (requirementId) {
      const requirement = await repository.findRequirementProject(requirementId);
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
      const build = await repository.findBuildProject(foundInBuild);
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

  router.get("/defects", async (req, res) => {
    const __src_allItems = await repository.listDefects(req.query);
    const __mid_allItems = await filterAsync(__src_allItems, async (defect) => await canAccessProject(req.user, defect.project_id));
    const allItems = __mid_allItems.map(mapDefect);;
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/defects", requireAnyPermission(["project:*", "defect:*"]), async (req, res) => {
    const { title, severity, status, projectId, requirementId, assignee, assigneeRole, foundInBuild, affectedVersion } = req.body || {};
    if (!title || !String(title).trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Defect title is required and cannot be empty.");
    }
    if (!projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Defect projectId is required.");
    }
    if (!(await canWriteProject(req.user, projectId))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a defect in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, projectId))) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建缺陷。");
    if (severity !== undefined && severity !== null && severity !== "" && !defectSeverities.includes(severity)) {
      return fail(res, 400, "VALIDATION_FAILED", `Severity must be one of: ${defectSeverities.join(", ")}`);
    }
    if (!(await validateRelatedResources(res, projectId, { requirementId, foundInBuild }))) return;
    const defect = buildDefectCreate({ title, severity, status, projectId, requirementId, assignee, assigneeRole, foundInBuild, affectedVersion }, { id: await nextId("BUG", "defects"), reporter: req.user.name });
    await repository.createDefect(defect);
    await syncDefectTask(defect);
    await audit(req.user, "defect.create", "defect", defect.id, null, defect, req.ip);
    res.status(201).json(ok(mapDefect(await repository.findDefect(defect.id))));
  });

  router.patch("/defects/:id/status", requireAnyPermission(["project:*", "defect:*"]), async (req, res) => {
    const before = await repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot change a defect in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权变更该缺陷状态。");
    const { status } = req.body || {};
    if (!status || !defectStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Defect status must be one of: ${defectStatuses.join(", ")}`);
    }
    await repository.updateDefectStatus(req.params.id, status);
    const after = await repository.findDefect(req.params.id);
    await syncDefectTask(after);
    await audit(req.user, "defect.status_update", "defect", req.params.id, before, after, req.ip);
    res.json(ok(mapDefect(after)));
  });

  router.patch("/defects/:id", requireAnyPermission(["project:*", "defect:*"]), async (req, res) => {
    const before = await repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot update a defect in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该缺陷。");
    const { title, description, severity, assignee, assigneeRole, requirementId, foundInBuild, affectedVersion, status } = req.body || {};
    if (severity !== undefined && !defectSeverities.includes(severity)) {
      return fail(res, 400, "VALIDATION_FAILED", `Severity must be one of: ${defectSeverities.join(", ")}`);
    }
    if (status !== undefined && !defectStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Defect status must be one of: ${defectStatuses.join(", ")}`);
    }
    if (!(await validateRelatedResources(res, before.project_id, { requirementId, foundInBuild }))) return;
    if (title !== undefined) await repository.updateDefectTitle(req.params.id, String(title).trim());
    if (description !== undefined) await repository.updateDefectDescription(req.params.id, description || null);
    if (severity !== undefined) await repository.updateDefectSeverity(req.params.id, severity);
    if (assignee !== undefined) await repository.updateDefectAssignee(req.params.id, assignee);
    if (assigneeRole !== undefined) await repository.updateDefectAssigneeRole(req.params.id, assigneeRole);
    if (requirementId !== undefined) await repository.updateDefectRequirement(req.params.id, requirementId);
    if (foundInBuild !== undefined) await repository.updateDefectBuild(req.params.id, foundInBuild || null);
    if (affectedVersion !== undefined) await repository.updateDefectAffectedVersion(req.params.id, affectedVersion || null);
    if (status !== undefined) await repository.updateDefectStatus(req.params.id, status);
    const after = await repository.findDefect(req.params.id);
    await syncDefectTask(after);
    await audit(req.user, "defect.update", "defect", req.params.id, before, after, req.ip);
    res.json(ok(mapDefect(after)));
  });

  router.delete("/defects/:id", requireAnyPermission(["project:*", "defect:*"]), async (req, res) => {
    const before = await repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete a defect in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该缺陷。");
    await repository.deleteDefect(req.params.id);
    await audit(req.user, "defect.delete", "defect", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  /**
   * Cross-role defect handoff for assignees without full defect:* write on every field:
   * - assign_to_dev: QA/PM → developer fix (status → in_fix when appropriate)
   * - assign_to_qa: DEV/PM → tester verify (status → resolved when fixing)
   * Allowed for: defect:*, project:*, or current assignee.
   */
  router.post("/defects/:id/handoff", async (req, res) => {
    const before = await repository.findDefect(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
    if (!(await canAccessProject(req.user, before.project_id))) {
      return fail(res, 403, "PERMISSION_DENIED", "无权访问该缺陷。");
    }
    if (!(await canWriteProject(req.user, before.project_id))) {
      return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot handoff a defect in an archived or inaccessible project.");
    }

    const perms = req.user?.permissions || [];
    const isPrivileged = perms.includes("*") || perms.includes("project:*") || perms.includes("defect:*");
    const isAssignee = before.assignee && req.user?.name && before.assignee === req.user.name;
    if (!isPrivileged && !isAssignee) {
      return fail(res, 403, "PERMISSION_DENIED", "仅缺陷处理人或具备缺陷/项目管理权限的用户可交接。");
    }

    const action = String(req.body?.action || "").trim();
    if (!["assign_to_dev", "assign_to_qa"].includes(action)) {
      return fail(res, 400, "VALIDATION_FAILED", "action must be assign_to_dev or assign_to_qa");
    }
    const assignee = String(req.body?.assignee || "").trim();
    if (!assignee) return fail(res, 400, "VALIDATION_FAILED", "assignee is required.");

    const targetRole = action === "assign_to_dev" ? "dev" : "qa";
    let nextStatus = before.status;
    if (action === "assign_to_dev") {
      if (["new", "confirmed", "resolved", "verified"].includes(before.status)) nextStatus = "in_fix";
    } else if (action === "assign_to_qa") {
      if (["new", "confirmed", "in_fix"].includes(before.status)) nextStatus = "resolved";
    }
    if (req.body?.status && defectStatuses.includes(req.body.status)) {
      nextStatus = req.body.status;
    }

    await repository.updateDefectAssignee(req.params.id, assignee);
    await repository.updateDefectAssigneeRole(req.params.id, targetRole);
    if (nextStatus !== before.status) await repository.updateDefectStatus(req.params.id, nextStatus);
    const after = await repository.findDefect(req.params.id);
    await syncDefectTask(after);
    await audit(req.user, `defect.handoff.${action}`, "defect", req.params.id, before, after, req.ip);
    res.json(ok(mapDefect(after)));
  });

  return router;
}

module.exports = {
  createDefectsRouter,
};
