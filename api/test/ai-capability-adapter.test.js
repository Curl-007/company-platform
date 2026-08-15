const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_CAPABILITY_TIMEOUT_MS,
  capabilityPrompt,
  capabilityToolCatalogLines,
  createHarnessCapabilityAdapter,
  resolveCapabilityTimeoutMs,
} = require("../src/modules/ai/capabilityAdapter");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");

const manifest = {
  id: "project-snapshot",
  version: "1.0.0",
  scopes: ["project-management"],
  runtime: { kind: "company_harness_tool", toolName: "project_snapshot" },
};

function capturedSnapshot() {
  return {
    claims: { tokenId: "safe-token-id" },
    evidence: { event: "execution-gateway.project-snapshot", source: "adapter-fallback" },
    snapshot: {
      evidence: ["Project PRJ-1 is scoped to this invocation."],
      metrics: {
        blockedTasks: 1,
        openDefects: 2,
        openRisks: 0,
        tasks: 3,
      },
      project: { id: "PRJ-1", healthScore: 78, name: "Project one", status: "active" },
      risks: ["[high] Delivery dependency"],
    },
  };
}

function gatewayStub({ captured = null } = {}) {
  return {
    execute: async () => capturedSnapshot(),
    getCaptured: () => captured,
    start: async () => "http://127.0.0.1:43123",
  };
}

test("capability adapter discards model text when the Harness tool was not captured", async () => {
  let issued = 0;
  const adapter = createHarnessCapabilityAdapter({
    callModel: async () => "Unverified model narrative",
    executionGateway: gatewayStub(),
    now: () => "2026-08-14T00:00:00.000Z",
  });

  const completed = await adapter.invoke({
    beginExecution: async () => {
      issued += 1;
      return "scoped-token";
    },
    input: { projectId: "PRJ-1" },
    invocationId: "AIC-1",
    manifest,
  });

  assert.equal(issued, 1);
  assert.equal(completed.result.generatedBy, "platform_snapshot");
  assert.equal(completed.result.modelFallback, true);
  assert.notEqual(completed.result.summary, "Unverified model narrative");
  assert.equal(completed.events.some((item) => item.type === "harness.capability.model-output-discarded"), true);
});

test("capability adapter refuses execution without a control-plane token issuer", async () => {
  const adapter = createHarnessCapabilityAdapter({ executionGateway: gatewayStub() });

  await assert.rejects(
    () => adapter.invoke({
      input: { projectId: "PRJ-1" },
      invocationId: "AIC-1",
      manifest,
    }),
    { code: "AI_CAPABILITY_EXECUTION_NOT_STARTED", status: 500 },
  );
});

test("capability adapter timeout defaults to 120s and follows AI_CAPABILITY_TIMEOUT_MS", async () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  assert.equal(DEFAULT_CAPABILITY_TIMEOUT_MS, 120000);
  assert.equal(resolveCapabilityTimeoutMs({}, logger), 120000);
  assert.equal(resolveCapabilityTimeoutMs({ AI_CAPABILITY_TIMEOUT_MS: "250000" }, logger), 250000);
  assert.equal(resolveCapabilityTimeoutMs({ AI_CAPABILITY_TIMEOUT_MS: " 250000 " }, logger), 250000);

  // Invalid values fall back to the default and warn once per process.
  assert.equal(resolveCapabilityTimeoutMs({ AI_CAPABILITY_TIMEOUT_MS: "soon" }, logger), 120000);
  assert.equal(resolveCapabilityTimeoutMs({ AI_CAPABILITY_TIMEOUT_MS: "0" }, logger), 120000);
  assert.equal(resolveCapabilityTimeoutMs({ AI_CAPABILITY_TIMEOUT_MS: "-5" }, logger), 120000);
  assert.equal(resolveCapabilityTimeoutMs({ AI_CAPABILITY_TIMEOUT_MS: "12.5" }, logger), 120000);
  const warnedFor = warnings.filter((message) => message.includes("AI_CAPABILITY_TIMEOUT_MS"));
  assert.equal(warnedFor.length, 1, "an invalid timeout warns exactly once");

  const observed = [];
  const adapter = createHarnessCapabilityAdapter({
    callModel: async (_prompt, options) => {
      observed.push(options.timeoutMs);
      return "model text";
    },
    env: { AI_CAPABILITY_TIMEOUT_MS: "250000" },
    executionGateway: gatewayStub(),
    logger,
  });
  await adapter.invoke({
    beginExecution: async () => "scoped-token",
    input: { projectId: "PRJ-1" },
    invocationId: "AIC-2",
    manifest,
  });
  assert.deepEqual(observed, [250000]);
});

