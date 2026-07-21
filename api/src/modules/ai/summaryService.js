function compactText(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function collectAiBusinessSnapshot({ rows }, scope = "dashboard") {
  return {
    scope,
    projects: (await rows("SELECT id, name, status, health_score, progress, risk_count, owner FROM projects WHERE deleted_at IS NULL ORDER BY risk_count DESC, health_score ASC LIMIT 12"))
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        healthScore: item.health_score,
        progress: item.progress,
        riskCount: item.risk_count,
        owner: item.owner,
      })),
    requirements: (await rows("SELECT id, title, status, priority, completion, project_id, owner, assignee FROM requirements WHERE deleted_at IS NULL AND (priority = 'high' OR completion < 80) ORDER BY priority ASC, completion ASC LIMIT 25"))
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        completion: item.completion,
        projectId: item.project_id,
        owner: item.owner,
        assignee: item.assignee,
      })),
    tasks: (await rows("SELECT id, title, status, project_id, requirement_id, owner, progress, blocker, due_date FROM tasks WHERE status NOT IN ('done', 'cancelled') ORDER BY CASE WHEN blocker IS NULL OR blocker = '' THEN 1 ELSE 0 END, due_date ASC LIMIT 25"))
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        projectId: item.project_id,
        requirementId: item.requirement_id,
        owner: item.owner,
        progress: item.progress,
        blocker: item.blocker,
        dueDate: item.due_date,
      })),
    defects: (await rows("SELECT id, title, severity, status, project_id, requirement_id, assignee FROM defects WHERE status NOT IN ('closed', 'verified', 'rejected') ORDER BY severity DESC, id LIMIT 25"))
      .map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        status: item.status,
        projectId: item.project_id,
        requirementId: item.requirement_id,
        assignee: item.assignee,
      })),
    workLogs: (await rows("SELECT author, project, content, blockers, next_plan, created_at FROM work_logs ORDER BY created_at DESC LIMIT 10"))
      .map((item) => ({
        author: item.author,
        project: item.project,
        content: compactText(item.content),
        blockers: compactText(item.blockers),
        nextPlan: compactText(item.next_plan),
        createdAt: item.created_at,
      })),
    aiJobs: (await rows("SELECT job_id, scene, status, progress, current_step, error_message, created_at FROM ai_jobs ORDER BY created_at DESC LIMIT 10"))
      .map((item) => ({
        jobId: item.job_id,
        scene: item.scene,
        status: item.status,
        progress: item.progress,
        currentStep: item.current_step,
        errorMessage: item.error_message,
        createdAt: item.created_at,
      })),
    builds: (await rows("SELECT id, name, version, status, project_id, build_date, notes FROM builds ORDER BY created_at DESC LIMIT 10"))
      .map((item) => ({
        id: item.id,
        name: item.name,
        version: item.version,
        status: item.status,
        projectId: item.project_id,
        buildDate: item.build_date,
        notes: compactText(item.notes),
      })),
    releases: (await rows("SELECT id, name, version, status, product_id, release_date, release_notes FROM releases ORDER BY created_at DESC LIMIT 10"))
      .map((item) => ({
        id: item.id,
        name: item.name,
        version: item.version,
        status: item.status,
        productId: item.product_id,
        releaseDate: item.release_date,
        releaseNotes: compactText(item.release_notes),
      })),
  };
}

function buildLocalAiSummary(scope, metrics, snapshot) {
  const riskyProjects = snapshot.projects.filter((item) => (item.riskCount || 0) > 0 || item.healthScore < 70);
  const blockedTasks = snapshot.tasks.filter((item) => item.status === "blocked" || item.blocker);
  const openDefects = snapshot.defects.filter((item) => !["closed", "verified", "rejected"].includes(item.status));
  const lowCompletionReqs = snapshot.requirements.filter((item) => item.priority === "high" && item.completion < 70);
  const risks = [
    ...riskyProjects.slice(0, 2).map((item) => `${item.name} 健康度 ${item.healthScore}，风险数 ${item.riskCount}，需要关注交付稳定性。`),
    ...blockedTasks.slice(0, 2).map((item) => `${item.title} 存在阻塞：${item.blocker || item.status}`),
    ...openDefects.slice(0, 2).map((item) => `${item.id} ${item.severity} 缺陷仍未关闭：${item.title}`),
    ...lowCompletionReqs.slice(0, 2).map((item) => `${item.id} 高优先级需求完成度仅 ${item.completion}%。`),
  ].slice(0, 5);
  const recommendations = [
    blockedTasks.length ? "优先为阻塞任务明确责任人与解决时限。" : "",
    openDefects.length ? "发布前先收敛未关闭缺陷，并补齐回归验证记录。" : "",
    lowCompletionReqs.length ? "高优先级需求需要补充拆解任务、测试证据和验收标准。" : "",
    metrics.awaitingReview ? "及时审核 AI 结构化结果，避免分析结果停留在待确认状态。" : "",
  ].filter(Boolean);
  return {
    title: scope === "requirements" ? "需求智能分析" : scope === "projects" ? "项目智能分析" : "AI 实时分析",
    summary: `基于当前 ${snapshot.projects.length} 个项目、${snapshot.requirements.length} 条需求、${snapshot.tasks.length} 个任务、${openDefects.length} 个未关闭缺陷生成。${risks.length ? "系统检测到需要人工介入的风险点。" : "当前未检测到明显高风险项。"}`,
    risks: risks.length ? risks : ["当前数据未显示明显阻塞，建议持续维护工作日志和测试证据。"],
    recommendations: recommendations.length ? recommendations : ["保持需求、任务、缺陷与日志数据同步，便于 AI 持续识别风险。"],
    generatedBy: "local-rule-engine",
    modelUsed: "local-rule-engine",
  };
}

