const express = require("express");
const { buildBuildCreate, buildReleaseApproval, buildReleaseCreate, buildRollbackCreate } = require("./service");

function createDeliveryRouter({
  audit,
  beginIdempotentRequest,
  buildReleaseReport,
  buildStatuses,
  canAccessProject,
  canWriteProject,
  fail,
  isOrganizationProjectManager,
  json,
  listDeliveryGateResults,
  mapBuild,
  mapRelease,
  mapReleaseApproval,
  mapRollbackRecord,
  nextId,
  now,
  ok,
  parse,
  releaseStatuses,
  releaseTypes,
  requireAnyPermission,
  requirePermission,
  repository,
  transaction,
  validateBuildStatusTransition,
  validateReleaseStatusTransition,
}) {
  const router = express.Router();
  const write = (work) => transaction(work);

  function normalizeLinkedIds(res, value, label) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      fail(res, 400, "VALIDATION_FAILED", `${label} must be an array of IDs.`);
      return null;
    }
    const ids = [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
    if (ids.length > 100) {
      fail(res, 400, "VALIDATION_FAILED", `${label} must contain at most 100 IDs.`);
      return null;
    }
    return ids;
  }

  function validateLinkedResources(res, projectId, linkedStories, linkedBugs) {
    const storyIds = normalizeLinkedIds(res, linkedStories, "linkedStories");
    if (!storyIds) return false;
    const bugIds = normalizeLinkedIds(res, linkedBugs, "linkedBugs");
    if (!bugIds) return false;
    for (const requirementId of storyIds) {
      const requirement = repository.findRequirementProject(requirementId);
      if (!requirement) {
        fail(res, 404, "RESOURCE_NOT_FOUND", "Linked requirement not found.");
        return false;
      }
      if (requirement.project_id !== projectId) {
        fail(res, 400, "VALIDATION_FAILED", "Linked requirements must belong to the same project as the build or release.");
        return false;
      }
    }
    for (const defectId of bugIds) {
      const defect = repository.findDefectProject(defectId);
      if (!defect) {
        fail(res, 404, "RESOURCE_NOT_FOUND", "Linked defect not found.");
        return false;
      }
      if (defect.project_id !== projectId) {
        fail(res, 400, "VALIDATION_FAILED", "Linked defects must belong to the same project as the build or release.");
        return false;
      }
    }
    return true;
  }

  function loadReleaseBuild(release) {
    return release?.build_id ? repository.findBuild(release.build_id) : null;
  }

  function canAccessBuild(user, build) {
    return Boolean(build && canAccessProject(user, build.project_id));
  }

  function canWriteBuild(user, build) {
    return Boolean(build && canWriteProject(user, build.project_id));
  }

  function canAccessRelease(user, release) {
    if (!release) return false;
    const build = loadReleaseBuild(release);
    return build ? canAccessBuild(user, build) : isOrganizationProjectManager(user);
  }

  function canWriteRelease(user, release) {
    if (!release) return false;
    const build = loadReleaseBuild(release);
    return build ? canWriteBuild(user, build) : isOrganizationProjectManager(user);
  }

  function ensureBuildAccess(req, res, build, message = "无权访问该构建。") {
    if (canAccessBuild(req.user, build)) return true;
    fail(res, 403, "PERMISSION_DENIED", message);
    return false;
  }

  function ensureBuildWrite(req, res, build, message = "无权修改该构建。") {
    if (canWriteBuild(req.user, build)) return true;
    fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", message);
    return false;
  }

  function ensureReleaseAccess(req, res, release, message = "无权访问该发布。") {
    if (canAccessRelease(req.user, release)) return true;
    fail(res, 403, "PERMISSION_DENIED", message);
    return false;
  }

  function ensureReleaseWrite(req, res, release, message = "无权修改该发布。") {
    if (canWriteRelease(req.user, release)) return true;
    fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", message);
    return false;
  }

  router.get("/delivery/gates", (req, res) => {
    const { kind, id, ready } = req.query;
    let results = listDeliveryGateResults().filter((item) => {
      if (item.kind === "build") return canAccessBuild(req.user, repository.findBuild(item.id));
      if (item.kind === "release") return canAccessRelease(req.user, repository.findRelease(item.id));
      return false;
    });
    if (kind) results = results.filter((item) => item.kind === kind);
    if (id) results = results.filter((item) => item.id === id);
    if (ready === "true") results = results.filter((item) => item.ready);
    if (ready === "false") results = results.filter((item) => !item.ready);
    res.json(ok(results));
  });

  router.get("/builds", (req, res) => {
    res.json(ok(repository.listBuilds(req.query).filter((build) => canAccessBuild(req.user, build)).map(mapBuild)));
  });

  router.post("/builds", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
    const { projectId, name, version, buildDate, linkedStories, linkedBugs, scmHash, notes } = req.body || {};
    if (!projectId || !name) return fail(res, 400, "VALIDATION_FAILED", "Build projectId and name are required.");
    const project = repository.findProjectId(projectId);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!canWriteProject(req.user, projectId)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a build in an archived or inaccessible project.");
    if (!validateLinkedResources(res, project.id, linkedStories, linkedBugs)) return;
    const idempotency = beginIdempotentRequest(req, res, "build.create");
    if (!idempotency) return;
    const build = buildBuildCreate(
      { projectId, name, version, buildDate, linkedStories, linkedBugs, scmHash, notes },
      { id: nextId("BLD", "builds"), actor: req.user, now, json },
    );
    try {
      const response = write(() => {
        repository.createBuild(build);
        audit(req.user, "build.create", "build", build.id, null, build, req.ip);
        const created = ok(mapBuild(repository.findBuild(build.id)));
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.patch("/builds/:id", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
    const before = repository.findBuild(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
    if (!ensureBuildWrite(req, res, before, "Cannot update a build in an archived or inaccessible project.")) return;
    const { name, version, buildDate, linkedStories, linkedBugs, scmHash, notes } = req.body || {};
    if (!validateLinkedResources(
      res,
      before.project_id,
      linkedStories === undefined ? parse(before.linked_stories, []) : linkedStories,
      linkedBugs === undefined ? parse(before.linked_bugs, []) : linkedBugs,
    )) return;
    const response = write(() => {
      if (name !== undefined) repository.updateBuildName(req.params.id, String(name).trim());
      if (version !== undefined) repository.updateBuildVersion(req.params.id, version);
      if (buildDate !== undefined) repository.updateBuildDate(req.params.id, buildDate);
      if (linkedStories !== undefined) repository.updateBuildStories(req.params.id, json(linkedStories));
      if (linkedBugs !== undefined) repository.updateBuildBugs(req.params.id, json(linkedBugs));
      if (scmHash !== undefined) repository.updateBuildScmHash(req.params.id, scmHash);
      if (notes !== undefined) repository.updateBuildNotes(req.params.id, notes);
      const after = repository.findBuild(req.params.id);
      audit(req.user, "build.update", "build", req.params.id, before, after, req.ip);
      return ok(mapBuild(after));
    });
    res.json(response);
  });

  router.patch("/builds/:id/status", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
    const before = repository.findBuild(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
    if (!ensureBuildWrite(req, res, before, "Cannot update a build in an archived or inaccessible project.")) return;
    const { status } = req.body || {};
    if (!buildStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Build status must be one of: ${buildStatuses.join(", ")}`);
    }
    const gate = validateBuildStatusTransition(before, status);
    if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
    const response = write(() => {
      repository.updateBuildStatus(req.params.id, status);
      const after = repository.findBuild(req.params.id);
      audit(req.user, "build.status_update", "build", req.params.id, before, after, req.ip);
      return ok(mapBuild(after));
    });
    res.json(response);
  });

  router.delete("/builds/:id", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
    const before = repository.findBuild(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
    if (!ensureBuildWrite(req, res, before, "Cannot delete a build in an archived or inaccessible project.")) return;
    const releaseCount = repository.countReleasesForBuild(req.params.id);
    if (releaseCount > 0) return fail(res, 409, "BUILD_HAS_RELEASES", "构建已关联发布，不能删除。", { releaseCount });
    const response = write(() => {
      repository.deleteBuild(req.params.id);
      audit(req.user, "build.delete", "build", req.params.id, before, null, req.ip);
      return ok({ deleted: req.params.id });
    });
    res.json(response);
  });

  router.get("/releases", (req, res) => {
    res.json(ok(repository.listReleases(req.query).filter((release) => canAccessRelease(req.user, release)).map(mapRelease)));
  });

  router.post("/releases", requirePermission("project:*"), (req, res) => {
    const { productId, name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes } = req.body || {};
    if (!name) return fail(res, 400, "VALIDATION_FAILED", "Release name is required.");
    if (releaseType && !releaseTypes.includes(releaseType)) {
      return fail(res, 400, "VALIDATION_FAILED", `Release type must be one of: ${releaseTypes.join(", ")}`);
    }
    let build = null;
    if (buildId) {
      build = repository.findBuild(buildId);
      if (!build) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
      if (!canWriteBuild(req.user, build)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a release from a build in an archived or inaccessible project.");
    } else if (!isOrganizationProjectManager(req.user)) {
      return fail(res, 403, "PERMISSION_DENIED", "未关联构建的历史发布仅项目经理和管理员可维护。");
    }
    if (!build) {
      const storyIds = normalizeLinkedIds(res, linkedStories, "linkedStories");
      if (!storyIds) return;
      const bugIds = normalizeLinkedIds(res, linkedBugs, "linkedBugs");
      if (!bugIds) return;
      if (storyIds.length || bugIds.length) {
        return fail(res, 400, "VALIDATION_FAILED", "A release needs a build before it can link requirements or defects.");
      }
    } else if (!validateLinkedResources(res, build.project_id, linkedStories, linkedBugs)) return;
    const idempotency = beginIdempotentRequest(req, res, "release.create");
    if (!idempotency) return;
    const release = buildReleaseCreate(
      { productId, name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes },
      { id: nextId("REL", "releases"), actor: req.user, now, json },
    );
    try {
      const response = write(() => {
        repository.createRelease(release);
        audit(req.user, "release.create", "release", release.id, null, release, req.ip);
        const created = ok(mapRelease(repository.findRelease(release.id)));
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.patch("/releases/:id", requirePermission("project:*"), (req, res) => {
    const before = repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseWrite(req, res, before, "Cannot update a release in an archived or inaccessible project.")) return;
    if (repository.findApprovalByApprover(before.id, req.user.id)) {
      return fail(res, 403, "RELEASE_APPROVER_CONTENT_CHANGE_FORBIDDEN", "An approver cannot modify release content after recording a decision.");
    }
    const { name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes } = req.body || {};
    if (releaseType !== undefined && !releaseTypes.includes(releaseType)) {
      return fail(res, 400, "VALIDATION_FAILED", `Release type must be one of: ${releaseTypes.join(", ")}`);
    }
    let targetBuild = loadReleaseBuild(before);
    if (buildId !== undefined && buildId !== null && buildId !== "") {
      targetBuild = repository.findBuild(buildId);
      const build = targetBuild;
      if (!build) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
      if (!canWriteBuild(req.user, build)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot link a build in an archived or inaccessible project.");
    } else if (buildId !== undefined) {
      targetBuild = null;
    }
    const targetStories = linkedStories === undefined ? parse(before.linked_stories, []) : linkedStories;
    const targetBugs = linkedBugs === undefined ? parse(before.linked_bugs, []) : linkedBugs;
    if (!targetBuild) {
      const storyIds = normalizeLinkedIds(res, targetStories, "linkedStories");
      if (!storyIds) return;
      const bugIds = normalizeLinkedIds(res, targetBugs, "linkedBugs");
      if (!bugIds) return;
      if (storyIds.length || bugIds.length) {
        return fail(res, 400, "VALIDATION_FAILED", "A release needs a build before it can link requirements or defects.");
      }
    } else if (!validateLinkedResources(res, targetBuild.project_id, targetStories, targetBugs)) return;
    const response = write(() => {
      if (name !== undefined) repository.updateReleaseName(req.params.id, String(name).trim());
      if (version !== undefined) repository.updateReleaseVersion(req.params.id, version);
      if (releaseDate !== undefined) repository.updateReleaseDate(req.params.id, releaseDate);
      if (buildId !== undefined) repository.updateReleaseBuild(req.params.id, buildId);
      if (releaseType !== undefined) repository.updateReleaseType(req.params.id, releaseType);
      if (linkedStories !== undefined) repository.updateReleaseStories(req.params.id, json(linkedStories));
      if (linkedBugs !== undefined) repository.updateReleaseBugs(req.params.id, json(linkedBugs));
      if (releaseNotes !== undefined) repository.updateReleaseNotes(req.params.id, releaseNotes);
      const after = repository.findRelease(req.params.id);
      audit(req.user, "release.update", "release", req.params.id, before, after, req.ip);
      return ok(mapRelease(after));
    });
    res.json(response);
  });

  router.patch("/releases/:id/status", requirePermission("project:*"), (req, res) => {
    const before = repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseWrite(req, res, before, "Cannot update a release in an archived or inaccessible project.")) return;
    const { status } = req.body || {};
    if (!releaseStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Release status must be one of: ${releaseStatuses.join(", ")}`);
    }
    const gate = validateReleaseStatusTransition(before, status);
    if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
    const response = write(() => {
      repository.updateReleaseStatus(req.params.id, status);
      const after = repository.findRelease(req.params.id);
      audit(req.user, "release.status_update", "release", req.params.id, before, after, req.ip);
      return ok(mapRelease(after));
    });
    res.json(response);
  });

  router.get("/releases/:id/approvals", (req, res) => {
    const release = repository.findRelease(req.params.id);
    if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseAccess(req, res, release)) return;
    res.json(ok(repository.listApprovals(req.params.id).map(mapReleaseApproval)));
  });

  router.post("/releases/:id/approvals", requirePermission("project:*"), (req, res) => {
    const before = repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseWrite(req, res, before, "Cannot approve a release in an archived or inaccessible project.")) return;
    if (before.creator_id === req.user.id || (!before.creator_id && before.creator === req.user.name)) {
      return fail(res, 403, "SELF_APPROVAL_FORBIDDEN", "发布创建者不能审批自己的发布。");
    }
    if (repository.findApprovalByApprover(before.id, req.user.id)) {
      return fail(res, 409, "RELEASE_APPROVAL_ALREADY_RECORDED", "Each approver can submit only one immutable decision for a release.");
    }
    const { decision, comment } = req.body || {};
    if (!["approve", "reject"].includes(decision)) {
      return fail(res, 400, "VALIDATION_FAILED", "Approval decision must be approve or reject.");
    }

    if (decision === "approve") {
      const gate = validateReleaseStatusTransition(before, "staging");
      if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
    }

    const idempotency = beginIdempotentRequest(req, res, "release.approval.create");
    if (!idempotency) return;

    const approval = buildReleaseApproval(
      { decision, comment },
      { id: nextId("APR", "release_approvals"), releaseId: req.params.id, actor: req.user, now },
    );
    let response;
    try {
      response = write(() => {
        repository.createApproval(approval);
        if (decision === "approve" && before.status === "draft") {
          repository.updateReleaseStatus(req.params.id, "staging");
        }
        const after = repository.findRelease(req.params.id);
        audit(req.user, `release.approval_${decision}`, "release", req.params.id, before, { release: after, approval }, req.ip);
        const created = ok({ approval: mapReleaseApproval(approval), release: mapRelease(after) });
        idempotency.commit(201, created);
        return created;
      });
    } catch (error) {
      idempotency.abort();
      if (String(error?.message || "").includes("idx_release_approvals_release_approver")) {
        return fail(res, 409, "RELEASE_APPROVAL_ALREADY_RECORDED", "Each approver can submit only one immutable decision for a release.");
      }
      throw error;
    }
    res.status(201).json(response);
  });

  router.get("/releases/:id/rollbacks", (req, res) => {
    const release = repository.findRelease(req.params.id);
    if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseAccess(req, res, release)) return;
    res.json(ok(repository.listRollbacks(req.params.id).map(mapRollbackRecord)));
  });

  router.post("/releases/:id/rollbacks", requirePermission("project:*"), (req, res) => {
    const before = repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseWrite(req, res, before, "Cannot record a rollback in an archived or inaccessible project.")) return;
    const transition = validateReleaseStatusTransition(before, "rollback");
    if (!transition.ok) return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", transition.message, transition.details);
    const { reason, impact, plan } = req.body || {};
    if (!String(reason || "").trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Rollback reason is required.");
    }
    const idempotency = beginIdempotentRequest(req, res, "release.rollback.create");
    if (!idempotency) return;
    const rollback = buildRollbackCreate(
      { reason, impact, plan },
      { id: nextId("RBK", "rollback_records"), releaseId: req.params.id, actor: req.user, now },
    );
    try {
      const response = write(() => {
        repository.createRollback(rollback);
        repository.updateReleaseStatus(req.params.id, "rollback");
        const after = repository.findRelease(req.params.id);
        audit(req.user, "release.rollback_create", "release", req.params.id, before, { release: after, rollback }, req.ip);
        const created = ok({ rollback: mapRollbackRecord(rollback), release: mapRelease(after) });
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.get("/releases/:id/report", (req, res) => {
    const release = repository.findRelease(req.params.id);
    if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseAccess(req, res, release)) return;
    res.json(ok(buildReleaseReport(release)));
  });

  router.delete("/releases/:id", requirePermission("project:*"), (req, res) => {
    const before = repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!ensureReleaseWrite(req, res, before, "Cannot delete a release in an archived or inaccessible project.")) return;
    const response = write(() => {
      repository.deleteRelease(req.params.id);
      audit(req.user, "release.delete", "release", req.params.id, before, null, req.ip);
      return ok({ deleted: req.params.id });
    });
    res.json(response);
  });

  return router;
}

module.exports = {
  createDeliveryRouter,
};
