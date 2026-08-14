const assert = require("node:assert/strict");
const test = require("node:test");
const { createHarnessCapabilityAdapter } = require("../src/modules/ai/capabilityAdapter");

const manifest = {
  id: "project-snapshot",
  version: "1.0.0",
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
