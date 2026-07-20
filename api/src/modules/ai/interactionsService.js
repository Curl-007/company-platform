const ADVICE_TARGET_TYPES = Object.freeze(["requirement", "project", "test_case", "defect", "build", "release", "document"]);

function validateAdviceTarget(input = {}) {
  const targetType = String(input.targetType || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!ADVICE_TARGET_TYPES.includes(targetType) || !targetId) {
    const error = new Error(`targetType must be one of: ${ADVICE_TARGET_TYPES.join(", ")}，targetId 为必填项。`);
    error.code = "VALIDATION_FAILED";
    error.status = 400;
    throw error;
  }
  return { targetType, targetId };
}

function buildChatPayload({ attachments, config, content, fallback, now }) {
  return {
    id: `CHAT-${Date.now()}`,
    role: "assistant",
    content,
    createdAt: now(),
    modelUsed: fallback ? "local-rule-engine" : config.model,
    generatedBy: fallback ? "local-rule-engine" : config.provider,
    fallback,
    attachments: attachments.map((item) => ({ name: item.name, mimeType: item.mimeType, size: item.size, kind: item.kind })),
    provider: config,
  };
}

function summarizeAiProviderRoute(aiProvider = {}) {
  const health = aiProvider.health || {};
  const configuredProviderCount = Array.isArray(aiProvider.providers)
    ? aiProvider.providers.filter((provider) => provider.configured).length
    : aiProvider.configured ? 1 : 0;
  const providerCount = Array.isArray(aiProvider.providers) ? aiProvider.providers.length : aiProvider.id ? 1 : 0;
  const healthStatus = health.status || (aiProvider.enabled === false ? "disabled" : aiProvider.configured ? "unknown" : "unconfigured");
  const status = aiProvider.enabled === false
    ? "disabled"
    : !aiProvider.configured
      ? "unconfigured"
      : healthStatus === "unavailable"
        ? "unavailable"
        : healthStatus === "degraded"
          ? "degraded"
          : "active";
  const modelStrategy = aiProvider.configured
    ? `${aiProvider.model} / ${aiProvider.wireApi}`
    : "local-rule-engine";
  const audit = aiProvider.configured
    ? `全量记录；Provider ${configuredProviderCount}/${providerCount} 已配置`
    : providerCount
      ? `全量记录；Provider ${configuredProviderCount}/${providerCount} 已配置，当前不可用`
      : "全量记录；未配置真实模型，使用规则引擎";
  return {
    modelStrategy,
    status,
    provider: aiProvider.provider || "local-rule-engine",
    activeProviderId: aiProvider.activeId || aiProvider.id || null,
    configuredProviderCount,
    providerCount,
    healthStatus,
    lastCheckedAt: health.lastAttemptAt || null,
    lastSuccessAt: health.lastSuccessAt || null,
    lastFailureAt: health.lastFailureAt || null,
    lastErrorCode: health.lastErrorCode || "",
    audit,
  };
}

