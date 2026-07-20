const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildDocumentAnalysisPrompt,
  buildRuleBasedDocumentAnalysis,
  createDocumentAnalysisService,
  extractDocumentAnalysisJson,
} = require("../src/modules/ai/documentAnalysis");

test("AI document analysis parses fenced model JSON and records configured model", async () => {
  const calls = [];
  const service = createDocumentAnalysisService({
    callModel: async (prompt, options) => {
      calls.push({ prompt, options });
      return '```json\n{"summary":"模型摘要","requirements":[{"title":"模型需求","priority":"high","acceptanceCriteria":["可验收"]}]}\n```';
    },
    getModelName: () => "model-x",
  });

  const result = await service.analyze({ title: "接口设计", type: "design", content: "这里是完整的接口设计内容。" });

  assert.equal(result.summary, "模型摘要");
  assert.equal(result.modelUsed, "model-x");
  assert.equal(result.requirements[0].title, "模型需求");
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /文档标题：接口设计/);
  assert.match(calls[0].prompt, /JSON schema/);
  assert.match(calls[0].options.system, /文档分析助手/);
});

test("AI document analysis falls back to auditable local rules when model output is unavailable", async () => {
  const service = createDocumentAnalysisService({
    callModel: async () => "not json",
    getModelName: () => "model-x",
  });

  const result = await service.analyze({
    title: "投标方案",
    type: "bid",
    content: "这是一份包含较完整业务目标、范围、风险和交付要求的投标方案正文。",
  });

  assert.equal(result.modelUsed, "local-rule-engine");
  assert.match(result.summary, /规则引擎分析完成/);
  assert.equal(result.requirements[0].priority, "high");
  assert.equal(result.wbs.length, 3);
  assert.equal(result.apis[0].path, "/api/ai/documents/analyze");
  assert.match(result.risks[0], /标书类文档/);
});

test("AI document analysis helpers parse embedded JSON and build prompt with document content", () => {
  assert.deepEqual(extractDocumentAnalysisJson("prefix {\"summary\":\"ok\"} suffix"), { summary: "ok" });
  const fallback = buildRuleBasedDocumentAnalysis({ title: "空文档", type: "test", content: "" });
  assert.equal(fallback.apis.length, 0);
  assert.match(fallback.risks[0], /文档内容为空/);
  const prompt = buildDocumentAnalysisPrompt({ title: "测试设计", type: "test", content: "步骤与预期" });
  assert.match(prompt, /文档类型：test/);
  assert.match(prompt, /内容：步骤与预期/);
});
