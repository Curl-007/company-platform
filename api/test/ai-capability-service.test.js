const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiCapabilityService } = require("../src/modules/ai/capabilityService");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");

function snapshotResult(token, overrides = {}) {
  return {
    execution: { claims: { tokenId: "safe-token-id" }, token },
    events: [{ detail: { token }, type: "harness.capability.completed" }],
    result: {
      evidence: ["Project PRJ-1 is scoped to this invocation."],
      generatedBy: "harness",
      metrics: { tasks: 3 },
      modelFallback: false,
      project: { id: "PRJ-1", name: "Project one" },
      risks: [],
      summary: `Scoped result ${token}`,
    },
    ...overrides,
  };
}

function createServiceFixture({
  audit: auditOverride,
  canAccessProject = async () => true,
  getProviderSnapshot = async () => ({ configured: true, model: "company-model", providers: [] }),
  invokeAdapter,
} = {}) {
  const audits = [];
  const records = new Map();
  let timestamp = Date.parse("2026-08-14T00:00:00.000Z");
  const now = () => new Date(timestamp += 1_000).toISOString();
  const repository = {
    create: async (record) => {
      records.set(record.id, { ...record });
      return records.get(record.id);
    },
    update: async (id, patch) => {
      const updated = { ...records.get(id), ...patch };
      records.set(id, updated);
      return updated;
    },
  };
  const service = createAiCapabilityService({
    adapter: {
      invoke: invokeAdapter || (async ({ beginExecution }) => snapshotResult(await beginExecution())),
    },
    audit: auditOverride || (async (...args) => audits.push(args)),
    canAccessProject,
    controlStore: { get: async () => ({ enabled: true }) },
    findProject: async (id) => (id === "PRJ-1" ? { id } : null),
    getAssistantSnapshot: async () => ({ available: true, name: "Delivery assistant", resolvedModel: "company-model" }),
    getProviderSnapshot,
    hasPermission: () => true,
    json: JSON.stringify,
    now,
    parse: (value, fallback) => {
      try { return JSON.parse(value); } catch { return fallback; }
    },
    registry: createCapabilityRegistry(),
    repository,
    tokenService: createScopedExecutionTokenService({ secret: "service-test-secret-at-least-16" }),
  });
  return { audits, records, service };
}

