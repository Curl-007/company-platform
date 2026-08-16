const express = require("express");
const { buildChatPayload, buildSummary, validateAdviceTarget } = require("./interactionsService");
const {
  appendLocalActionDraft,
  buildLocalAction,
  extractProposedActions,
  stripActionJson,
} = require("./chatService");

function createAiInteractionsRouter({
  assistantExecutionService,
  audit,
  buildAiChatPrompt,
  buildAiChatContext,
  callRealModel,
  createAiRequirementRecommendation,
  createAiSummary,
  createBusinessAdvice,
  ensureAiTargetAccess,
  fail,
  localAiChatReply,
  normalizeAttachments,
  normalizeMessages,
  now,
  ok,
  publicAiAssistantConfig = async () => null,
  publicAiProviderConfig,
  requirementScore,
  requirePermission,
  resolveAccessScope,
  resolveAiProviderConfig,
  row,
  rows,
}) {
  const router = express.Router();

  function normalizeRequestAccessScope(accessScope) {
    if (accessScope?.all === true) return { all: true };
    if (!Array.isArray(accessScope?.projectIds)) return { projectIds: [] };
    return {
      projectIds: [...new Set(accessScope.projectIds.map(String).map((id) => id.trim()).filter(Boolean))].sort(),
    };
  }

  async function accessScopeFor(user) {
    if (typeof resolveAccessScope !== "function") return { projectIds: [] };
    return normalizeRequestAccessScope(await resolveAccessScope(user));
  }

  function projectParams(projectIds) {
    return Object.fromEntries(projectIds.map((id, index) => [`projectId${index}`, id]));
  }

  function projectPlaceholders(projectIds) {
    return projectIds.map((_, index) => `@projectId${index}`).join(", ");
  }

  router.post("/ai/requirements/:id/score", requirePermission("ai:*"), async (req, res, next) => {
    try {
      if (!(await ensureAiTargetAccess(req, res, "requirement", req.params.id))) return;
      const score = await requirementScore(req.params.id);
      if (!score) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
      const recommendation = await createAiRequirementRecommendation(score);
      const providerConfig = await resolveAiProviderConfig();
      return res.json(ok({ ...score, recommendation, modelUsed: providerConfig.model }));
    } catch (error) { return next(error); }
  });

  router.post("/ai/business-advice", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const { targetType, targetId } = validateAdviceTarget(req.body);
      if (!(await ensureAiTargetAccess(req, res, targetType, targetId))) return;
      const advice = await createBusinessAdvice({ targetType, targetId, question: req.body?.question, draft: req.body?.draft });
      if (!advice) return fail(res, 404, "RESOURCE_NOT_FOUND", "业务对象不存在，无法生成 AI 建议。");
      await audit(req.user, "ai.business_advice", targetType, targetId, null, { targetType, targetId, fallback: advice.fallback, modelUsed: advice.modelUsed }, req.ip);
      return res.json(ok(advice));
    } catch (error) {
      if (error.status) return fail(res, error.status, error.code, error.message);
      return next(error);
    }
  });

  router.post("/ai/chat", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const messages = normalizeMessages(req.body?.messages);
      const attachments = normalizeAttachments(req.body?.attachments);
      const scope = String(req.body?.scope || "project-management").slice(0, 80);
      const currentPage = String(req.body?.currentPage || "").slice(0, 120);
      // Chat model selection is a control-plane concern. Client payloads must
      // not select arbitrary models or bypass the platform assistant profile.
      const requestedModel = "";
      const accessScope = await accessScopeFor(req.user);
      if (!messages.length && !attachments.length) return fail(res, 400, "VALIDATION_FAILED", "请输入问题或上传附件。");
      const prompt = await buildAiChatPrompt({ messages, attachments, scope, currentPage, accessScope });
      let fallback = false;
      let assistantExecution = null;
      if (assistantExecutionService && typeof assistantExecutionService.create === "function") {
        try {
          assistantExecution = await assistantExecutionService.create({
            accessScope,
            actor: req.user,
            currentPage,
            ip: req.ip,
            scope,
          });
        } catch (error) {
          // Tool-session setup is additive: model-only chat remains available
          // when an audit/database/gateway dependency is briefly unavailable.
          console.warn("AI chat tool session unavailable:", error.message);
        }
      }

      let rawContent = null;
      try {
        rawContent = await callRealModel(prompt, {
          system: "你是公司项目管理平台的 AI 对话助手，能阅读项目数据、用户上传文档和图片，并给出务实的项目管理建议。需要实时数据或执行平台操作时，使用已注册的 company_* DSH 工具并先查询 company_platform_catalog；需要导航、调整布局风格或创建新界面时，先查询 company_ui_catalog，再使用 company_ui_* 工具。UI 只能使用封闭声明式组件，不能生成或执行 HTML、JavaScript、CSS 源码和任意 URL。工具结果是唯一事实来源，严禁编造。业务写入只能在用户明确提出后执行，并会要求用户确认。",
          attachments,
          temperature: 0.25,
          maxTokens: 1800,
          timeoutMs: 120000,
          ...(assistantExecution ? { execution: assistantExecution.execution } : {}),
          ...(requestedModel ? { model: requestedModel } : {}),
        });
        await assistantExecution?.finish?.({ fallback: !rawContent, modelUsed: Boolean(rawContent) });
      } catch (error) {
        console.warn("AI chat fallback:", error.message);
        try {
          await assistantExecution?.finish?.({ error, fallback: true, modelUsed: false });
        } catch (finishError) {
          console.warn("AI chat tool-session cleanup failed:", finishError.message);
        }
        rawContent = null;
      }
      if (!rawContent) {
        fallback = true;
        rawContent = await localAiChatReply({ messages, attachments, accessScope });
      }

      let proposedActions = extractProposedActions(rawContent);
      let content = stripActionJson(rawContent);
      if (!proposedActions.length) {
        const context = typeof buildAiChatContext === "function" ? await buildAiChatContext(accessScope) : null;
        const localAction = buildLocalAction({ messages, attachments, context });
        if (localAction) {
          proposedActions = [localAction];
          content = appendLocalActionDraft(content, localAction);
        }
      }

      const providerConfig = await publicAiProviderConfig();
      const aiAssistant = await publicAiAssistantConfig();
      const payload = buildChatPayload({
        attachments,
        config: providerConfig,
        content,
        fallback,
        now,
        proposedActions,
        modelUsed: aiAssistant?.resolvedModel || providerConfig.model,
      });
      payload.aiAssistant = aiAssistant;
      await audit(req.user, "ai.chat", "ai_chat", payload.id, null, {
        scope,
        currentPage,
        attachments: payload.attachments,
        proposedActions: proposedActions.map((item) => item.type),
      }, req.ip);
      return res.json(ok(payload));
    } catch (error) { return next(error); }
  });

  router.get("/ai/summary", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const aiProvider = await publicAiProviderConfig();
      const aiAssistant = await publicAiAssistantConfig();
      const accessScope = await accessScopeFor(req.user);
      const isAdmin = accessScope.all === true;
      const projectIds = isAdmin ? [] : accessScope.projectIds;
      // Non-admin: only jobs/logs for accessible scope (global job list is admin-only).
      let jobs = [];
      let logAnalysis = 0;
      if (isAdmin) {
        jobs = await rows("SELECT * FROM ai_jobs ORDER BY created_at DESC");
        const workLogCount = await row("SELECT COUNT(*) AS c FROM work_logs");
        logAnalysis = workLogCount?.c || 0;
      } else if (projectIds.length) {
        const params = projectParams(projectIds);
        const placeholders = projectPlaceholders(projectIds);
        const jobProjectExpression = "COALESCE(CASE WHEN j.source_type = 'project' THEN j.source_id END, d.project_id, sr.project_id, wr.project_id)";
        jobs = (await rows(
          `SELECT j.*, ${jobProjectExpression} AS project_id
             FROM ai_jobs j
             LEFT JOIN documents d ON j.source_type = 'document' AND d.id = j.source_id
             LEFT JOIN requirements sr ON j.source_type = 'requirement' AND sr.id = j.source_id
             LEFT JOIN requirements wr ON wr.id = j.written_requirement_id
            WHERE ${jobProjectExpression} IN (${placeholders})
            ORDER BY j.created_at DESC`,
          params,
        )).filter((job) => projectIds.includes(job.project_id));
        const workLogCount = await row(
          `SELECT COUNT(*) AS c FROM work_logs WHERE project_id IN (${placeholders})`,
          params,
        );
        logAnalysis = workLogCount?.c || 0;
      }
      const scope = req.query.scope || "dashboard";
      const summary = buildSummary({ aiProvider, jobs, logAnalysis });
      const visibilityKey = isAdmin
        ? "admin:all"
        : `u:${req.user?.id || "anon"}:projects:${projectIds.join(",") || "none"}`;
      const skipCache = ["1", "true"].includes(String(req.query.fresh || "").toLowerCase());
      const aiSummary = await createAiSummary(scope, summary.metrics, {
        accessScope,
        cacheKey: visibilityKey,
        skipCache,
        // The model can spend 20+ seconds on reasoning before returning JSON.
        // Return the auditable local snapshot immediately on normal page loads
        // and let the summary service refresh the same cache in the background.
        backgroundRefresh: !skipCache,
        timeoutMs: 30_000,
      });
      return res.json(ok({
        scope,
        title: aiSummary.title,
        summary: aiSummary.summary,
        risks: aiSummary.risks,
        recommendations: aiSummary.recommendations,
        generatedBy: aiSummary.generatedBy,
        modelUsed: aiSummary.modelUsed,
        refreshing: Boolean(aiSummary.refreshing),
        metrics: summary.metrics,
        aiProvider,
        aiAssistant,
        modelRoutes: summary.modelRoutes,
        recentJobs: summary.recentJobs,
      }));
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createAiInteractionsRouter };
