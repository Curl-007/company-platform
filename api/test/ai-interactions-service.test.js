const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildChatPayload,
  buildSummary,
  createBusinessAdviceContextService,
  createBusinessAdviceHelpers,
  validateAdviceTarget,
} = require("../src/modules/ai/interactionsService");

test("AI interaction service validates target scope and reports operational—not performance—job metrics", () => {
  assert.deepEqual(validateAdviceTarget({ targetType: "project", targetId: "PRJ-001" }), { targetType: "project", targetId: "PRJ-001" });
  assert.throws(() => validateAdviceTarget({ targetType: "employee", targetId: "USR-001" }), { code: "VALIDATION_FAILED" });
  const summary = buildSummary({
    aiProvider: {
      id: "AIP-001",
      activeId: "AIP-001",
      configured: true,
      enabled: true,
      provider: "openai-compatible",
      model: "model",
      wireApi: "responses",
      health: {
        status: "healthy",
        lastAttemptAt: "2026-07-15T01:00:00.000Z",
        lastSuccessAt: "2026-07-15T01:00:00.000Z",
      },
      providers: [
        { id: "AIP-001", configured: true },
        { id: "AIP-002", configured: false },
      ],
    },
    jobs: [
      { job_id: "JOB-001", scene: "document_analysis", status: "queued", progress: 0 },
      { job_id: "JOB-002", scene: "document_analysis", status: "confirmed", progress: 100, written_requirement_id: "REQ-001" },
    ],
    logAnalysis: 4,
  });
  assert.deepEqual(summary.metrics, {
    totalJobs: 2,
    queued: 1,
    running: 0,
    awaitingReview: 0,
    confirmed: 1,
    rejected: 0,
    failed: 0,
    parsing: 1,
    writtenToBusiness: 1,
    avgConfidence: 50,
    logAnalysis: 4,
  });
  assert.equal(summary.modelRoutes[0].modelStrategy, "model / responses");
  assert.equal(summary.modelRoutes[0].status, "active");
  assert.equal(summary.modelRoutes[0].provider, "openai-compatible");
  assert.equal(summary.modelRoutes[0].activeProviderId, "AIP-001");
  assert.equal(summary.modelRoutes[0].configuredProviderCount, 1);
  assert.equal(summary.modelRoutes[0].providerCount, 2);
  assert.equal(summary.modelRoutes[0].healthStatus, "healthy");
  assert.equal(summary.modelRoutes[0].lastSuccessAt, "2026-07-15T01:00:00.000Z");
  const payload = buildChatPayload({
    attachments: [{ name: "spec.md", mimeType: "text/markdown", size: 10, kind: "document", contentText: "secret" }],
    config: { model: "model", provider: "provider" },
    content: "建议按项目风险处理。",
    fallback: false,
    now: () => "2026-07-13T00:00:00.000Z",
  });
  assert.equal(payload.attachments[0].contentText, undefined);
  assert.equal(payload.fallback, false);
});

test("AI summary model routes reflect provider configuration and health instead of static active status", () => {
  const unconfigured = buildSummary({
    aiProvider: { configured: false, enabled: true, providers: [{ id: "AIP-001", configured: false }] },
    jobs: [],
    logAnalysis: 0,
  });
  assert.equal(unconfigured.modelRoutes[0].modelStrategy, "local-rule-engine");
  assert.equal(unconfigured.modelRoutes[0].status, "unconfigured");
  assert.equal(unconfigured.modelRoutes[0].configuredProviderCount, 0);
  assert.equal(unconfigured.modelRoutes[0].providerCount, 1);

  const disabled = buildSummary({
    aiProvider: { configured: false, enabled: false, health: { status: "disabled" }, providers: [] },
    jobs: [],
    logAnalysis: 0,
  });
  assert.equal(disabled.modelRoutes[0].status, "disabled");
  assert.equal(disabled.modelRoutes[0].healthStatus, "disabled");

  const unavailable = buildSummary({
    aiProvider: {
      id: "AIP-009",
      activeId: "AIP-009",
      configured: true,
      enabled: true,
      provider: "openai-compatible",
      model: "model-x",
      wireApi: "chat_completions",
      health: {
        status: "unavailable",
        lastAttemptAt: "2026-07-15T02:00:00.000Z",
        lastFailureAt: "2026-07-15T02:00:00.000Z",
        lastErrorCode: "500",
      },
      providers: [{ id: "AIP-009", configured: true }],
    },
    jobs: [],
    logAnalysis: 0,
  });
  assert.equal(unavailable.modelRoutes[0].modelStrategy, "model-x / chat_completions");
  assert.equal(unavailable.modelRoutes[0].status, "unavailable");
  assert.equal(unavailable.modelRoutes[0].lastFailureAt, "2026-07-15T02:00:00.000Z");
  assert.equal(unavailable.modelRoutes[0].lastErrorCode, "500");
});

