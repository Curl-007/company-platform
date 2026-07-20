const DOCUMENT_ANALYSIS_SYSTEM_PROMPT =
  "你是企业项目管理平台的文档分析助手，擅长从需求、设计、标书和测试文档中抽取结构化工作项。";

function extractDocumentAnalysisJson(text) {
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

function buildDocumentAnalysisPrompt(document) {
  return [
    "请分析下面的项目文档，只返回严格 JSON，不要 Markdown。",
    "JSON schema:",
    "{",
    '  "summary": "一句话摘要",',
    '  "requirements": [{"title": "需求标题", "priority": "high|medium|low", "acceptanceCriteria": ["验收标准"]}],',
    '  "wbs": [{"title": "任务标题", "estimatedHours": 8, "wbsCode": "1.1"}],',
    '  "apis": [{"method": "GET|POST|PATCH|DELETE", "path": "/api/example", "purpose": "用途"}],',
    '  "risks": ["风险"]',
    "}",
    `文档标题：${document.title}`,
    `文档类型：${document.type}`,
    `内容：${document.content || ""}`,
  ].join("\n");
}

function buildRuleBasedDocumentAnalysis(document) {
  const docType = document.type || "requirement";
  const docContent = document.content || "";
  const hasContent = docContent.length > 20;
  const estimateByType = { requirement: 16, design: 24, bid: 40, test: 12 };
  const baseHours = estimateByType[docType] || 16;
  return {
    summary: `${document.title} - 基于文档类型“${docType}”的规则引擎分析完成。${hasContent ? `检测到 ${docContent.length} 字内容。` : "文档内容为空或不足。"}建议人工审核后写入正式需求。`,
    modelUsed: "local-rule-engine",
    requirements: [
      {
        title: `${document.title} - ${docType === "bid" ? "投标" : "功能"}需求`,
        priority: docType === "bid" ? "high" : "medium",
        acceptanceCriteria: [
          hasContent ? "提取文档关键目标并确认对齐业务方向" : "补充文档内容后重新分析",
          `验证与现有${docType === "test" ? "测试用例" : "需求"}的关联性`,
          "输出结构化描述供后续任务拆分",
        ],
      },
    ],
    wbs: [
      { title: `${document.title} 需求梳理与分析`, estimatedHours: Math.round(baseHours * 0.25), wbsCode: "1.1" },
      { title: `${document.title} 方案设计`, estimatedHours: Math.round(baseHours * 0.35), wbsCode: "1.2" },
      { title: `${document.title} 开发与测试`, estimatedHours: Math.round(baseHours * 0.4), wbsCode: "1.3" },
    ],
    apis: hasContent
      ? [{ method: "POST", path: "/api/ai/documents/analyze", purpose: "提交文档分析 Job" }]
      : [],
    risks: hasContent
      ? ["分析结果基于规则引擎生成，建议人工核实后写入正式需求。" + (docType === "bid" ? "标书类文档需额外评估合规性。" : "")]
      : ["文档内容为空，分析结果不完整。请上传完整文档后重新分析。"],
  };
}

function createDocumentAnalysisService({ callModel, getModelName = () => null } = {}) {
  async function analyze(document) {
    const modelText = typeof callModel === "function"
      ? await callModel(
        buildDocumentAnalysisPrompt(document),
        { system: DOCUMENT_ANALYSIS_SYSTEM_PROMPT },
      ).catch(() => null)
      : null;
    if (modelText) {
      const parsed = extractDocumentAnalysisJson(modelText);
      if (parsed?.summary || parsed?.requirements) {
        return { ...parsed, modelUsed: (await getModelName()) || "configured-model" };
      }
    }
    return buildRuleBasedDocumentAnalysis(document);
  }

  return { analyze };
}

module.exports = {
  DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
  buildDocumentAnalysisPrompt,
  buildRuleBasedDocumentAnalysis,
  createDocumentAnalysisService,
  extractDocumentAnalysisJson,
};
