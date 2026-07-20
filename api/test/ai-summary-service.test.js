const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAiSummarySignals,
  buildLocalAiSummary,
  collectAiBusinessSnapshot,
  compactText,
  createAiSummaryService,
  normalizeAiSummaryPayload,
} = require("../src/modules/ai/summaryService");

function rows(sql) {
  if (sql.includes("FROM projects")) return [{ id: "PRJ-001", name: "Portal", status: "active", health_score: 65, progress: 50, risk_count: 2, owner: "PM" }];
  if (sql.includes("FROM requirements")) return [{ id: "REQ-001", title: "Checkout", status: "testing", priority: "high", completion: 60, project_id: "PRJ-001", owner: "PDM", assignee: "PDM" }];
  if (sql.includes("FROM tasks")) return [{ id: "TASK-001", title: "Payment", status: "blocked", project_id: "PRJ-001", requirement_id: "REQ-001", owner: "Dev", progress: 40, blocker: "API waiting", due_date: "2026-07-20" }];
  if (sql.includes("FROM defects")) return [{ id: "BUG-001", title: "Timeout", severity: "high", status: "confirmed", project_id: "PRJ-001", requirement_id: "REQ-001", assignee: "QA" }];
  if (sql.includes("FROM work_logs")) return [{ author: "Dev", project: "Portal", content: "完成联调", blockers: "等待 API", next_plan: "继续回归", created_at: "2026-07-15T00:00:00.000Z" }];
  if (sql.includes("FROM ai_jobs")) return [{ job_id: "JOB-001", scene: "document_analysis", status: "awaiting_review", progress: 80, current_step: "review", error_message: "", created_at: "2026-07-15T00:00:00.000Z" }];
  if (sql.includes("FROM builds")) return [{ id: "BLD-001", name: "Build", version: "1.0.0", status: "testing", project_id: "PRJ-001", build_date: "2026-07-15", notes: "needs regression", created_at: "2026-07-15T00:00:00.000Z" }];
  if (sql.includes("FROM releases")) return [{ id: "REL-001", name: "Release", version: "1.0.0", status: "draft", product_id: "PROD-001", release_date: "2026-07-16", release_notes: "pending", created_at: "2026-07-15T00:00:00.000Z" }];
  return [];
}

test("AI summary service builds auditable snapshots and local operational summaries", async () => {
  assert.equal(compactText("a ".repeat(200), 20), "a a a a a a a a a a ...");
  const snapshot = await collectAiBusinessSnapshot({ rows }, "dashboard");
  assert.equal(snapshot.projects[0].healthScore, 65);
  assert.equal(snapshot.tasks[0].blocker, "API waiting");

  const signals = buildAiSummarySignals(snapshot);
  assert.match(signals.riskyProjects[0], /PRJ-001/);
  assert.match(signals.blockedTasks[0], /API waiting/);

  const fallback = buildLocalAiSummary("dashboard", { awaitingReview: 1 }, snapshot);
  assert.equal(fallback.modelUsed, "local-rule-engine");
  assert.ok(fallback.risks.length > 0);
  assert.doesNotMatch([...fallback.risks, ...fallback.recommendations].join(" "), /绩效|排名|薪酬|晋升|淘汰/);
});

test("AI summary service normalizes model JSON and caches generated summaries", async () => {
  let calls = 0;
  const service = createAiSummaryService({
    callModel: async () => {
      calls += 1;
      return JSON.stringify({
        title: "模型摘要",
        summary: "当前存在交付风险",
        risks: ["阻塞任务"],
        recommendations: ["先处理阻塞"],
      });
    },
    extractJsonPayload: JSON.parse,
    getModelName: () => "unit-model",
    rows,
  });

  const first = await service.createSummary("dashboard", { awaitingReview: 0 }, { cacheKey: "same" });
  const second = await service.createSummary("dashboard", { awaitingReview: 0 }, { cacheKey: "same" });

  assert.equal(first.title, "模型摘要");
  assert.equal(first.modelUsed, "unit-model");
  assert.equal(second.title, "模型摘要");
  assert.equal(calls, 1);

  const normalized = normalizeAiSummaryPayload({ title: "x", risks: ["risk"] }, { title: "fallback", summary: "s", risks: [], recommendations: ["r"] }, "m");
  assert.deepEqual(normalized, {
    title: "x",
    summary: "s",
    risks: ["risk"],
    recommendations: ["r"],
    generatedBy: "real-model",
    modelUsed: "m",
  });
});
