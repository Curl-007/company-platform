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

function rows(sql, params = {}) {
  if (sql.includes("FROM projects")) {
    const all = [{ id: "PRJ-001", name: "Portal", status: "active", health_score: 65, progress: 50, risk_count: 2, owner: "PM" },
      { id: "PRJ-002", name: "Portal", status: "active", health_score: 90, progress: 80, risk_count: 0, owner: "Other" }];
    if (sql.includes("IN (")) {
      const allowed = new Set(Object.values(params));
      return all.filter((item) => allowed.has(item.id));
    }
    return all;
  }
  if (sql.includes("FROM requirements")) {
    const all = [
      { id: "REQ-001", title: "Checkout", status: "testing", priority: "high", completion: 60, project_id: "PRJ-001", owner: "PDM", assignee: "PDM" },
      { id: "REQ-002", title: "Hidden", status: "draft", priority: "high", completion: 10, project_id: "PRJ-002", owner: "X", assignee: "X" },
    ];
    if (sql.includes("project_id IN")) {
      const allowed = new Set(Object.values(params));
      return all.filter((item) => allowed.has(item.project_id));
    }
    return all;
  }
  if (sql.includes("FROM tasks")) {
    const all = [
      { id: "TASK-001", title: "Payment", status: "blocked", project_id: "PRJ-001", requirement_id: "REQ-001", owner: "Dev", progress: 40, blocker: "API waiting", due_date: "2026-07-20" },
      { id: "TASK-002", title: "Secret task", status: "todo", project_id: "PRJ-002", requirement_id: "REQ-002", owner: "X", progress: 0, blocker: "", due_date: null },
    ];
    if (sql.includes("project_id IN")) {
      const allowed = new Set(Object.values(params));
      return all.filter((item) => allowed.has(item.project_id));
    }
    return all;
  }
  if (sql.includes("FROM defects")) {
    const all = [
      { id: "BUG-001", title: "Timeout", severity: "high", status: "confirmed", project_id: "PRJ-001", requirement_id: "REQ-001", assignee: "QA" },
      { id: "BUG-002", title: "Hidden bug", severity: "high", status: "open", project_id: "PRJ-002", requirement_id: "REQ-002", assignee: "QA" },
    ];
    if (sql.includes("project_id IN")) {
      const allowed = new Set(Object.values(params));
      return all.filter((item) => allowed.has(item.project_id));
    }
    return all;
  }
  if (sql.includes("FROM work_logs")) {
    const all = [
      { author: "Dev", project_id: "PRJ-001", project: "Portal", content: "完成联调", blockers: "等待 API", next_plan: "继续回归", created_at: "2026-07-15T00:00:00.000Z" },
      { author: "X", project_id: "PRJ-002", project: "Portal", content: "secret log", blockers: "", next_plan: "", created_at: "2026-07-15T00:00:00.000Z" },
    ];
    if (sql.includes("project_id IN")) {
      const allowed = new Set(Object.values(params));
      return all.filter((item) => allowed.has(item.project_id));
    }
    return all;
  }
  if (sql.includes("FROM ai_jobs")) return [
    { job_id: "JOB-001", scene: "document_analysis", status: "awaiting_review", progress: 80, current_step: "review", error_message: "", project_id: "PRJ-001", created_at: "2026-07-15T00:00:00.000Z" },
    { job_id: "JOB-002", scene: "document_analysis", status: "done", progress: 100, current_step: "done", error_message: "", project_id: "PRJ-002", created_at: "2026-07-15T00:00:00.000Z" },
  ];
  if (sql.includes("FROM builds")) {
    const all = [
      { id: "BLD-001", name: "Build", version: "1.0.0", status: "testing", project_id: "PRJ-001", build_date: "2026-07-15", notes: "needs regression", created_at: "2026-07-15T00:00:00.000Z" },
      { id: "BLD-002", name: "SecretBuild", version: "9.0.0", status: "ready", project_id: "PRJ-002", build_date: "2026-07-15", notes: "no", created_at: "2026-07-15T00:00:00.000Z" },
    ];
    if (sql.includes("project_id IN")) {
      const allowed = new Set(Object.values(params));
      return all.filter((item) => allowed.has(item.project_id));
    }
    return all;
  }
  if (sql.includes("FROM releases")) return [
    { id: "REL-001", name: "Release", version: "1.0.0", status: "draft", product_id: "PROD-001", project_id: "PRJ-001", release_date: "2026-07-16", release_notes: "pending", created_at: "2026-07-15T00:00:00.000Z" },
    { id: "REL-002", name: "Hidden", version: "9.0.0", status: "draft", product_id: "PROD-002", project_id: "PRJ-002", release_date: "2026-07-16", release_notes: "hidden", created_at: "2026-07-15T00:00:00.000Z" },
  ];
  return [];
}

