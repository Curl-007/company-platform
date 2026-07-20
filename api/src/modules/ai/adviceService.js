function createAiAdviceService({
  businessAdviceContextService,
  businessAdviceHelpers,
  callModel,
  compactText,
  extractJsonPayload,
  getModelName,
  getProviderName,
  mapRequirement,
  row,
  rows,
}) {
  async function modelName() {
    if (typeof getModelName !== "function") return "local-rule-engine";
    return await getModelName() || "local-rule-engine";
  }
  async function providerName() {
    if (typeof getProviderName !== "function") return "local-rule-engine";
    return await getProviderName() || "local-rule-engine";
  }

  async function createRequirementRecommendation(score) {
    const requirement = await row("SELECT * FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: score.requirementId });
    if (!requirement) return "需求不存在，无法生成 AI 建议。";
    const tasks = await rows("SELECT id, title, status, progress, blocker FROM tasks WHERE requirement_id = @id", { id: score.requirementId });
    const tests = await rows("SELECT id, name, status, total_cases, passed_cases, failed_cases, blocked_cases FROM test_cases WHERE requirement_id = @id", { id: score.requirementId });
    const defects = await rows("SELECT id, title, severity, status FROM defects WHERE requirement_id = @id", { id: score.requirementId });
    const fallback = "请结合任务进度、测试通过率、缺陷关闭情况和日志证据后再确认完成度。";
    const modelText = await callModel(
      [
        "请基于需求完成度评分数据生成一段中文建议，只返回严格 JSON。",
        'JSON schema: {"recommendation": "80字以内建议"}',
        `需求：${JSON.stringify(mapRequirement(requirement))}`,
        `评分：${JSON.stringify(score)}`,
        `任务：${JSON.stringify(tasks)}`,
        `测试：${JSON.stringify(tests)}`,
        `缺陷：${JSON.stringify(defects)}`,
      ].join("\n"),
      { system: "你是需求验收和质量分析助手，输出可执行、简洁的完成度建议。" },
    ).catch(() => null);
    const parsed = extractJsonPayload(modelText);
    return parsed?.recommendation ? String(parsed.recommendation).slice(0, 240) : fallback;
  }

  async function createBusinessAdvice({ targetType, targetId, question, draft }) {
    const context = await businessAdviceContextService.load(targetType, targetId);
    if (!context) return null;
    const fallback = businessAdviceHelpers.buildLocalBusinessAdvice(targetType, targetId, context);
    const modelContext = businessAdviceHelpers.compactBusinessAdviceContext(targetType, context);
    const prompt = [
      "请基于真实业务对象生成项目管理建议，只返回严格 JSON，不要 Markdown。",
      'JSON schema: {"title":"短标题","summary":"分析摘要","risks":["风险"],"suggestions":["建议"],"nextActions":["下一步动作"],"missingInfo":["缺少的信息"]}',
      "要求：建议必须具体、可执行，不编造不存在的编号；如果数据不足，放入 missingInfo。",
      `对象类型：${targetType}`,
      `对象 ID：${targetId}`,
      `用户问题：${question || "请分析当前对象的交付风险和下一步动作"}`,
      `当前草稿：${JSON.stringify(draft || {})}`,
      `业务上下文：${JSON.stringify(modelContext)}`,
    ].join("\n");
    const modelText = await callModel(prompt, {
      system: "你是嵌入项目管理系统的业务分析 AI，必须依据输入数据输出可审计的中文建议。",
      maxTokens: 900,
      timeoutMs: 60000,
      wireApi: "chat_completions",
    }).catch((error) => {
      console.warn(`AI business advice fallback for ${targetType}:${targetId}:`, error.message);
      return null;
    });
    const plainModelText = modelText ? null : await callModel([
      "请作为项目管理系统内嵌 AI，用中文直接给出简短、可执行的业务建议。",
      "不要输出代码或 JSON。请覆盖：当前判断、主要风险、建议动作、缺少信息。",
      `对象类型：${targetType}`,
      `对象 ID：${targetId}`,
      `用户问题：${question || "请分析当前对象的交付风险和下一步动作"}`,
      `上下文摘要：${compactText(JSON.stringify(modelContext), 2800)}`,
    ].join("\n"), {
      system: "你是项目管理业务分析助手，回答要务实、具体、可审计。",
      maxTokens: 700,
      timeoutMs: 60000,
    }).catch((error) => {
      console.warn(`AI business advice plain fallback for ${targetType}:${targetId}:`, error.message);
      return null;
    });
    const parsed = extractJsonPayload(modelText);
    const usedModel = await modelName();
    const usedProvider = await providerName();
    if (!parsed && modelText) {
      return businessAdviceHelpers.normalizeBusinessAdvicePayload({
        title: fallback.title,
        summary: String(modelText).slice(0, 1200),
        risks: fallback.risks,
        suggestions: fallback.suggestions,
        nextActions: fallback.nextActions,
        missingInfo: [],
        modelUsed: usedModel,
        generatedBy: usedProvider,
        fallback: false,
      }, fallback);
    }
    if (!parsed && plainModelText) {
      return businessAdviceHelpers.normalizeBusinessAdvicePayload({
        title: fallback.title,
        summary: String(plainModelText).slice(0, 1200),
        risks: fallback.risks,
        suggestions: fallback.suggestions,
        nextActions: fallback.nextActions,
        missingInfo: [],
        modelUsed: usedModel,
        generatedBy: usedProvider,
        fallback: false,
      }, fallback);
    }
    return businessAdviceHelpers.normalizeBusinessAdvicePayload(
      parsed ? { ...parsed, modelUsed: usedModel, generatedBy: usedProvider, fallback: false } : fallback,
      fallback,
    );
  }

  return {
    createBusinessAdvice,
    createRequirementRecommendation,
  };
}

module.exports = {
  createAiAdviceService,
};
