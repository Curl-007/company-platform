const assert = require("node:assert/strict");
const test = require("node:test");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createExecutionGateway } = require("../src/modules/ai/executionGateway");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");

function createFixture({ active = true, assistantEnabled = true } = {}) {
  const calls = [];
  const audits = [];
  const tokenService = createScopedExecutionTokenService({ secret: "platform-operation-gateway-test-secret-16" });
  const invocation = {
    actor_id: "USR-1",
    project_id: "PRJ-1",
    status: active ? "running" : "completed",
  };
  const gateway = createExecutionGateway({
    audit: async (_actor, action, resourceType, resourceId, _before, detail) => {
      audits.push({ action, detail, resourceId, resourceType });
    },
    canAccessProject: async () => true,
    controlStore: { get: async () => ({ enabled: true }) },
    findInvocation: async () => invocation,
    hasPermission: (user, permission) => user.permissions.includes(permission),
    insert: async () => {},
    isPlatformAssistantEnabled: async () => assistantEnabled,
    json: JSON.stringify,
    nextId: async () => "NEXT-1",
    now: () => "2026-08-16T00:00:00.000Z",
    platformOperationProxy: {
      execute: async (input) => {
        calls.push(input);
        return { data: { ok: true, action: input.operation.action }, meta: null, status: 200 };
      },
    },
    publicUser: (user) => ({ ...user, permissions: user.permissions }),
    registry: createCapabilityRegistry(),
    row: async () => ({ id: "USR-1", name: "Alice", role: "pm", status: "active", permissions: ["ai:*"] }),
    rows: async () => [],
    tokenService,
  });
  const token = tokenService.issue({
    actorId: "USR-1",
    capabilityId: "platform-assistant",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-1",
    projectId: "PRJ-1",
    reusable: true,
  }).token;
  return { audits, calls, gateway, invocation, token };
}

test("platform assistant session token can execute multiple registered reads", async () => {
  const { calls, gateway, token } = createFixture();
  try {
    const projects = await gateway.executePlatformOperation({ input: { operation: "get_projects", request: {} }, token });
    const tasks = await gateway.executePlatformOperation({ input: { operation: "get_tasks", request: { query: { projectId: "PRJ-1" } } }, token });

    assert.equal(projects.result.data.action, "get_projects");
    assert.equal(tasks.result.data.action, "get_tasks");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].operation.path, "/api/projects");
    assert.equal(calls[1].request.query.projectId, "PRJ-1");
  } finally {
    await gateway.close();
  }
});

test("platform assistant rejects inactive sessions and audits writes before proxying", async () => {
  const inactive = createFixture({ active: false });
  try {
    await assert.rejects(
      () => inactive.gateway.executePlatformOperation({ input: { operation: "get_projects", request: {} }, token: inactive.token }),
      { code: "AI_CAPABILITY_INVOCATION_INACTIVE", status: 403 },
    );
    assert.equal(inactive.calls.length, 0);
  } finally {
    await inactive.gateway.close();
  }

  const active = createFixture();
  try {
    await active.gateway.executePlatformOperation({
      input: { operation: "post_projects", request: { body: { name: "AI project" } } },
      token: active.token,
    });
    assert.equal(active.calls.length, 1);
    assert.equal(active.audits[0].action, "ai.platform_operation_requested");
    assert.equal(active.audits[0].detail.action, "post_projects");
    active.gateway.revokeInvocation("AIC-1");
    await assert.rejects(
      () => active.gateway.executePlatformOperation({ input: { operation: "get_projects", request: {} }, token: active.token }),
      { code: "AI_CAPABILITY_INVOCATION_INACTIVE", status: 403 },
    );
  } finally {
    await active.gateway.close();
  }
});

test("platform operations verify the scoped token before resolving the operation", async () => {
  const fixture = createFixture();
  try {
    // An invalid token must fail as 401 regardless of whether the operation
    // exists: the catalog is not enumerable without authentication.
    await assert.rejects(
      () => fixture.gateway.executePlatformOperation({ input: { operation: "get_projects" }, token: "not-a-token" }),
      { code: "AI_CAPABILITY_TOKEN_INVALID", status: 401 },
    );
    await assert.rejects(
      () => fixture.gateway.executePlatformOperation({ input: { operation: "definitely_not_registered" }, token: "" }),
      { code: "AI_CAPABILITY_TOKEN_INVALID", status: 401 },
    );
    // With a valid token, an unknown operation is the 400 it should be.
    await assert.rejects(
      () => fixture.gateway.executePlatformOperation({ input: { operation: "definitely_not_registered" }, token: fixture.token }),
      { code: "AI_PLATFORM_OPERATION_UNKNOWN", status: 400 },
    );
    assert.equal(fixture.calls.length, 0);
  } finally {
    await fixture.gateway.close();
  }
});
