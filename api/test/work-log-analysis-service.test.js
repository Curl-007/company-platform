const assert = require("node:assert/strict");
const test = require("node:test");
const { createWorkLogAnalysisService, extractJsonPayload, extractSentences } = require("../src/modules/workLogs/analysisService");

function createFixtures(overrides = {}) {
  const requirements = [
    { id: "REQ-001", title: "登录改造", completion: 40, status: "in_progress", deleted_at: null },
  ];
  return {
    callModel: overrides.callModel,
    getModelName: () => overrides.modelName || "unit-test-model",
    row: (sql, params = {}) => {
      if (sql.includes("FROM requirements WHERE id")) {
        return requirements.find((item) => item.id === params.id && item.deleted_at === null) || null;
      }
      return null;
    },
    rows: (sql) => {
      if (sql.includes("FROM requirements")) return requirements;
      return [];
    },
  };
}

test("work log analysis local rules extract collaboration signals without performance fields", () => {
  const service = createWorkLogAnalysisService(createFixtures());
  const result = service.localAnalyze({
    content: "完成 REQ-001 登录联调，进度 20% 到 45%。等待测试环境，有阻塞风险。",
  });

  assert.equal(result.linkedRequirements[0].id, "REQ-001");
  assert.equal(result.linkedRequirements[0].title, "登录改造");
  assert.deepEqual(result.progressChange, { from: 20, to: 45, delta: 25 });
  assert.equal(Object.hasOwn(result, "performanceScore"), false);
  assert.equal(Object.hasOwn(result, "ranking"), false);
  assert.equal(Object.hasOwn(result, "promotionAdvice"), false);
});

test("work log analysis normalizes model output and drops individual evaluation fields", async () => {
  let prompt = "";
  const service = createWorkLogAnalysisService(createFixtures({
    callModel: async (inputPrompt) => {
      prompt = inputPrompt;
      return JSON.stringify({
        completedItems: ["完成接口"],
        blockers: [],
        linkedRequirements: ["REQ-001"],
        progressChange: { from: 10, to: 60, delta: 50 },
        confidence: "high",
        suggestedActions: ["安排验收"],
        performanceScore: 100,
        ranking: 1,
      });
    },
  }));

  const result = await service.analyze({ content: "REQ-001 完成接口，从 10% 到 60%" });

  assert.match(prompt, /不得输出个人绩效评分、排名、薪酬、晋升或淘汰建议/);
  assert.equal(result.modelUsed, "unit-test-model");
  assert.deepEqual(result.completedItems, ["完成接口"]);
  assert.equal(Object.hasOwn(result, "performanceScore"), false);
  assert.equal(Object.hasOwn(result, "ranking"), false);
});

test("work log analysis helpers parse fenced JSON and Chinese sentence punctuation", () => {
  assert.deepEqual(extractJsonPayload("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(
    extractSentences("完成登录。等待环境；继续测试", ["完成", "等待"]),
    ["完成登录", "等待环境"],
  );
});
