const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiAdviceService } = require("../src/modules/ai/adviceService");

function createHelpers() {
  return {
    buildLocalBusinessAdvice: () => ({
      title: "本地建议",
      summary: "本地摘要",
      risks: ["本地风险"],
      suggestions: ["本地建议"],
      nextActions: ["本地动作"],
      missingInfo: [],
      modelUsed: "local-rule-engine",
      generatedBy: "local-rule-engine",
      fallback: true,
    }),
    compactBusinessAdviceContext: () => ({ target: { id: "REQ-001" }, tasks: [{ id: "TASK-001", blocker: "API waiting" }] }),
    normalizeBusinessAdvicePayload: (value, fallback) => ({
      title: value.title || fallback.title,
      summary: value.summary || fallback.summary,
      risks: Array.isArray(value.risks) && value.risks.length ? value.risks : fallback.risks,
      suggestions: Array.isArray(value.suggestions) && value.suggestions.length ? value.suggestions : fallback.suggestions,
      nextActions: Array.isArray(value.nextActions) && value.nextActions.length ? value.nextActions : fallback.nextActions,
      missingInfo: Array.isArray(value.missingInfo) ? value.missingInfo : [],
      modelUsed: value.modelUsed || fallback.modelUsed,
      generatedBy: value.generatedBy || fallback.generatedBy,
      fallback: Boolean(value.fallback ?? fallback.fallback),
    }),
  };
}

function createBaseDeps(overrides = {}) {
  const rows = (sql) => {
    if (sql.includes("FROM tasks")) return [{ id: "TASK-001", title: "Build", status: "blocked", progress: 60, blocker: "API waiting" }];
    if (sql.includes("FROM test_cases")) return [{ id: "TC-001", name: "Regression", status: "failed", total_cases: 5, passed_cases: 3, failed_cases: 2, blocked_cases: 0 }];
    if (sql.includes("FROM defects")) return [{ id: "BUG-001", title: "Timeout", severity: "high", status: "confirmed" }];
    return [];
  };
  return {
    businessAdviceContextService: { load: () => ({ target: { id: "REQ-001" } }) },
    businessAdviceHelpers: createHelpers(),
    callModel: async () => null,
    compactText: (value, max = 180) => String(value || "").slice(0, max),
    extractJsonPayload: (text) => {
      if (!text) return null;
      try { return JSON.parse(text); } catch { return null; }
    },
    getModelName: () => "unit-model",
    getProviderName: () => "unit-provider",
    mapRequirement: (item) => ({ id: item.id, title: item.title }),
    row: () => ({ id: "REQ-001", title: "Checkout", deleted_at: null }),
    rows,
    ...overrides,
  };
}

test("AI advice service generates requirement recommendation from model JSON", async () => {
  let prompt = "";
  const service = createAiAdviceService(createBaseDeps({
    callModel: async (input) => {
      prompt = input;
      return JSON.stringify({ recommendation: "先关闭阻塞缺陷并补齐回归证据。" });
    },
  }));

  const recommendation = await service.createRequirementRecommendation({ requirementId: "REQ-001", score: 70 });

  assert.match(prompt, /需求完成度评分数据/);
  assert.equal(recommendation, "先关闭阻塞缺陷并补齐回归证据。");
});

test("AI advice service normalizes structured business advice without performance conclusions", async () => {
  const service = createAiAdviceService(createBaseDeps({
    callModel: async () => JSON.stringify({
      title: "交付风险",
      summary: "存在阻塞",
      risks: ["API waiting"],
      suggestions: ["明确负责人"],
      nextActions: ["今天同步"],
      missingInfo: ["截止时间"],
      performanceScore: 100,
      ranking: 1,
    }),
  }));

  const advice = await service.createBusinessAdvice({ targetType: "requirement", targetId: "REQ-001", question: "风险？" });

  assert.equal(advice.title, "交付风险");
  assert.equal(advice.modelUsed, "unit-model");
  assert.equal(advice.generatedBy, "unit-provider");
  assert.equal(advice.fallback, false);
  assert.equal(Object.hasOwn(advice, "performanceScore"), false);
  assert.equal(Object.hasOwn(advice, "ranking"), false);
});

test("AI advice service uses plain text model fallback before local fallback", async () => {
  let calls = 0;
  const service = createAiAdviceService(createBaseDeps({
    callModel: async () => {
      calls += 1;
      return calls === 1 ? null : "请先处理阻塞任务，并补齐验收证据。";
    },
  }));

  const advice = await service.createBusinessAdvice({ targetType: "requirement", targetId: "REQ-001" });

  assert.equal(calls, 2);
  assert.equal(advice.summary, "请先处理阻塞任务，并补齐验收证据。");
  assert.equal(advice.fallback, false);
});
