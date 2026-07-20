function buildBuildCreate(input = {}, { id, actor, now, json }) {
  return {
    id,
    project_id: input.projectId,
    name: String(input.name).trim(),
    version: input.version || null,
    build_date: input.buildDate || now().slice(0, 10),
    status: "building",
    linked_stories: json(input.linkedStories || []),
    linked_bugs: json(input.linkedBugs || []),
    scm_hash: input.scmHash || null,
    creator: actor.name,
    notes: input.notes || null,
    created_at: now(),
  };
}

function buildReleaseCreate(input = {}, { id, actor, now, json }) {
  return {
    id,
    product_id: input.productId || null,
    name: String(input.name).trim(),
    version: input.version || null,
    release_date: input.releaseDate || now().slice(0, 10),
    build_id: input.buildId || null,
    release_type: input.releaseType || "official",
    linked_stories: json(input.linkedStories || []),
    linked_bugs: json(input.linkedBugs || []),
    release_notes: input.releaseNotes || null,
    creator: actor.name,
    creator_id: actor.id,
    status: "draft",
    created_at: now(),
  };
}

function buildReleaseApproval(input = {}, { id, releaseId, actor, now }) {
  return {
    id,
    release_id: releaseId,
    decision: input.decision,
    comment: String(input.comment || "").trim(),
    approver_id: actor.id,
    approver_name: actor.name,
    created_at: now(),
  };
}

function buildRollbackCreate(input = {}, { id, releaseId, actor, now }) {
  return {
    id,
    release_id: releaseId,
    reason: String(input.reason).trim(),
    impact: String(input.impact || "").trim(),
    plan: String(input.plan || "").trim(),
    operator_id: actor.id,
    operator_name: actor.name,
    created_at: now(),
  };
}

const DEFAULT_CLOSED_DEFECT_STATUSES = new Set(["verified", "closed", "rejected"]);
const DEFAULT_RELEASE_READY_REQUIREMENT_STATUSES = new Set(["accepted", "closed"]);
const DEFAULT_CLOSED_TASK_STATUSES = new Set(["done", "cancelled"]);

