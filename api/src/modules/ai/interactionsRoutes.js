const express = require("express");
const { buildChatPayload, buildSummary, validateAdviceTarget } = require("./interactionsService");
const {
  appendLocalRequirementDraft,
  buildLocalRequirementAction,
  extractProposedActions,
  stripActionJson,
} = require("./chatService");

function createAiInteractionsRouter({
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
  publicAiProviderConfig,
  requirementScore,
  requirePermission,
  resolveAiProviderConfig,
  row,
  rows,
}) {
  const router = express.Router();

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
      if (!messages.length && !attachments.length) return fail(res, 400, "VALIDATION_FAILED", "请输入问题或上传附件。");
      const prompt = await buildAiChatPrompt({ messages, attachments, scope, currentPage });
      let fallback = false;
      let rawContent = await callRealModel(prompt, {
        system: "你是公司项目管理平台的 AI 对话助手，能阅读项目数据、用户上传文档和图片，并给出务实的项目管理建议。需要新建需求时在文末输出 ACTION_JSON。",
        attachments,
        temperature: 0.25,
        maxTokens: 1800,
        timeoutMs: 45000,
      }).catch((error) => {
        console.warn("AI chat fallback:", error.message);
        return null;
      });
      if (!rawContent) {
        fallback = true;
        rawContent = await localAiChatReply({ messages, attachments });
      }

      let proposedActions = extractProposedActions(rawContent);
      let content = stripActionJson(rawContent);
      if (!proposedActions.length) {
        const context = typeof buildAiChatContext === "function" ? await buildAiChatContext() : null;
        const localAction = buildLocalRequirementAction({ messages, attachments, context });
        if (localAction) {
          proposedActions = [localAction];
          content = appendLocalRequirementDraft(content, localAction);
        }
      }

      const payload = buildChatPayload({
        attachments,
        config: await publicAiProviderConfig(),
        content,
        fallback,
        now,
        proposedActions,
      });
      await audit(req.user, "ai.chat", "ai_chat", payload.id, null, {
        scope,
        currentPage,
        attachments: payload.attachments,
        proposedActions: proposedActions.map((item) => item.type),
      }, req.ip);
      return res.json(ok(payload));
    } catch (error) { return next(error); }
  });

  router.get("/ai/summary", async (req, res, next) => {
    try {
      const aiProvider = await publicAiProviderConfig();
      const jobs = await rows("SELECT * FROM ai_jobs ORDER BY created_at DESC");
      const scope = req.query.scope || "dashboard";
      const workLogCount = await row("SELECT COUNT(*) AS c FROM work_logs");
      const summary = buildSummary({ aiProvider, jobs, logAnalysis: workLogCount?.c || 0 });
      const aiSummary = await createAiSummary(scope, summary.metrics, { cacheKey: req.query.fresh ? `${req.user?.role || "user"}:${Date.now()}` : req.user?.role || "user" });
      return res.json(ok({
        scope,
        title: aiSummary.title,
        summary: aiSummary.summary,
        risks: aiSummary.risks,
        recommendations: aiSummary.recommendations,
        generatedBy: aiSummary.generatedBy,
        modelUsed: aiSummary.modelUsed,
        metrics: summary.metrics,
        aiProvider,
        modelRoutes: summary.modelRoutes,
        recentJobs: summary.recentJobs,
      }));
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createAiInteractionsRouter };