test("AI summary service builds auditable snapshots and local operational summaries", async () => {
  assert.equal(compactText("a ".repeat(200), 20), "a a a a a a a a a a ...");
  const snapshot = await collectAiBusinessSnapshot({ rows }, "dashboard", { accessScope: { all: true } });
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

test("AI summary snapshot respects projectIds scope isolation", async () => {
  const scoped = await collectAiBusinessSnapshot({ rows }, "dashboard", { accessScope: { projectIds: ["PRJ-001"] } });
  assert.deepEqual(scoped.projects.map((item) => item.id), ["PRJ-001"]);
  assert.equal(scoped.tasks.every((item) => item.projectId === "PRJ-001"), true);
  assert.equal(scoped.defects.every((item) => item.projectId === "PRJ-001"), true);
  assert.equal(scoped.builds.every((item) => item.projectId === "PRJ-001"), true);
  assert.equal(scoped.workLogs.every((item) => item.projectId === "PRJ-001"), true);
  assert.deepEqual(scoped.releases.map((item) => item.id), ["REL-001"]);
  assert.deepEqual(scoped.aiJobs.map((item) => item.jobId), ["JOB-001"]);

  const empty = await collectAiBusinessSnapshot({ rows }, "dashboard", { accessScope: { projectIds: [] } });
  assert.equal(empty.projects.length, 0);
  assert.equal(empty.tasks.length, 0);
  const missing = await collectAiBusinessSnapshot({ rows }, "dashboard");
  assert.equal(missing.projects.length, 0);
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

  const first = await service.createSummary("dashboard", { awaitingReview: 0 }, { accessScope: { all: true }, cacheKey: "same" });
  const second = await service.createSummary("dashboard", { awaitingReview: 0 }, { accessScope: { all: true }, cacheKey: "same" });

  assert.equal(first.title, "模型摘要");
  assert.equal(first.modelUsed, "unit-model");
  assert.equal(second.title, "模型摘要");
  assert.equal(calls, 1);

  service.invalidateCache("dashboard", "same");
  const third = await service.createSummary("dashboard", { awaitingReview: 0 }, { accessScope: { all: true }, cacheKey: "same" });
  assert.equal(third.title, "模型摘要");
  assert.equal(calls, 2);

  service.clearCache();
  await service.createSummary("dashboard", { awaitingReview: 0 }, { accessScope: { all: true }, cacheKey: "same" });
  assert.equal(calls, 3);

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

test("AI summary fresh bypasses a stable cache key and cache remains bounded", async () => {
  let calls = 0;
  let clock = 1000;
  const service = createAiSummaryService({
    callModel: async () => JSON.stringify({ title: `call-${++calls}`, summary: "s", risks: ["r"], recommendations: ["a"] }),
    extractJsonPayload: JSON.parse,
    getModelName: () => "unit-model",
    rows,
    nowImpl: () => clock,
    cacheTtlMs: 50,
    cacheMaxEntries: 2,
  });
  const options = { accessScope: { projectIds: ["PRJ-001"] }, cacheKey: "stable" };
  assert.equal((await service.createSummary("dashboard", {}, options)).title, "call-1");
  assert.equal((await service.createSummary("dashboard", {}, options)).title, "call-1");
  assert.equal((await service.createSummary("dashboard", {}, { ...options, skipCache: true })).title, "call-2");
  assert.equal(service.cacheSize(), 1);

  await service.createSummary("dashboard", {}, { ...options, cacheKey: "second" });
  await service.createSummary("dashboard", {}, { ...options, cacheKey: "third" });
  assert.equal(service.cacheSize(), 2);
  clock += 51;
  await service.createSummary("dashboard", {}, { ...options, cacheKey: "after-ttl" });
  assert.equal(service.cacheSize(), 1);
});