function createDeliveryService({
  closedDefectStatuses = DEFAULT_CLOSED_DEFECT_STATUSES,
  closedTaskStatuses = DEFAULT_CLOSED_TASK_STATUSES,
  mapBuild,
  mapDefect,
  mapDeliveryAudit,
  mapRelease,
  mapReleaseApproval,
  mapRequirement,
  mapRollbackRecord,
  parse,
  releaseReadyRequirementStatuses = DEFAULT_RELEASE_READY_REQUIREMENT_STATUSES,
  repository,
}) {
  function normalizeIdList(value) {
    return parse(value, [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function uniqueIds(ids) {
    return Array.from(new Set(ids.filter(Boolean)));
  }

  async function loadLinkedDefects(ids) {
    const defectIds = uniqueIds(ids);
    if (defectIds.length === 0) return { missing: [], open: [] };
    const found = await repository.listDefectsByIds(defectIds);
    const foundIds = new Set(found.map((item) => item.id));
    return {
      missing: defectIds.filter((id) => !foundIds.has(id)),
      open: found.filter((item) => !closedDefectStatuses.has(item.status)),
    };
  }

  async function loadLinkedRequirements(ids) {
    const requirementIds = uniqueIds(ids);
    if (requirementIds.length === 0) return { missing: [], items: [] };
    const found = await repository.listActiveRequirementsByIds(requirementIds);
    const foundIds = new Set(found.map((item) => item.id));
    return {
      missing: requirementIds.filter((id) => !foundIds.has(id)),
      items: found,
    };
  }

  async function loadRequirementReadiness(ids) {
    const requirements = await loadLinkedRequirements(ids);
    const requirementIds = requirements.items.map((item) => item.id);
    if (requirementIds.length === 0) {
      return {
        ...requirements,
        notReady: [],
        unfinishedTasks: [],
        missingTests: [],
        testsWithIssues: [],
        testsWithoutPass: [],
        openDefects: [],
      };
    }

    const tasks = await repository.listTasksByRequirementIds(requirementIds);
    const tests = await repository.listTestCasesByRequirementIds(requirementIds);
    const defects = await repository.listDefectsByRequirementIds(requirementIds);
    const testsByRequirement = tests.reduce((map, item) => {
      if (!map.has(item.requirement_id)) map.set(item.requirement_id, []);
      map.get(item.requirement_id).push(item);
      return map;
    }, new Map());

    return {
      ...requirements,
      notReady: requirements.items.filter((item) => !releaseReadyRequirementStatuses.has(item.status)),
      unfinishedTasks: tasks.filter((item) => {
        const remaining = Number(item.remaining_hours) || 0;
        return !closedTaskStatuses.has(item.status) || remaining > 0 || Boolean(String(item.blocker || "").trim());
      }),
      missingTests: requirementIds.filter((id) => !testsByRequirement.has(id)),
      testsWithIssues: tests.filter((item) => {
        const failed = Number(item.failed_cases) || 0;
        const blocked = Number(item.blocked_cases) || 0;
        return failed > 0 || blocked > 0 || item.status === "failed" || item.status === "blocked";
      }),
      testsWithoutPass: tests.filter((item) => (Number(item.passed_cases) || 0) === 0 && item.status !== "passed"),
      openDefects: defects.filter((item) => !closedDefectStatuses.has(item.status)),
    };
  }

  function deliveryGateFailure(message, details = {}) {
    return { ok: false, message, details };
  }

  function deliveryGatePassed(details = {}) {
    return { ok: true, details };
  }

  const buildStatusTransitions = Object.freeze({
    building: Object.freeze(["testing", "failed"]),
    testing: Object.freeze(["building", "released", "failed"]),
    released: Object.freeze([]),
    failed: Object.freeze(["building"]),
  });

  const releaseStatusTransitions = Object.freeze({
    draft: Object.freeze(["staging"]),
    staging: Object.freeze(["released", "rollback"]),
    released: Object.freeze(["rollback"]),
    rollback: Object.freeze([]),
  });

  function isDeliveryStatusTransitionAllowed(transitions, currentStatus, nextStatus) {
    return currentStatus === nextStatus || Boolean(transitions[currentStatus]?.includes(nextStatus));
  }

  async function validateBuildStatusTransition(build, nextStatus) {
    if (!isDeliveryStatusTransitionAllowed(buildStatusTransitions, build.status, nextStatus)) {
      return deliveryGateFailure(`构建不能从 ${build.status} 直接切换到 ${nextStatus}。`, { gate: "status", currentStatus: build.status, nextStatus });
    }
    if (build.status === nextStatus || nextStatus === "building" || nextStatus === "testing" || nextStatus === "failed") {
      return deliveryGatePassed();
    }
    if (nextStatus !== "released") return deliveryGatePassed();

    const linkedStories = normalizeIdList(build.linked_stories);
    const linkedBugs = normalizeIdList(build.linked_bugs);
    if (linkedStories.length === 0) {
      return deliveryGateFailure("构建进入可发布前必须至少关联一个需求或故事。", { gate: "linkedStories" });
    }
    if (!String(build.notes || "").trim()) {
      return deliveryGateFailure("构建进入可发布前必须填写构建备注，说明变更内容和验证范围。", { gate: "notes" });
    }

    const readiness = await loadRequirementReadiness(linkedStories);
    if (readiness.missing.length > 0) {
      return deliveryGateFailure(`构建关联的需求不存在：${readiness.missing.join(", ")}。`, { gate: "linkedStories", missing: readiness.missing });
    }
    if (readiness.notReady.length > 0) {
      return deliveryGateFailure(
        `仍有需求未验收：${readiness.notReady.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "requirementReadiness", notReady: readiness.notReady },
      );
    }
    if (readiness.unfinishedTasks.length > 0) {
      return deliveryGateFailure(
        `仍有需求任务未闭环：${readiness.unfinishedTasks.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "taskClosure", unfinishedTasks: readiness.unfinishedTasks },
      );
    }
    if (readiness.missingTests.length > 0) {
      return deliveryGateFailure(`需求缺少测试用例：${readiness.missingTests.join(", ")}。`, { gate: "testClosure", missingTests: readiness.missingTests });
    }
    if (readiness.testsWithIssues.length > 0 || readiness.testsWithoutPass.length > 0) {
      return deliveryGateFailure(
        `测试尚未全部通过：${[...readiness.testsWithIssues, ...readiness.testsWithoutPass].map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "testClosure", testsWithIssues: readiness.testsWithIssues, testsWithoutPass: readiness.testsWithoutPass },
      );
    }
    if (readiness.openDefects.length > 0) {
      return deliveryGateFailure(
        `关联需求仍有未关闭缺陷：${readiness.openDefects.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "requirementDefects", openDefects: readiness.openDefects },
      );
    }

    const defects = await loadLinkedDefects(linkedBugs);
    if (defects.missing.length > 0) {
      return deliveryGateFailure(`构建关联的缺陷不存在：${defects.missing.join(", ")}。`, { gate: "linkedBugs", missing: defects.missing });
    }
    if (defects.open.length > 0) {
      return deliveryGateFailure(
        `构建仍有关联缺陷未关闭：${defects.open.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "linkedBugs", open: defects.open },
      );
    }

    return deliveryGatePassed({ linkedStories, linkedBugs });
  }

  async function hasApprovedRelease(releaseId) {
    return await repository.hasApprovedRelease(releaseId);
  }

  async function validateReleaseStatusTransition(release, nextStatus) {
    if (!isDeliveryStatusTransitionAllowed(releaseStatusTransitions, release.status, nextStatus)) {
      return deliveryGateFailure(`发布不能从 ${release.status} 直接切换到 ${nextStatus}。`, { gate: "status", currentStatus: release.status, nextStatus });
    }
    if (release.status === nextStatus || nextStatus === "rollback") return deliveryGatePassed();
    if (nextStatus !== "staging" && nextStatus !== "released") return deliveryGatePassed();

    if (nextStatus === "released") {
      if (release.status !== "staging") {
        return deliveryGateFailure("正式发布前必须先进入预发布状态。", { gate: "status", currentStatus: release.status });
      }
      if (!(await hasApprovedRelease(release.id))) {
        return deliveryGateFailure("正式发布前必须至少有一条审批通过记录。", { gate: "approval" });
      }
    }

    if (!String(release.release_notes || "").trim()) {
      return deliveryGateFailure("发布进入预发布或正式发布前必须填写发布说明。", { gate: "releaseNotes" });
    }

    const linkedBuild = release.build_id ? await repository.findBuild(release.build_id) : null;
    if (!linkedBuild) {
      return deliveryGateFailure("发布进入预发布或正式发布前必须关联一个已可发布的构建。", { gate: "build" });
    }
    if (linkedBuild.status !== "released") {
      return deliveryGateFailure(`关联构建 ${linkedBuild.id} 当前状态为 ${linkedBuild.status}，必须先进入可发布。`, { gate: "build", buildStatus: linkedBuild.status });
    }

    const linkedStories = uniqueIds([
      ...normalizeIdList(release.linked_stories),
      ...normalizeIdList(linkedBuild.linked_stories),
    ]);
    const linkedBugs = uniqueIds([
      ...normalizeIdList(release.linked_bugs),
      ...normalizeIdList(linkedBuild.linked_bugs),
    ]);

    if (linkedStories.length === 0) {
      return deliveryGateFailure("发布进入预发布或正式发布前必须至少关联一个需求或故事。", { gate: "linkedStories" });
    }

    const readiness = await loadRequirementReadiness(linkedStories);
    if (readiness.missing.length > 0) {
      return deliveryGateFailure(`发布关联的需求不存在：${readiness.missing.join(", ")}。`, { gate: "linkedStories", missing: readiness.missing });
    }
    if (readiness.notReady.length > 0) {
      return deliveryGateFailure(
        `发布仍有需求未验收：${readiness.notReady.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "requirementReadiness", notReady: readiness.notReady },
      );
    }
    if (readiness.unfinishedTasks.length > 0) {
      return deliveryGateFailure(
        `发布仍有需求任务未闭环：${readiness.unfinishedTasks.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "taskClosure", unfinishedTasks: readiness.unfinishedTasks },
      );
    }
    if (readiness.missingTests.length > 0) {
      return deliveryGateFailure(`发布需求缺少测试用例：${readiness.missingTests.join(", ")}。`, { gate: "testClosure", missingTests: readiness.missingTests });
    }
    if (readiness.testsWithIssues.length > 0 || readiness.testsWithoutPass.length > 0) {
      return deliveryGateFailure(
        `发布测试尚未全部通过：${[...readiness.testsWithIssues, ...readiness.testsWithoutPass].map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "testClosure", testsWithIssues: readiness.testsWithIssues, testsWithoutPass: readiness.testsWithoutPass },
      );
    }
    if (readiness.openDefects.length > 0) {
      return deliveryGateFailure(
        `发布关联需求仍有未关闭缺陷：${readiness.openDefects.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "requirementDefects", openDefects: readiness.openDefects },
      );
    }

    const defects = await loadLinkedDefects(linkedBugs);
    if (defects.missing.length > 0) {
      return deliveryGateFailure(`发布关联的缺陷不存在：${defects.missing.join(", ")}。`, { gate: "linkedBugs", missing: defects.missing });
    }
    if (defects.open.length > 0) {
      return deliveryGateFailure(
        `发布仍有关联缺陷未关闭：${defects.open.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
        { gate: "linkedBugs", open: defects.open },
      );
    }

    return deliveryGatePassed({ buildId: linkedBuild.id, linkedStories, linkedBugs });
  }

  function gateLine(id, label, passed, message, details = {}) {
    return {
      id,
      label,
      passed: Boolean(passed),
      state: passed ? "passed" : "blocked",
      message,
      details,
    };
  }

  async function evaluateBuildDeliveryGates(build) {
    const linkedStories = normalizeIdList(build.linked_stories);
    const linkedBugs = normalizeIdList(build.linked_bugs);
    const readiness = await loadRequirementReadiness(linkedStories);
    const defects = await loadLinkedDefects(linkedBugs);
    const storyPassed = linkedStories.length > 0 && readiness.missing.length === 0;
    const requirementPassed = storyPassed && readiness.notReady.length === 0;
    const taskPassed = storyPassed && readiness.unfinishedTasks.length === 0;
    const testPassed = storyPassed && readiness.missingTests.length === 0 && readiness.testsWithIssues.length === 0 && readiness.testsWithoutPass.length === 0;
    const requirementDefectPassed = storyPassed && readiness.openDefects.length === 0;
    const bugPassed = defects.missing.length === 0 && defects.open.length === 0;
    const notesPassed = Boolean(String(build.notes || "").trim());
    const gates = [
      gateLine("linkedStories", "需求覆盖", storyPassed, linkedStories.length === 0 ? "至少关联一个需求或故事。" : readiness.missing.length > 0 ? `存在无效需求：${readiness.missing.join(", ")}。` : `已关联 ${linkedStories.length} 个需求。`, { linkedStories, missing: readiness.missing }),
      gateLine("requirementReadiness", "需求验收", requirementPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.notReady.length > 0 ? `仍有 ${readiness.notReady.length} 个需求未验收。` : "关联需求均已验收或关闭。", { notReady: readiness.notReady }),
      gateLine("taskClosure", "任务闭环", taskPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.unfinishedTasks.length > 0 ? `仍有 ${readiness.unfinishedTasks.length} 个需求任务未完成、未清工时或存在阻塞。` : "关联需求任务已闭环。", { unfinishedTasks: readiness.unfinishedTasks }),
      gateLine("testClosure", "测试通过", testPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.missingTests.length > 0 ? `仍有 ${readiness.missingTests.length} 个需求缺少测试用例。` : readiness.testsWithIssues.length > 0 ? `仍有 ${readiness.testsWithIssues.length} 个测试失败或阻塞。` : readiness.testsWithoutPass.length > 0 ? `仍有 ${readiness.testsWithoutPass.length} 个测试尚未产生通过记录。` : "关联需求测试均已通过。", { missingTests: readiness.missingTests, testsWithIssues: readiness.testsWithIssues, testsWithoutPass: readiness.testsWithoutPass }),
      gateLine("requirementDefects", "需求缺陷", requirementDefectPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.openDefects.length > 0 ? `关联需求仍有 ${readiness.openDefects.length} 个缺陷未关闭。` : "关联需求缺陷已关闭。", { openDefects: readiness.openDefects }),
      gateLine("linkedBugs", "缺陷门禁", bugPassed, defects.missing.length > 0 ? `存在无效缺陷：${defects.missing.join(", ")}。` : defects.open.length > 0 ? `仍有 ${defects.open.length} 个关联缺陷未关闭。` : linkedBugs.length > 0 ? "关联缺陷已全部关闭。" : "无阻断缺陷。", { linkedBugs, missing: defects.missing, open: defects.open }),
      gateLine("notes", "构建说明", notesPassed, notesPassed ? "构建备注已补充。" : "需要说明变更内容和验证范围。"),
    ];
    const blocked = gates.filter((item) => !item.passed);
    return {
      kind: "build",
      id: build.id,
      targetStatus: "released",
      ready: blocked.length === 0,
      score: Math.round(((gates.length - blocked.length) / gates.length) * 100),
      summary: blocked.length === 0 ? "构建满足可发布门禁。" : `构建还有 ${blocked.length} 项门禁未通过。`,
      gates,
    };
  }

  async function evaluateReleaseDeliveryGates(release) {
    const linkedBuild = release.build_id ? await repository.findBuild(release.build_id) : null;
    const linkedStories = uniqueIds([
      ...normalizeIdList(release.linked_stories),
      ...(linkedBuild ? normalizeIdList(linkedBuild.linked_stories) : []),
    ]);
    const linkedBugs = uniqueIds([
      ...normalizeIdList(release.linked_bugs),
      ...(linkedBuild ? normalizeIdList(linkedBuild.linked_bugs) : []),
    ]);
    const readiness = await loadRequirementReadiness(linkedStories);
    const defects = await loadLinkedDefects(linkedBugs);
    const notesPassed = Boolean(String(release.release_notes || "").trim());
    const buildPassed = Boolean(linkedBuild && linkedBuild.status === "released");
    const approvalPassed = await hasApprovedRelease(release.id);
    const storyPassed = linkedStories.length > 0 && readiness.missing.length === 0;
    const requirementPassed = storyPassed && readiness.notReady.length === 0;
    const taskPassed = storyPassed && readiness.unfinishedTasks.length === 0;
    const testPassed = storyPassed && readiness.missingTests.length === 0 && readiness.testsWithIssues.length === 0 && readiness.testsWithoutPass.length === 0;
    const requirementDefectPassed = storyPassed && readiness.openDefects.length === 0;
    const bugPassed = defects.missing.length === 0 && defects.open.length === 0;
    const gates = [
      gateLine("releaseNotes", "发布说明", notesPassed, notesPassed ? "发布说明已补充。" : "需要填写发布内容、影响范围和回滚方案。"),
      gateLine("build", "关联构建", buildPassed, !linkedBuild ? "必须关联一个已可发布的构建。" : linkedBuild.status === "released" ? `构建 ${linkedBuild.id} 已可发布。` : `构建 ${linkedBuild.id} 当前为 ${linkedBuild.status}，需要先进入可发布。`, { buildId: linkedBuild?.id || null, buildStatus: linkedBuild?.status || null }),
      gateLine("approval", "发布审批", approvalPassed, approvalPassed ? "已有审批通过记录。" : "正式发布前需要审批通过。"),
      gateLine("linkedStories", "需求覆盖", storyPassed, linkedStories.length === 0 ? "至少关联一个需求或故事。" : readiness.missing.length > 0 ? `存在无效需求：${readiness.missing.join(", ")}。` : `已覆盖 ${linkedStories.length} 个需求。`, { linkedStories, missing: readiness.missing }),
      gateLine("requirementReadiness", "需求验收", requirementPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.notReady.length > 0 ? `仍有 ${readiness.notReady.length} 个需求未验收。` : "关联需求均已验收或关闭。", { notReady: readiness.notReady }),
      gateLine("taskClosure", "任务闭环", taskPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.unfinishedTasks.length > 0 ? `仍有 ${readiness.unfinishedTasks.length} 个需求任务未完成、未清工时或存在阻塞。` : "关联需求任务已闭环。", { unfinishedTasks: readiness.unfinishedTasks }),
      gateLine("testClosure", "测试通过", testPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.missingTests.length > 0 ? `仍有 ${readiness.missingTests.length} 个需求缺少测试用例。` : readiness.testsWithIssues.length > 0 ? `仍有 ${readiness.testsWithIssues.length} 个测试失败或阻塞。` : readiness.testsWithoutPass.length > 0 ? `仍有 ${readiness.testsWithoutPass.length} 个测试尚未产生通过记录。` : "关联需求测试均已通过。", { missingTests: readiness.missingTests, testsWithIssues: readiness.testsWithIssues, testsWithoutPass: readiness.testsWithoutPass }),
      gateLine("requirementDefects", "需求缺陷", requirementDefectPassed, !storyPassed ? "请先完成需求覆盖。" : readiness.openDefects.length > 0 ? `关联需求仍有 ${readiness.openDefects.length} 个缺陷未关闭。` : "关联需求缺陷已关闭。", { openDefects: readiness.openDefects }),
      gateLine("linkedBugs", "缺陷门禁", bugPassed, defects.missing.length > 0 ? `存在无效缺陷：${defects.missing.join(", ")}。` : defects.open.length > 0 ? `仍有 ${defects.open.length} 个关联缺陷未关闭。` : linkedBugs.length > 0 ? "关联缺陷已全部关闭。" : "无阻塞缺陷。", { linkedBugs, missing: defects.missing, open: defects.open }),
    ];
    const blocked = gates.filter((item) => !item.passed);
    return {
      kind: "release",
      id: release.id,
      targetStatus: "released",
      ready: blocked.length === 0,
      score: Math.round(((gates.length - blocked.length) / gates.length) * 100),
      summary: blocked.length === 0 ? "发布满足正式发布门禁。" : `发布还有 ${blocked.length} 项门禁未通过。`,
      gates,
    };
  }

  async function listDeliveryGateResults() {
    const builds = await repository.listBuilds();
    const buildResults = [];
    for (const build of builds) buildResults.push(await evaluateBuildDeliveryGates(build));
    const releases = await repository.listReleases();
    const releaseResults = [];
    for (const release of releases) releaseResults.push(await evaluateReleaseDeliveryGates(release));
    return [...buildResults, ...releaseResults];
  }

  async function loadRequirementsByIds(ids) {
    const requirementIds = uniqueIds(ids);
    if (!requirementIds.length) return [];
    return (await repository.listActiveRequirementsByIds(requirementIds)).map(mapRequirement);
  }

  async function loadDefectsByIds(ids) {
    const defectIds = uniqueIds(ids);
    if (!defectIds.length) return [];
    return (await repository.listDefectsByIds(defectIds)).map(mapDefect);
  }

  async function buildReleaseReport(releaseRow) {
    const buildRow = releaseRow.build_id ? await repository.findBuild(releaseRow.build_id) : null;
    const release = mapRelease(releaseRow);
    const build = buildRow ? mapBuild(buildRow) : null;
    const linkedStories = uniqueIds([
      ...normalizeIdList(releaseRow.linked_stories),
      ...(buildRow ? normalizeIdList(buildRow.linked_stories) : []),
    ]);
    const linkedBugs = uniqueIds([
      ...normalizeIdList(releaseRow.linked_bugs),
      ...(buildRow ? normalizeIdList(buildRow.linked_bugs) : []),
    ]);
    const requirements = await loadRequirementsByIds(linkedStories);
    const defects = await loadDefectsByIds(linkedBugs);
    const approvals = (await repository.listApprovals(releaseRow.id)).map(mapReleaseApproval);
    const rollbacks = (await repository.listRollbacks(releaseRow.id)).map(mapRollbackRecord);
    const gate = await evaluateReleaseDeliveryGates(releaseRow);
    const resourceIds = [releaseRow.id, buildRow?.id].filter(Boolean);
    const auditTrail = (await repository.listDeliveryAudit(resourceIds)).map(mapDeliveryAudit);
    const openDefects = defects.filter((item) => !closedDefectStatuses.has(item.status));
    const approved = approvals.some((item) => item.decision === "approve");
    const rejected = approvals.some((item) => item.decision === "reject");
    const summary = [
      `发布 ${release.name}${release.version ? `（${release.version}）` : ""} 当前状态为 ${release.status}。`,
      gate.ready ? "全部发布门禁已通过。" : gate.summary,
      approved ? "已有审批通过记录。" : rejected ? "存在审批驳回记录，需要重新确认。" : "尚未审批通过。",
      rollbacks.length ? `已登记 ${rollbacks.length} 条回滚记录。` : "暂无回滚记录。",
    ].join(" ");
    return {
      release,
      build,
      gate,
      requirements,
      defects,
      approvals,
      rollbacks,
      auditTrail,
      metrics: {
        requirementCount: requirements.length,
        defectCount: defects.length,
        openDefectCount: openDefects.length,
        approvalCount: approvals.length,
        rollbackCount: rollbacks.length,
        auditCount: auditTrail.length,
        readyScore: gate.score,
      },
      summary,
      recommendations: [
        !gate.ready ? "先处理未通过的发布门禁，再进入正式发布。" : "",
        !approved ? "正式发布前补齐审批通过记录。" : "",
        openDefects.length ? `关闭或确认豁免 ${openDefects.length} 个关联缺陷。` : "",
        !String(release.releaseNotes || "").trim() ? "补充发布说明、影响范围和回滚方案。" : "",
        release.status === "released" && !rollbacks.length ? "发布后保留验证结论；如发生异常，及时登记回滚影响和处理计划。" : "",
      ].filter(Boolean),
    };
  }

  return {
    buildReleaseReport,
    evaluateBuildDeliveryGates,
    evaluateReleaseDeliveryGates,
    listDeliveryGateResults,
    loadLinkedDefects,
    loadRequirementReadiness,
    normalizeIdList,
    validateBuildStatusTransition,
    validateReleaseStatusTransition,
  };
}

module.exports = {
  CLOSED_DEFECT_STATUSES: DEFAULT_CLOSED_DEFECT_STATUSES,
  buildBuildCreate,
  buildReleaseApproval,
  buildReleaseCreate,
  buildRollbackCreate,
  createDeliveryService,
};