test("AI business advice helpers keep advice operational and compact review context", () => {
  const helpers = createBusinessAdviceHelpers({
    compactText: (value, max = 180) => {
      const text = String(value || "");
      return text.length > max ? `${text.slice(0, max)}...` : text;
    },
  });
  const context = {
    target: { id: "REQ-001", title: "Checkout", status: "testing" },
    score: { hardRules: ["验收标准不完整。"] },
    project: { id: "PRJ-001", name: "Portal", status: "active", healthScore: 78 },
    tasks: [{ id: "TASK-001", title: "Implement checkout", status: "in_progress", progress: 70, remainingHours: 3, blocker: "API waiting", requirementId: "REQ-001" }],
    tests: [{ id: "TC-001", name: "Payment regression", status: "failed", totalCases: 5, passedCases: 3, failedCases: 2, blockedCases: 0, requirementId: "REQ-001" }],
    defects: [{ id: "BUG-001", title: "Payment timeout", severity: "high", status: "confirmed", requirementId: "REQ-001", foundInBuild: "BLD-001", assignee: "QA" }],
  };

  const advice = helpers.buildLocalBusinessAdvice("requirement", "REQ-001", context);
  assert.equal(advice.fallback, true);
  assert.ok(advice.risks.some((item) => item.includes("未关闭缺陷")));
  assert.ok(advice.risks.some((item) => item.includes("任务未闭环")));
  assert.doesNotMatch([...advice.risks, ...advice.suggestions, ...advice.nextActions].join(" "), /绩效|排名|薪酬|晋升|淘汰/);

  const compact = helpers.compactBusinessAdviceContext("requirement", context);
  assert.equal(compact.tasks[0].blocker, "API waiting");
  assert.deepEqual(compact.project, { id: "PRJ-001", name: "Portal", status: "active", healthScore: 78 });

  const normalized = helpers.normalizeBusinessAdvicePayload({ title: "x", risks: [" ", "risk"], fallback: false }, advice);
  assert.equal(normalized.title, "x");
  assert.deepEqual(normalized.risks, ["risk"]);
  assert.equal(normalized.suggestions, advice.suggestions);
  assert.equal(normalized.fallback, false);
});

test("AI business advice context service assembles auditable domain context from repository rows", async () => {
  const releaseRow = { id: "REL-001", name: "Release", status: "staging" };
  const service = createBusinessAdviceContextService({
    repository: {
      findRequirement: (id) => id === "REQ-001" ? { id, title: "Checkout", project_id: "PRJ-001" } : null,
      findProject: (id) => ({ id, name: "Portal" }),
      listTasksForRequirement: () => [{ id: "TASK-001", title: "Build", requirement_id: "REQ-001" }],
      listTestCasesForRequirement: () => [{ id: "TC-001", name: "Regression", requirement_id: "REQ-001" }],
      listDefectsForRequirement: () => [{ id: "BUG-001", title: "Timeout", requirement_id: "REQ-001" }],
      findRelease: (id) => id === releaseRow.id ? releaseRow : null,
    },
    requirementScore: (id) => ({ requirementId: id, score: 80 }),
    mapRequirement: (item) => ({ id: item.id, title: item.title }),
    mapProject: (item) => ({ id: item.id, name: item.name }),
    mapTask: (item) => ({ id: item.id, title: item.title }),
    mapTestCase: (item) => ({ id: item.id, name: item.name }),
    mapDefect: (item) => ({ id: item.id, title: item.title }),
    mapRelease: (item) => ({ id: item.id, status: item.status }),
    evaluateReleaseDeliveryGates: (item) => ({ id: item.id, ready: false, gates: [] }),
    buildReleaseReport: (item) => ({ release: { id: item.id }, metrics: { approvalCount: 0 } }),
  });

  const requirementContext = await service.load("requirement", "REQ-001");
  assert.equal(requirementContext.target.id, "REQ-001");
  assert.equal(requirementContext.project.id, "PRJ-001");
  assert.equal(requirementContext.tasks[0].id, "TASK-001");
  assert.equal(requirementContext.score.score, 80);

  const releaseContext = await service.load("release", "REL-001");
  assert.equal(releaseContext.target.id, "REL-001");
  assert.equal(releaseContext.gates.ready, false);
  assert.equal(releaseContext.report.metrics.approvalCount, 0);
  assert.equal(await service.load("requirement", "REQ-404"), null);
});