function buildSummary({ aiProvider, jobs, logAnalysis }) {
  const count = (status) => jobs.filter((job) => job.status === status).length;
  const totalProgress = jobs.length ? jobs.reduce((sum, job) => sum + (job.progress || 0), 0) : 0;
  const metrics = {
    totalJobs: jobs.length,
    queued: count("queued"),
    running: count("running"),
    awaitingReview: count("awaiting_review"),
    confirmed: count("confirmed"),
    rejected: count("rejected"),
    failed: count("failed"),
    parsing: jobs.filter((job) => (job.progress || 0) < 100 && !["confirmed", "rejected", "failed"].includes(job.status)).length,
    writtenToBusiness: jobs.filter((job) => Boolean(job.written_requirement_id)).length,
    avgConfidence: jobs.length ? Math.round(totalProgress / jobs.length) : 0,
    logAnalysis,
  };
  const routeRuntime = summarizeAiProviderRoute(aiProvider);
  const route = (scene, humanReview) => ({
    scene,
    modelStrategy: routeRuntime.modelStrategy,
    status: routeRuntime.status,
    humanReview,
    audit: routeRuntime.audit,
    provider: routeRuntime.provider,
    activeProviderId: routeRuntime.activeProviderId,
    configuredProviderCount: routeRuntime.configuredProviderCount,
    providerCount: routeRuntime.providerCount,
    healthStatus: routeRuntime.healthStatus,
    lastCheckedAt: routeRuntime.lastCheckedAt,
    lastSuccessAt: routeRuntime.lastSuccessAt,
    lastFailureAt: routeRuntime.lastFailureAt,
    lastErrorCode: routeRuntime.lastErrorCode,
  });
  return {
    metrics,
    modelRoutes: [
      route("文档结构化分析", "需人工确认"),
      route("工作日志分析", "可选审核"),
      route("需求完成度评分", "需人工确认"),
      route("项目驾驶舱洞察", "建议复核"),
    ],
    recentJobs: jobs.slice(0, 8).map((job) => ({
      jobId: job.job_id,
      scene: job.scene,
      status: job.status,
      progress: job.progress,
      currentStep: job.current_step,
      errorMessage: job.error_message,
      retryCount: job.retry_count,
      createdAt: job.created_at,
    })),
  };
}

