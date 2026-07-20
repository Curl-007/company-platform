function extractSentences(content, keywords) {
  return String(content || "")
    .replace(/\r/g, "\n")
    .split(/[\n.;!?。；！？]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)));
}

function extractJsonPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
    }
  }
  return null;
}

function createWorkLogAnalysisService({ callModel, getModelName, row, rows }) {
  const modelName = () => (typeof getModelName === "function" ? getModelName() : "local-rule-engine");

  function resolveRequirement(id) {
    const requirement = row("SELECT * FROM requirements WHERE id = @id AND deleted_at IS NULL", { id });
    return { id, title: requirement?.title || id, known: Boolean(requirement), currentCompletion: requirement?.completion ?? null };
  }

  function localAnalyze(input) {
    const normalized = [input?.content, input?.blockers, input?.nextPlan].filter(Boolean).join("\n").trim();
    const requirementIds = [...new Set((normalized.match(/REQ-\d+/gi) || []).map((id) => id.toUpperCase()))];
    const percentages = [...new Set((normalized.match(/\d{1,3}%/g) || []).map((value) => Number(value.replace("%", ""))))]
      .filter((value) => value >= 0 && value <= 100);
    const completedItems = extractSentences(normalized, ["completed", "done", "finished", "完成", "已完成", "推进", "联调", "验证"]);
    const blockers = extractSentences(normalized, ["blocked", "waiting", "risk", "缺少", "等待", "阻塞", "风险", "问题", "不一致"]);
    return {
      completedItems: completedItems.length ? completedItems : ["No explicit completed item was detected."],
      blockers: blockers.length ? blockers : ["No explicit blocker was detected."],
      linkedRequirements: requirementIds.map(resolveRequirement),
      progressChange: percentages.length >= 2
        ? { from: percentages[0], to: percentages[percentages.length - 1], delta: percentages[percentages.length - 1] - percentages[0] }
        : percentages.length === 1 ? { from: null, to: percentages[0], delta: null } : { from: null, to: null, delta: null },
      confidence: normalized.length > 80 ? "medium" : "low",
      suggestedActions: blockers.length
        ? ["Assign an owner and target date for each blocker before the next standup."]
        : ["Move completed items into acceptance or regression verification."],
      modelUsed: "local-rule-engine",
    };
  }

  function normalize(value, fallback) {
    const linkedIds = [...new Set((Array.isArray(value?.linkedRequirements) ? value.linkedRequirements : [])
      .map((item) => (typeof item === "string" ? item : item?.id))
      .filter(Boolean)
      .map((id) => String(id).toUpperCase()))];
    return {
      completedItems: Array.isArray(value?.completedItems) && value.completedItems.length
        ? value.completedItems.map(String).slice(0, 8)
        : fallback.completedItems,
      blockers: Array.isArray(value?.blockers) && value.blockers.length
        ? value.blockers.map(String).slice(0, 8)
        : fallback.blockers,
      linkedRequirements: linkedIds.length
        ? linkedIds.map(resolveRequirement)
        : fallback.linkedRequirements,
      progressChange: {
        from: Number.isFinite(Number(value?.progressChange?.from)) ? Number(value.progressChange.from) : fallback.progressChange.from,
        to: Number.isFinite(Number(value?.progressChange?.to)) ? Number(value.progressChange.to) : fallback.progressChange.to,
        delta: Number.isFinite(Number(value?.progressChange?.delta)) ? Number(value.progressChange.delta) : fallback.progressChange.delta,
      },
      confidence: ["low", "medium", "high"].includes(value?.confidence) ? value.confidence : fallback.confidence,
      suggestedActions: Array.isArray(value?.suggestedActions) && value.suggestedActions.length
        ? value.suggestedActions.map(String).slice(0, 8)
        : fallback.suggestedActions,
      modelUsed: value?.modelUsed || modelName(),
    };
  }

  async function analyze(input) {
    const fallback = localAnalyze(input);
    const normalized = [input?.content, input?.blockers, input?.nextPlan].filter(Boolean).join("\n").trim();
    if (!normalized || typeof callModel !== "function") return fallback;
    const knownRequirements = rows("SELECT id, title, completion, status FROM requirements WHERE deleted_at IS NULL ORDER BY id LIMIT 80")
      .map((item) => ({ id: item.id, title: item.title, completion: item.completion, status: item.status }));
    const modelText = await callModel(
      [
        "请分析下面的工作日志，只返回严格 JSON，不要 Markdown。",
        "只能用于项目协作、风险识别和需求进展对齐；不得输出个人绩效评分、排名、薪酬、晋升或淘汰建议。",
        "JSON schema:",
        "{",
        '  "completedItems": ["已完成事项"],',
        '  "blockers": ["阻塞/风险，没有则返回空数组"],',
        '  "linkedRequirements": ["REQ-001"],',
        '  "progressChange": {"from": 10, "to": 40, "delta": 30},',
        '  "confidence": "low|medium|high",',
        '  "suggestedActions": ["下一步协作建议"]',
        "}",
        `已知需求：${JSON.stringify(knownRequirements)}`,
        `日志内容：${normalized}`,
      ].join("\n"),
      { system: "你是项目经理的工作日志分析助手，擅长识别完成项、阻塞项、需求关联和可执行下一步；严禁把日志数据用于个人绩效评价。" },
    ).catch(() => null);
    const parsed = extractJsonPayload(modelText);
    if (!parsed) return fallback;
    return normalize({ ...parsed, modelUsed: modelName() }, fallback);
  }

  return {
    analyze,
    localAnalyze,
    normalize,
  };
}

module.exports = {
  createWorkLogAnalysisService,
  extractJsonPayload,
  extractSentences,
};