test("AI capability invocation persists durable evidence and excludes the scoped token", async () => {
  let receivedToken = "";
  const { audits, records, service } = createServiceFixture({
    invokeAdapter: async ({ beginExecution }) => {
      receivedToken = await beginExecution();
      return snapshotResult(receivedToken, {
        execution: {
          claims: { tokenId: "safe-token-id" },
          nested: { observed: receivedToken },
          token: receivedToken,
        },
        events: [{ detail: { observed: receivedToken }, type: "harness.capability.completed" }],
        result: {
          evidence: ["Project PRJ-1 is scoped to this invocation."],
          generatedBy: "harness",
          metrics: { tasks: 3 },
          modelFallback: false,
          project: { id: "PRJ-1", name: "Project one" },
          risks: [],
          summary: `The model must not expose ${receivedToken}`,
        },
      });
    },
  });

  const invocation = await service.invoke({
    actor: { id: "USR-1", permissions: ["ai:*"] },
    capabilityId: "project-snapshot",
    input: { projectId: "PRJ-1" },
    ip: "127.0.0.1",
  });

  const record = records.get(invocation.invocationId);
  assert.equal(invocation.status, "completed");
  assert.equal(record.status, "completed");
  assert.equal(invocation.result.generatedBy, "harness");
  assert.match(invocation.result.summary, /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(record), new RegExp(receivedToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual(audits.map((entry) => entry[1]), [
    "ai.capability_invocation_started",
    "ai.capability_invocation_completed",
  ]);
  assert.deepEqual(audits[0][7], { scopeType: "project", projectId: "PRJ-1" });
  assert.equal(JSON.parse(record.execution_snapshot).token, undefined);
  assert.equal(JSON.parse(record.execution_snapshot).claims.tokenId, "safe-token-id");
});

test("AI capability invocation remains completed when its completion audit fails", async () => {
  const audits = [];
  let auditCalls = 0;
  const { records, service } = createServiceFixture({
    audit: async (...args) => {
      audits.push(args);
      auditCalls += 1;
      if (auditCalls === 2) {
        const error = new Error("audit service unavailable");
        error.code = "AUDIT_UNAVAILABLE";
        throw error;
      }
    },
  });

  const invocation = await service.invoke({
    actor: { id: "USR-1", permissions: ["ai:*"] },
    capabilityId: "project-snapshot",
    input: { projectId: "PRJ-1" },
    ip: "127.0.0.1",
  });

  const record = records.get(invocation.invocationId);
  assert.equal(invocation.status, "completed");
  assert.equal(record.status, "completed");
  assert.deepEqual(audits.map((entry) => entry[1]), [
    "ai.capability_invocation_started",
    "ai.capability_invocation_completed",
  ]);
  assert.equal(JSON.parse(record.harness_events).at(-1).type, "audit.completion_failed");
});

test("AI capability invocation does not publish provider connection details", async () => {
  const { service } = createServiceFixture({
    getProviderSnapshot: async () => ({
      apiKeyMasked: "sk...tail",
      baseUrl: "https://provider.internal.example/v1",
      configured: true,
      enabled: true,
      model: "company-model",
      providers: [{ id: "provider-a", url: "https://provider.internal.example/v1" }],
      wireApi: "chat_completions",
    }),
  });

  const invocation = await service.invoke({
    actor: { id: "USR-1", permissions: ["ai:*"] },
    capabilityId: "project-snapshot",
    input: { projectId: "PRJ-1" },
    ip: "127.0.0.1",
  });

  assert.equal(invocation.provider.configured, true);
  assert.equal(invocation.provider.model, "company-model");
  assert.equal(Object.hasOwn(invocation.provider, "apiKeyMasked"), false);
  assert.equal(Object.hasOwn(invocation.provider, "baseUrl"), false);
  assert.equal(Object.hasOwn(invocation.provider, "providers"), false);
});

test("AI capability invocation rejects an adapter that never enters the scoped execution path", async () => {
  const { audits, records, service } = createServiceFixture({
    invokeAdapter: async () => snapshotResult("not-issued"),
  });

  await assert.rejects(
    () => service.invoke({
      actor: { id: "USR-1", permissions: ["ai:*"] },
      capabilityId: "project-snapshot",
      input: { projectId: "PRJ-1" },
      ip: "127.0.0.1",
    }),
    { code: "AI_CAPABILITY_EXECUTION_NOT_STARTED", status: 500 },
  );

  const [record] = records.values();
  assert.equal(record.status, "failed");
  assert.deepEqual(audits.map((entry) => entry[1]), ["ai.capability_invocation_failed"]);
});

test("AI capability invocation records an out-of-scope denial without calling the adapter", async () => {
  let adapterCalled = false;
  const { audits, records, service } = createServiceFixture({
    canAccessProject: async () => false,
    invokeAdapter: async () => {
      adapterCalled = true;
      throw new Error("adapter must not execute outside project scope");
    },
  });

  await assert.rejects(
    () => service.invoke({
      actor: { id: "USR-1", permissions: ["ai:*"] },
      capabilityId: "project-snapshot",
      input: { projectId: "PRJ-1" },
      ip: "127.0.0.1",
    }),
    { code: "PERMISSION_DENIED", status: 403 },
  );

  const [record] = records.values();
  assert.equal(adapterCalled, false);
  assert.equal(record.status, "denied");
  assert.equal(record.error_code, "PERMISSION_DENIED");
  assert.equal(JSON.parse(record.policy_snapshot).decision, "deny");
  assert.deepEqual(audits.map((entry) => entry[1]), ["ai.capability_invocation_denied"]);
  assert.deepEqual(audits[0][7], { scopeType: "project", projectId: "PRJ-1" });
});