test("capability adapter prompt is manifest-driven and lists the scoped tool catalog", async () => {
  const registry = createCapabilityRegistry();
  const catalog = capabilityToolCatalogLines(manifest, registry);
  assert.equal(catalog.length, registry.list().length);
  for (const line of catalog) assert.match(line, /^- [a-z][a-z0-9_]+: .+ \(capability [a-z-]+\)$/);

  const prompt = capabilityPrompt(manifest, { projectId: "PRJ-1" }, catalog);
  assert.match(prompt, /Invoked capability: project-snapshot \(1\.0\.0\); primary tool: project_snapshot\./);
  assert.match(prompt, /\{"projectId":"PRJ-1"\}/);
  assert.match(prompt, /- project_snapshot: /);
  assert.match(prompt, /- requirements_list: /);
  assert.match(prompt, /- requirement_create: /);
  assert.match(prompt, /- reminder_create: /);
  assert.match(prompt, /读取授权项目的交付快照/);

  // The catalog follows the registry: a single-manifest registry yields the
  // single declared tool, and out-of-scope manifests are never advertised.
  const snapshotOnly = createCapabilityRegistry([registry.get("project-snapshot")]);
  assert.deepEqual(capabilityToolCatalogLines(manifest, snapshotOnly), [
    "- project_snapshot: 读取授权项目的交付快照：项目状态、关键指标与风险。 (capability project-snapshot)",
  ]);
  const foreignScopeManifest = { ...manifest, scopes: ["organization-management"] };
  assert.deepEqual(capabilityToolCatalogLines(foreignScopeManifest, snapshotOnly), []);

  const prompts = [];
  const adapter = createHarnessCapabilityAdapter({
    callModel: async (prompt, _options) => {
      prompts.push(prompt);
      return null;
    },
    executionGateway: gatewayStub(),
    now: () => "2026-08-14T00:00:00.000Z",
    registry,
  });
  await adapter.invoke({
    beginExecution: async () => "scoped-token",
    input: { projectId: "PRJ-1" },
    invocationId: "AIC-3",
    manifest,
  });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /- defects_list: /);
  assert.match(prompts[0], /\{"projectId":"PRJ-1"\}/);
});

test("capability adapter dispatches registry-approved domain capabilities generically", async () => {
  const registry = createCapabilityRegistry();
  const domainManifest = registry.get("requirements-list");
  const fallbacks = [];
  const gateway = {
    execute: async () => {
      throw new Error("snapshot route must not be used for domain capabilities");
    },
    executeDomain: async ({ input, source, token }) => {
      fallbacks.push({ input, source, token });
      return {
        claims: { projectId: "PRJ-1", tokenId: "safe-token-id" },
        evidence: { event: "execution-gateway.requirements-list", source },
        result: { count: 1, projectId: "PRJ-1", requirements: [{ id: "REQ-1", title: "Login" }] },
      };
    },
    getCaptured: () => null,
    start: async () => "http://127.0.0.1:43123",
  };
  const adapter = createHarnessCapabilityAdapter({
    callModel: async () => "Unverified narrative",
    executionGateway: gateway,
    now: () => "2026-08-14T00:00:00.000Z",
    registry,
  });

  const completed = await adapter.invoke({
    beginExecution: async () => "scoped-token",
    input: { projectId: "PRJ-1" },
    invocationId: "AIC-DOM",
    manifest: domainManifest,
  });

  // The adjudicated gateway result is the invocation result verbatim: closed
  // output schemas forbid inventing adapter-side reporting fields.
  assert.deepEqual(completed.result, {
    count: 1,
    projectId: "PRJ-1",
    requirements: [{ id: "REQ-1", title: "Login" }],
  });
  assert.equal(completed.result.generatedBy, undefined);
  assert.deepEqual(fallbacks.map((call) => call.source), ["adapter-fallback"]);
  assert.deepEqual(fallbacks[0].input, {
    capabilityId: "requirements-list",
    capabilityVersion: "1.0.0",
    projectId: "PRJ-1",
  });
  assert.equal(fallbacks[0].token, "scoped-token");
  assert.ok(completed.events.some((item) => item.type === "harness.capability.started"));
  assert.ok(completed.events.some((item) => item.type === "execution-gateway.adapter-fallback"));
  assert.ok(completed.events.some((item) => item.type === "harness.capability.model-output-discarded"));
  assert.ok(completed.events.some((item) => item.type === "harness.capability.completed"));
  assert.equal(completed.execution.claims.projectId, "PRJ-1");

  // Runtime-tool capture is honored identically to the snapshot path.
  const capturedGateway = {
    ...gateway,
    getCaptured: () => ({
      claims: { projectId: "PRJ-1" },
      evidence: { event: "execution-gateway.requirements-list", source: "runtime-tool" },
      result: { count: 0, projectId: "PRJ-1", requirements: [] },
    }),
  };
  const capturedAdapter = createHarnessCapabilityAdapter({
    callModel: async () => "Model used the tool",
    executionGateway: capturedGateway,
    now: () => "2026-08-14T00:00:00.000Z",
    registry,
  });
  const capturedRun = await capturedAdapter.invoke({
    beginExecution: async () => "scoped-token",
    input: { projectId: "PRJ-1" },
    invocationId: "AIC-DOM-2",
    manifest: domainManifest,
  });
  assert.deepEqual(capturedRun.result, { count: 0, projectId: "PRJ-1", requirements: [] });
  assert.ok(capturedRun.events.some((item) => item.type === "execution-gateway.runtime-tool"));
  assert.ok(!capturedRun.events.some((item) => item.type === "execution-gateway.adapter-fallback"));
});

test("capability adapter still refuses manifests outside the registry", async () => {
  const adapter = createHarnessCapabilityAdapter({
    executionGateway: gatewayStub(),
    now: () => "2026-08-14T00:00:00.000Z",
  });
  await assert.rejects(
    () => adapter.invoke({
      beginExecution: async () => "scoped-token",
      input: { projectId: "PRJ-1" },
      invocationId: "AIC-1",
      manifest: { ...manifest, id: "requirements-export", runtime: { kind: "company_harness_tool", toolName: "requirements_export" } },
    }),
    { code: "AI_CAPABILITY_ADAPTER_NOT_FOUND", status: 500 },
  );
});