function normalizeAiSummaryPayload(value, fallback, modelName) {
  return {
    title: value?.title ? String(value.title).slice(0, 60) : fallback.title,
    summary: value?.summary ? String(value.summary).slice(0, 800) : fallback.summary,
    risks: Array.isArray(value?.risks) && value.risks.length ? value.risks.map(String).slice(0, 6) : fallback.risks,
    recommendations: Array.isArray(value?.recommendations) && value.recommendations.length
      ? value.recommendations.map(String).slice(0, 6)
      : fallback.recommendations,
    generatedBy: value?.generatedBy || "real-model",
    modelUsed: value?.modelUsed || modelName,
  };
}

function buildAiSummarySignals(snapshot) {
  return {
    riskyProjects: snapshot.projects
      .filter((item) => (item.riskCount || 0) > 0 || item.healthScore < 75)
      .slice(0, 5)
      .map((item) => `${item.id || item.name} ${item.name}: 健康度${item.healthScore}, 进度${item.progress}%, 风险${item.riskCount}, 状态${item.status}`),
    blockedTasks: snapshot.tasks
      .filter((item) => item.status === "blocked" || item.blocker)
      .slice(0, 5)
      .map((item) => `${item.id} ${item.title}: ${item.blocker || item.status}, 负责人${item.owner || "未指定"}`),
    weakRequirements: snapshot.requirements
      .filter((item) => item.priority === "high" || item.completion < 70)
      .slice(0, 6)
      .map((item) => `${item.id} ${item.title}: ${item.priority}, 完成${item.completion}%, 状态${item.status}`),
    openDefects: snapshot.defects
      .slice(0, 6)
      .map((item) => `${item.id} ${item.title}: ${item.severity}, ${item.status}, 负责人${item.assignee || "未指定"}`),
    recentLogs: snapshot.workLogs
      .slice(0, 5)
      .map((item) => `${item.author}/${item.project || "未关联项目"}: ${compactText([item.content, item.blockers, item.nextPlan].filter(Boolean).join("；"), 120)}`),
    delivery: [
      ...snapshot.builds.slice(0, 3).map((item) => `构建 ${item.id} ${item.name} ${item.version || ""}: ${item.status}`),
      ...snapshot.releases.slice(0, 3).map((item) => `发布 ${item.id} ${item.name} ${item.version || ""}: ${item.status}`),
    ],
  };
}

function createAiSummaryService({ callModel, extractJsonPayload, getModelName, rows, setTimeoutImpl = setTimeout }) {
  // Process-local TTL cache only (not shared across instances). Callers that
  // mutate business data should invalidate via invalidateCache / clearCache.
  const cache = new Map();
  const CACHE_TTL_MS = 90 * 1000;

  async function modelName() {
    if (typeof getModelName !== "function") return "local-rule-engine";
    return await getModelName() || "local-rule-engine";
  }

  function invalidateCache(scope, cacheKey = "global") {
    if (!scope) {
      cache.clear();
      return;
    }
    cache.delete(`${scope}:${cacheKey}`);
  }

  function clearCache() {
    cache.clear();
  }

  async function createSummary(scope, metrics, options = {}) {
    const cacheKey = `${scope || "dashboard"}:${options.cacheKey || "global"}`;
    const cached = cache.get(cacheKey);
    if (!options.skipCache && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;
    const snapshot = options.snapshot || await collectAiBusinessSnapshot({ rows }, scope);
    const fallback = buildLocalAiSummary(scope, metrics, snapshot);
    const signals = buildAiSummarySignals(snapshot);
    const prompt = [
      "只返回 JSON，不要 Markdown。",
      '格式：{"title":"短标题","summary":"80字以内中文摘要","risks":["风险1","风险2","风险3"],"recommendations":["建议1","建议2","建议3"]}',
      `范围：${scope || "dashboard"}`,
      `指标：${JSON.stringify(metrics)}`,
      `信号：${JSON.stringify(signals)}`,
    ].join("\n");
    const modelOptions = {
      system: "你是项目管理 AI 分析官。必须依据输入的真实系统信号输出，不编造编号。",
      maxTokens: 500,
      timeoutMs: options.timeoutMs || 12000,
    };
    const resolveValue = async () => {
      const modelText = await callModel(prompt, modelOptions).catch(() => null);
      const parsed = extractJsonPayload(modelText);
      const usedModel = await modelName();
      return parsed
        ? normalizeAiSummaryPayload({ ...parsed, modelUsed: usedModel }, fallback, usedModel)
        : fallback;
    };
    if (options.backgroundRefresh) {
      setTimeoutImpl(() => {
        resolveValue()
          .then((value) => cache.set(cacheKey, { createdAt: Date.now(), value }))
          .catch(() => cache.set(cacheKey, { createdAt: Date.now(), value: fallback }));
      }, 0);
      return { ...fallback, generatedBy: "local-rule-engine", refreshing: true };
    }
    const value = await resolveValue();
    cache.set(cacheKey, { createdAt: Date.now(), value });
    return value;
  }

  return {
    createSummary,
    invalidateCache,
    clearCache,
    collectSnapshot: (scope) => collectAiBusinessSnapshot({ rows }, scope),
  };
}

module.exports = {
  buildAiSummarySignals,
  buildLocalAiSummary,
  collectAiBusinessSnapshot,
  compactText,
  createAiSummaryService,
  normalizeAiSummaryPayload,
};