function defaultCompactText(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function createBusinessAdviceHelpers({
  closedDefectStatuses = new Set(["verified", "closed", "rejected"]),
  closedTaskStatuses = new Set(["done", "cancelled"]),
  compactText = defaultCompactText,
} = {}) {
  function normalizeBusinessAdvicePayload(value, fallback) {
    const arrayOfText = (input, limit = 6) => Array.isArray(input)
      ? input.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
      : [];
    return {
      title: value?.title ? String(value.title).slice(0, 80) : fallback.title,
      summary: value?.summary ? String(value.summary).slice(0, 1200) : fallback.summary,
      risks: arrayOfText(value?.risks).length ? arrayOfText(value.risks) : fallback.risks,
      suggestions: arrayOfText(value?.suggestions).length ? arrayOfText(value.suggestions) : fallback.suggestions,
      nextActions: arrayOfText(value?.nextActions).length ? arrayOfText(value.nextActions) : fallback.nextActions,
      missingInfo: arrayOfText(value?.missingInfo, 5),
      modelUsed: value?.modelUsed || fallback.modelUsed,
      generatedBy: value?.generatedBy || fallback.generatedBy,
      fallback: Boolean(value?.fallback ?? fallback.fallback),
    };
  }

  function compactBusinessAdviceContext(targetType, context) {
    const compactTask = (item) => ({
      id: item.id,
      title: compactText(item.title, 120),
      status: item.status,
      progress: item.progress,
      remainingHours: item.remainingHours,
      blocker: compactText(item.blocker, 120),
      requirementId: item.requirementId,
    });
    const compactDefect = (item) => ({
      id: item.id,
      title: compactText(item.title, 120),
      severity: item.severity,
      status: item.status,
      requirementId: item.requirementId,
      foundInBuild: item.foundInBuild,
      assignee: item.assignee,
    });
    const compactTest = (item) => ({
      id: item.id,
      name: compactText(item.name || item.title, 120),
      status: item.status,
      totalCases: item.totalCases,
      passedCases: item.passedCases,
      failedCases: item.failedCases,
      blockedCases: item.blockedCases,
      requirementId: item.requirementId,
    });

    if (targetType === "requirement") {
      return {
        target: context.target,
        score: context.score,
        project: context.project ? { id: context.project.id, name: context.project.name, status: context.project.status, healthScore: context.project.healthScore } : null,
        tasks: context.tasks.slice(0, 12).map(compactTask),
        tests: context.tests.slice(0, 12).map(compactTest),
        defects: context.defects.slice(0, 12).map(compactDefect),
      };
    }
    if (targetType === "project") {
      return {
        target: context.target,
        requirements: context.requirements.slice(0, 15).map((item) => ({ id: item.id, title: compactText(item.title, 120), status: item.status, priority: item.priority, completion: item.completion })),
        tasks: context.tasks.slice(0, 15).map(compactTask),
        tests: context.tests.slice(0, 15).map(compactTest),
        defects: context.defects.slice(0, 15).map(compactDefect),
        builds: context.builds.slice(0, 8).map((item) => ({ id: item.id, name: compactText(item.name, 120), status: item.status, version: item.version })),
      };
    }
    if (targetType === "defect") {
      return {
        target: context.target,
        requirement: context.requirement ? { id: context.requirement.id, title: compactText(context.requirement.title, 120), status: context.requirement.status, completion: context.requirement.completion } : null,
        build: context.build ? { id: context.build.id, name: compactText(context.build.name, 120), status: context.build.status, version: context.build.version } : null,
        relatedTasks: context.relatedTasks.slice(0, 8).map(compactTask),
      };
    }
    if (targetType === "test_case") {
      return {
        target: context.target,
        requirement: context.requirement ? { id: context.requirement.id, title: compactText(context.requirement.title, 120), status: context.requirement.status, completion: context.requirement.completion } : null,
        defects: context.defects.slice(0, 8).map(compactDefect),
        runs: context.runs.slice(0, 8).map((item) => ({ id: item.id, result: item.result, notes: compactText(item.notes, 120), executedBy: item.executedBy, createdAt: item.createdAt })),
        relatedTasks: context.relatedTasks.slice(0, 8).map(compactTask),
      };
    }
    if (targetType === "build") {
      return {
        target: context.target,
        gate: {
          ready: context.gates.ready,
          score: context.gates.score,
          summary: context.gates.summary,
          blocked: context.gates.gates.filter((item) => !item.passed).map((item) => ({ id: item.id, label: item.label, message: item.message })),
        },
        readiness: {
          notReady: context.readiness.notReady?.map((item) => ({ id: item.id, status: item.status })) || [],
          unfinishedTasks: context.readiness.unfinishedTasks?.map(compactTask) || [],
          missingTests: context.readiness.missingTests || [],
          testsWithIssues: context.readiness.testsWithIssues?.map(compactTest) || [],
          openDefects: context.readiness.openDefects?.map(compactDefect) || [],
        },
        linkedDefects: context.linkedDefects,
      };
    }
    if (targetType === "release") {
      return {
        target: context.target,
        gate: {
          ready: context.gates.ready,
          score: context.gates.score,
          summary: context.gates.summary,
          blocked: context.gates.gates.filter((item) => !item.passed).map((item) => ({ id: item.id, label: item.label, message: item.message })),
        },
        report: context.report ? {
          metrics: context.report.metrics,
          summary: context.report.summary,
          recommendations: context.report.recommendations,
          build: context.report.build ? { id: context.report.build.id, name: compactText(context.report.build.name, 120), status: context.report.build.status } : null,
        } : null,
      };
    }
    if (targetType === "document") {
      return {
        target: {
          id: context.target.id,
          title: compactText(context.target.title, 160),
          type: context.target.type,
          category: context.target.category,
          aiStatus: context.target.aiStatus,
          owner: context.target.owner,
          projectId: context.target.projectId,
          linkedRequirements: context.target.linkedRequirements,
          risks: context.target.risks,
        },
        contentPreview: compactText(context.contentPreview, 1600),
        aiJobs: context.aiJobs.slice(0, 5).map((item) => ({ jobId: item.job_id, status: item.status, currentStep: item.current_step, errorMessage: compactText(item.error_message, 160) })),
      };
    }
    return context;
  }

  function buildLocalBusinessAdvice(targetType, targetId, context) {
    const risks = [];
    const suggestions = [];
    const nextActions = [];
    if (targetType === "requirement") {
      const score = context.score;
      const openDefects = context.defects.filter((item) => !closedDefectStatuses.has(item.status));
      const unfinishedTasks = context.tasks.filter((item) => !closedTaskStatuses.has(item.status) || Number(item.remainingHours || 0) > 0 || item.blocker);
      const failingTests = context.tests.filter((item) => item.failedCases > 0 || item.blockedCases > 0 || item.status === "failed" || item.status === "blocked");
      if (score?.hardRules?.length) risks.push(...score.hardRules);
      if (openDefects.length) risks.push(`仍有 ${openDefects.length} 个未关闭缺陷。`);
      if (unfinishedTasks.length) risks.push(`仍有 ${unfinishedTasks.length} 个任务未闭环。`);
      if (failingTests.length) risks.push(`仍有 ${failingTests.length} 个测试失败或阻塞。`);
      suggestions.push("先补齐验收标准、测试证据和任务剩余工时，再推进验收。");
      nextActions.push("确认需求状态、关闭阻塞任务、补充通过测试记录。");
    } else if (targetType === "build" || targetType === "release") {
      const blocked = context.gates?.gates?.filter((item) => !item.passed) || [];
      risks.push(...blocked.slice(0, 5).map((item) => `${item.label}：${item.message}`));
      suggestions.push(blocked.length ? "优先处理未通过门禁，再进入下一状态。" : "门禁已通过，保留审批、回滚和验证记录。");
      nextActions.push(blocked.length ? `处理 ${blocked.length} 项阻断门禁。` : "执行发布后验证并记录结论。");
    } else if (targetType === "test_case") {
      const hasFailed = Number(context.target.failedCases || 0) > 0 || context.target.status === "failed";
      const hasBlocked = Number(context.target.blockedCases || 0) > 0 || context.target.status === "blocked";
      if (hasFailed) risks.push("测试用例存在失败记录，需要关联缺陷或补充修复验证。");
      if (hasBlocked) risks.push("测试用例存在阻塞记录，需要明确阻塞原因和责任人。");
      if (!context.runs.length) risks.push("测试用例还没有执行记录。");
      suggestions.push("补齐测试步骤、预期结果、执行记录和缺陷关联，确保验收证据完整。");
      nextActions.push("执行一次最新测试，并把失败/阻塞结果同步到缺陷闭环。");
    } else if (targetType === "project") {
      const openDefects = context.defects.filter((item) => !closedDefectStatuses.has(item.status));
      const blockedTasks = context.tasks.filter((item) => item.status === "blocked" || item.blocker);
      if (openDefects.length) risks.push(`项目仍有 ${openDefects.length} 个未关闭缺陷。`);
      if (blockedTasks.length) risks.push(`项目仍有 ${blockedTasks.length} 个阻塞任务。`);
      suggestions.push("按需求优先级收敛任务、测试和缺陷，避免交付阶段集中暴露风险。");
      nextActions.push("召开一次需求-测试-缺陷对齐会，确认本周交付边界。");
    } else {
      suggestions.push("补充所属项目、负责人、验收证据和关联工作项，提升 AI 分析质量。");
      nextActions.push("把该对象关联到需求、任务、测试或发布链路中。");
    }
    return {
      title: `${targetId} 业务 AI 建议`,
      summary: `基于 ${targetType} 对象和当前平台数据生成规则兜底分析。`,
      risks: risks.length ? risks : ["当前未发现明显阻断，但仍需保持数据同步。"],
      suggestions,
      nextActions,
      missingInfo: [],
      modelUsed: "local-rule-engine",
      generatedBy: "local-rule-engine",
      fallback: true,
    };
  }

  return {
    buildLocalBusinessAdvice,
    compactBusinessAdviceContext,
    normalizeBusinessAdvicePayload,
  };
}

function createBusinessAdviceContextService({
  buildReleaseReport,
  compactText = defaultCompactText,
  evaluateBuildDeliveryGates,
  evaluateReleaseDeliveryGates,
  loadLinkedDefects,
  loadRequirementReadiness,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRelease,
  mapRequirement,
  mapTask,
  mapTestCase,
  mapTestRun,
  normalizeIdList,
  repository,
  requirementScore,
}) {
  async function load(targetType, targetId) {
    if (targetType === "requirement") {
      const requirement = await repository.findRequirement(targetId);
      if (!requirement) return null;
      const project = requirement.project_id ? await repository.findProject(requirement.project_id) : null;
      return {
        target: mapRequirement(requirement),
        score: await requirementScore(targetId),
        tasks: (await repository.listTasksForRequirement(targetId)).map(mapTask),
        tests: (await repository.listTestCasesForRequirement(targetId)).map(mapTestCase),
        defects: (await repository.listDefectsForRequirement(targetId)).map(mapDefect),
        project: project ? mapProject(project) : null,
      };
    }
    if (targetType === "project") {
      const project = await repository.findProject(targetId);
      if (!project) return null;
      return {
        target: mapProject(project),
        requirements: (await repository.listRequirementsForProject(targetId)).map(mapRequirement),
        tasks: (await repository.listTasksForProject(targetId)).map(mapTask),
        tests: (await repository.listTestCasesForProject(targetId)).map(mapTestCase),
        defects: (await repository.listDefectsForProject(targetId)).map(mapDefect),
        builds: (await repository.listBuildsForProject(targetId)).map(mapBuild),
      };
    }
    if (targetType === "defect") {
      const defect = await repository.findDefect(targetId);
      if (!defect) return null;
      const requirement = defect.requirement_id ? await repository.findRequirement(defect.requirement_id) : null;
      const build = defect.found_in_build ? await repository.findBuild(defect.found_in_build) : null;
      return {
        target: mapDefect(defect),
        requirement: requirement ? mapRequirement(requirement) : null,
        build: build ? mapBuild(build) : null,
        relatedTasks: (await repository.listTasksForDefect(targetId)).map(mapTask),
      };
    }
    if (targetType === "test_case") {
      const testCase = await repository.findTestCase(targetId);
      if (!testCase) return null;
      const requirement = testCase.requirement_id ? await repository.findRequirement(testCase.requirement_id) : null;
      return {
        target: mapTestCase(testCase),
        requirement: requirement ? mapRequirement(requirement) : null,
        defects: testCase.requirement_id
          ? (await repository.listDefectsForRequirement(testCase.requirement_id)).map(mapDefect)
          : [],
        runs: (await repository.listTestRunsForCase(targetId)).map(mapTestRun),
        relatedTasks: (await repository.listTasksForTestCase(targetId)).map(mapTask),
      };
    }
    if (targetType === "build") {
      const build = await repository.findBuild(targetId);
      if (!build) return null;
      return {
        target: mapBuild(build),
        gates: await evaluateBuildDeliveryGates(build),
        readiness: await loadRequirementReadiness(normalizeIdList(build.linked_stories)),
        linkedDefects: await loadLinkedDefects(normalizeIdList(build.linked_bugs)),
      };
    }
    if (targetType === "release") {
      const release = await repository.findRelease(targetId);
      if (!release) return null;
      return {
        target: mapRelease(release),
        gates: await evaluateReleaseDeliveryGates(release),
        report: await buildReleaseReport(release),
      };
    }
    if (targetType === "document") {
      const document = await repository.findDocument(targetId);
      if (!document) return null;
      return {
        target: mapDocument(document),
        contentPreview: compactText(document.content, 5000),
        aiJobs: await repository.listAiJobsForSource("document", targetId, 5),
      };
    }
    return null;
  }

  return { load };
}

module.exports = {
  ADVICE_TARGET_TYPES,
  buildChatPayload,
  buildSummary,
  createBusinessAdviceContextService,
  createBusinessAdviceHelpers,
  validateAdviceTarget,
};
