const express = require("express");
const { filterAsync } = require("../../lib/asyncIter");
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

  async function validateLinkedResources(res, projectId, linkedStories, linkedBugs) {
    const storyIds = normalizeLinkedIds(res, linkedStories, "linkedStories");
    if (!storyIds) return false;
    const bugIds = normalizeLinkedIds(res, linkedBugs, "linkedBugs");
    if (!bugIds) return false;
    for (const requirementId of storyIds) {
      const requirement = await repository.findRequirementProject(requirementId);
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
      const defect = await repository.findDefectProject(defectId);
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

  async function loadReleaseBuild(release) {
    return release?.build_id ? await repository.findBuild(release.build_id) : null;
  }

  async function canAccessBuild(user, build) {
    return Boolean(build && (await canAccessProject(user, build.project_id)));
  }

  async function canWriteBuild(user, build) {
    return Boolean(build && (await canWriteProject(user, build.project_id)));
  }

  async function canAccessRelease(user, release) {
    if (!release) return false;
    const build = await loadReleaseBuild(release);
    return build ? await canAccessBuild(user, build) : isOrganizationProjectManager(user);
  }

  async function canWriteRelease(user, release) {
    if (!release) return false;
    const build = await loadReleaseBuild(release);
    return build ? await canWriteBuild(user, build) : isOrganizationProjectManager(user);
  }

  async function ensureBuildWrite(req, res, build, message = "无权修改该构建。") {
    if (await canWriteBuild(req.user, build)) return true;
    fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", message);
    return false;
  }

  async function ensureReleaseAccess(req, res, release, message = "无权访问该发布。") {
    if (await canAccessRelease(req.user, release)) return true;
    fail(res, 403, "PERMISSION_DENIED", message);
    return false;
  }

  async function ensureReleaseWrite(req, res, release, message = "无权修改该发布。") {
    if (await canWriteRelease(req.user, release)) return true;
    fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", message);
    return false;
  }

  router.get("/delivery/gates", async (req, res) => {
    const { kind, id, ready } = req.query;
    let results = await filterAsync(await listDeliveryGateResults(), async (item) => {
      if (item.kind === "build") return await canAccessBuild(req.user, await repository.findBuild(item.id));
      if (item.kind === "release") return await canAccessRelease(req.user, await repository.findRelease(item.id));
      return false;
    });
    if (kind) results = results.filter((item) => item.kind === kind);
    if (id) results = results.filter((item) => item.id === id);
    if (ready === "true") results = results.filter((item) => item.ready);
    if (ready === "false") results = results.filter((item) => !item.ready);
    res.json(ok(results));
  });

  router.get("/builds", async (req, res) => {
    const builds = await repository.listBuilds(req.query);
    const visibleBuilds = await filterAsync(builds, async (build) => await canAccessBuild(req.user, build));
    res.json(ok(visibleBuilds.map(mapBuild)));
  });

  router.post("/builds", requireAnyPermission(["project:*", "build:*"]), async (req, res) => {
    const { projectId, name, version, buildDate, linkedStories, linkedBugs, scmHash, notes } = req.body || {};
    if (!projectId || !name) return fail(res, 400, "VALIDATION_FAILED", "Build projectId and name are required.");
    const project = await repository.findProjectId(projectId);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canWriteProject(req.user, projectId))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a build in an archived or inaccessible project.");
    if (!(await validateLinkedResources(res, project.id, linkedStories, linkedBugs))) return;
    const idempotency = await beginIdempotentRequest(req, res, "build.create");
    if (!idempotency) return;
    const build = buildBuildCreate(
      { projectId, name, version, buildDate, linkedStories, linkedBugs, scmHash, notes },
      { id: await nextId("BLD", "builds"), actor: req.user, now, json },
    );
    try {
      const response = await write(async () => {
        await repository.createBuild(build);
        await audit(req.user, "build.create", "build", build.id, null, build, req.ip);
        const created = ok(mapBuild(await repository.findBuild(build.id)));
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.patch("/builds/:id", requireAnyPermission(["project:*", "build:*"]), async (req, res) => {
    const before = await repository.findBuild(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
    if (!(await ensureBuildWrite(req, res, before, "Cannot update a build in an archived or inaccessible project."))) return;
    const { name, version, buildDate, linkedStories, linkedBugs, scmHash, notes } = req.body || {};
    if (!(await validateLinkedResources(
      res,
      before.project_id,
      linkedStories === undefined ? parse(before.linked_stories, []) : linkedStories,
      linkedBugs === undefined ? parse(before.linked_bugs, []) : linkedBugs,
    ))) return;
    const response = await write(async () => {
      if (name !== undefined) await repository.updateBuildName(req.params.id, String(name).trim());
      if (version !== undefined) await repository.updateBuildVersion(req.params.id, version);
      if (buildDate !== undefined) await repository.updateBuildDate(req.params.id, buildDate);
      if (linkedStories !== undefined) await repository.updateBuildStories(req.params.id, json(linkedStories));
      if (linkedBugs !== undefined) await repository.updateBuildBugs(req.params.id, json(linkedBugs));
      if (scmHash !== undefined) await repository.updateBuildScmHash(req.params.id, scmHash);
      if (notes !== undefined) await repository.updateBuildNotes(req.params.id, notes);
      const after = await repository.findBuild(req.params.id);
      await audit(req.user, "build.update", "build", req.params.id, before, after, req.ip);
      return ok(mapBuild(after));
    });
    res.json(response);
  });

  router.patch("/builds/:id/status", requireAnyPermission(["project:*", "build:*"]), async (req, res) => {
    const before = await repository.findBuild(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
    if (!(await ensureBuildWrite(req, res, before, "Cannot update a build in an archived or inaccessible project."))) return;
    const { status } = req.body || {};
    if (!buildStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Build status must be one of: ${buildStatuses.join(", ")}`);
    }
    const gate = await validateBuildStatusTransition(before, status);
    if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
    const response = await write(async () => {
      await repository.updateBuildStatus(req.params.id, status);
      const after = await repository.findBuild(req.params.id);
      await audit(req.user, "build.status_update", "build", req.params.id, before, after, req.ip);
      return ok(mapBuild(after));
    });
    res.json(response);
  });

  router.delete("/builds/:id", requireAnyPermission(["project:*", "build:*"]), async (req, res) => {
    const before = await repository.findBuild(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
    if (!(await ensureBuildWrite(req, res, before, "Cannot delete a build in an archived or inaccessible project."))) return;
    const releaseCount = await repository.countReleasesForBuild(req.params.id);
    if (releaseCount > 0) return fail(res, 409, "BUILD_HAS_RELEASES", "构建已关联发布，不能删除。", { releaseCount });
    const response = await write(async () => {
      await repository.deleteBuild(req.params.id);
      await audit(req.user, "build.delete", "build", req.params.id, before, null, req.ip);
      return ok({ deleted: req.params.id });
    });
    res.json(response);
  });

  router.get("/releases", async (req, res) => {
    const releases = await repository.listReleases(req.query);
    const visibleReleases = await filterAsync(releases, async (release) => await canAccessRelease(req.user, release));
    res.json(ok(visibleReleases.map(mapRelease)));
  });

  router.post("/releases", requirePermission("project:*"), async (req, res) => {
    const { productId, name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes } = req.body || {};
    if (!name) return fail(res, 400, "VALIDATION_FAILED", "Release name is required.");
    if (releaseType && !releaseTypes.includes(releaseType)) {
      return fail(res, 400, "VALIDATION_FAILED", `Release type must be one of: ${releaseTypes.join(", ")}`);
    }
    let build = null;
    if (buildId) {
      build = await repository.findBuild(buildId);
      if (!build) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
      if (!(await canWriteBuild(req.user, build)) ) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a release from a build in an archived or inaccessible project.");
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
    } else if (!(await validateLinkedResources(res, build.project_id, linkedStories, linkedBugs))) return;
    const idempotency = await beginIdempotentRequest(req, res, "release.create");
    if (!idempotency) return;
    const release = buildReleaseCreate(
      { productId, name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes },
      { id: await nextId("REL", "releases"), actor: req.user, now, json },
    );
    try {
      const response = await write(async () => {
        await repository.createRelease(release);
        await audit(req.user, "release.create", "release", release.id, null, release, req.ip);
        const created = ok(mapRelease(await repository.findRelease(release.id)));
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.patch("/releases/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseWrite(req, res, before, "Cannot update a release in an archived or inaccessible project."))) return;
    if (await repository.findApprovalByApprover(before.id, req.user.id)) {
      return fail(res, 403, "RELEASE_APPROVER_CONTENT_CHANGE_FORBIDDEN", "An approver cannot modify release content after recording a decision.");
    }
    const { name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes } = req.body || {};
    if (releaseType !== undefined && !releaseTypes.includes(releaseType)) {
      return fail(res, 400, "VALIDATION_FAILED", `Release type must be one of: ${releaseTypes.join(", ")}`);
    }
    let targetBuild = loadReleaseBuild(before);
    if (buildId !== undefined && buildId !== null && buildId !== "") {
      targetBuild = await repository.findBuild(buildId);
      const build = targetBuild;
      if (!build) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
      if (!(await canWriteBuild(req.user, build)) ) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot link a build in an archived or inaccessible project.");
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
    } else if (!(await validateLinkedResources(res, targetBuild.project_id, targetStories, targetBugs))) return;
    const response = await write(async () => {
      if (name !== undefined) await repository.updateReleaseName(req.params.id, String(name).trim());
      if (version !== undefined) await repository.updateReleaseVersion(req.params.id, version);
      if (releaseDate !== undefined) await repository.updateReleaseDate(req.params.id, releaseDate);
      if (buildId !== undefined) await repository.updateReleaseBuild(req.params.id, buildId);
      if (releaseType !== undefined) await repository.updateReleaseType(req.params.id, releaseType);
      if (linkedStories !== undefined) await repository.updateReleaseStories(req.params.id, json(linkedStories));
      if (linkedBugs !== undefined) await repository.updateReleaseBugs(req.params.id, json(linkedBugs));
      if (releaseNotes !== undefined) await repository.updateReleaseNotes(req.params.id, releaseNotes);
      const after = await repository.findRelease(req.params.id);
      await audit(req.user, "release.update", "release", req.params.id, before, after, req.ip);
      return ok(mapRelease(after));
    });
    res.json(response);
  });

  router.patch("/releases/:id/status", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseWrite(req, res, before, "Cannot update a release in an archived or inaccessible project."))) return;
    const { status } = req.body || {};
    if (!releaseStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Release status must be one of: ${releaseStatuses.join(", ")}`);
    }
    const gate = await validateReleaseStatusTransition(before, status);
    if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
    const response = await write(async () => {
      await repository.updateReleaseStatus(req.params.id, status);
      const after = await repository.findRelease(req.params.id);
      await audit(req.user, "release.status_update", "release", req.params.id, before, after, req.ip);
      return ok(mapRelease(after));
    });
    res.json(response);
  });

  router.get("/releases/:id/approvals", async (req, res) => {
    const release = await repository.findRelease(req.params.id);
    if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseAccess(req, res, release))) return;
    res.json(ok((await repository.listApprovals(req.params.id)).map(mapReleaseApproval)));
  });

  router.post("/releases/:id/approvals", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseWrite(req, res, before, "Cannot approve a release in an archived or inaccessible project."))) return;
    if (before.creator_id === req.user.id || (!before.creator_id && before.creator === req.user.name)) {
      return fail(res, 403, "SELF_APPROVAL_FORBIDDEN", "发布创建者不能审批自己的发布。");
    }
    if (await repository.findApprovalByApprover(before.id, req.user.id)) {
      return fail(res, 409, "RELEASE_APPROVAL_ALREADY_RECORDED", "Each approver can submit only one immutable decision for a release.");
    }
    const { decision, comment } = req.body || {};
    if (!["approve", "reject"].includes(decision)) {
      return fail(res, 400, "VALIDATION_FAILED", "Approval decision must be approve or reject.");
    }

    if (decision === "approve") {
      const gate = await validateReleaseStatusTransition(before, "staging");
      if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
    }

    const idempotency = await beginIdempotentRequest(req, res, "release.approval.create");
    if (!idempotency) return;

    const approval = buildReleaseApproval(
      { decision, comment },
      { id: await nextId("APR", "release_approvals"), releaseId: req.params.id, actor: req.user, now },
    );
    let response;
    try {
      response = await write(async () => {
        await repository.createApproval(approval);
        if (decision === "approve" && before.status === "draft") {
          await repository.updateReleaseStatus(req.params.id, "staging");
        }
        const after = await repository.findRelease(req.params.id);
        await audit(req.user, `release.approval_${decision}`, "release", req.params.id, before, { release: after, approval }, req.ip);
        const created = ok({ approval: mapReleaseApproval(approval), release: mapRelease(after) });
        await idempotency.commit(201, created);
        return created;
      });
    } catch (error) {
      await idempotency.abort();
      if (String(error?.message || "").includes("idx_release_approvals_release_approver")) {
        return fail(res, 409, "RELEASE_APPROVAL_ALREADY_RECORDED", "Each approver can submit only one immutable decision for a release.");
      }
      throw error;
    }
    res.status(201).json(response);
  });

  router.get("/releases/:id/rollbacks", async (req, res) => {
    const release = await repository.findRelease(req.params.id);
    if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseAccess(req, res, release))) return;
    res.json(ok((await repository.listRollbacks(req.params.id)).map(mapRollbackRecord)));
  });

  router.post("/releases/:id/rollbacks", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseWrite(req, res, before, "Cannot record a rollback in an archived or inaccessible project."))) return;
    const transition = await validateReleaseStatusTransition(before, "rollback");
    if (!transition.ok) return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", transition.message, transition.details);
    const { reason, impact, plan } = req.body || {};
    if (!String(reason || "").trim()) {
      return fail(res, 400, "VALIDATION_FAILED", "Rollback reason is required.");
    }
    const idempotency = await beginIdempotentRequest(req, res, "release.rollback.create");
    if (!idempotency) return;
    const rollback = buildRollbackCreate(
      { reason, impact, plan },
      { id: await nextId("RBK", "rollback_records"), releaseId: req.params.id, actor: req.user, now },
    );
    try {
      const response = await write(async () => {
        await repository.createRollback(rollback);
        await repository.updateReleaseStatus(req.params.id, "rollback");
        const after = await repository.findRelease(req.params.id);
        await audit(req.user, "release.rollback_create", "release", req.params.id, before, { release: after, rollback }, req.ip);
        const created = ok({ rollback: mapRollbackRecord(rollback), release: mapRelease(after) });
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.get("/releases/:id/report", async (req, res, next) => {
    try {
      const release = await repository.findRelease(req.params.id);
      if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
      if (!(await ensureReleaseAccess(req, res, release))) return;
      // buildReleaseReport is async — must await or JSON serializes Promise as {}
      const report = await buildReleaseReport(release);
      res.json(ok(report));
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/releases/:id", requirePermission("project:*"), async (req, res) => {
    const before = await repository.findRelease(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
    if (!(await ensureReleaseWrite(req, res, before, "Cannot delete a release in an archived or inaccessible project."))) return;
    const status = String(before.status || "").toLowerCase();
    if (["released", "deployed", "completed"].includes(status)) {
      return fail(res, 409, "RELEASE_ALREADY_SHIPPED", "已发布/已完成的发布记录不能删除，请保留审计证据。", { status: before.status });
    }
    const approvalCount = Number((await repository.listApprovals?.(req.params.id) || []).length || 0);
    if (approvalCount > 0 && status !== "draft" && status !== "planning") {
      return fail(res, 409, "RELEASE_HAS_APPROVALS", "发布已有审批记录，不能直接删除。", { approvalCount });
    }
    const response = await write(async () => {
      await repository.deleteRelease(req.params.id);
      await audit(req.user, "release.delete", "release", req.params.id, before, null, req.ip);
      return ok({ deleted: req.params.id });
    });
    res.json(response);
  });

  return router;
}

module.exports = {
  createDeliveryRouter,
};
