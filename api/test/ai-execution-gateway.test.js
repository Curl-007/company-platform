const assert = require("node:assert/strict");
const test = require("node:test");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createExecutionGateway } = require("../src/modules/ai/executionGateway");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");

function createFixture({ actorStatus = "active", allowProject = true, enabled = true, hasAiPermission = true } = {}) {
  const registry = createCapabilityRegistry();
  const tokenService = createScopedExecutionTokenService({ secret: "gateway-test-secret-at-least-16" });
  const gateway = createExecutionGateway({
    canAccessProject: async () => allowProject,
    controlStore: { get: async () => ({ enabled }) },
    hasPermission: () => hasAiPermission,
    now: () => "2026-08-14T00:00:00.000Z",
    publicUser: (user) => ({ ...user, permissions: ["ai:*"] }),
    registry,
    row: async (sql, params) => {
      if (sql.includes("FROM users")) return { id: params.id, role: "pm", status: actorStatus };
      if (sql.includes("FROM projects")) {
        return params.projectId === "PRJ-1"
          ? {
            id: "PRJ-1",
            name: "Apollo",
            objective: "Deliver the scoped program.",
            status: "in_progress",
            health_score: 72,
            owner: "USR-1",
            progress: 45,
            start_date: "2026-08-01",
            end_date: "2026-09-01",
            updated_at: "2026-08-14T00:00:00.000Z",
          }
          : null;
      }
      if (sql.includes("COUNT(*)")) return { count: 2 };
      throw new Error(`Unexpected gateway query: ${sql}`);
    },
    rows: async (sql) => (sql.includes("FROM project_risks")
      ? [{ severity: "high", title: "Integration dependency", status: "open", owner_name: "USR-1" }]
      : []),
    tokenService,
  });
  const issue = (overrides = {}) => tokenService.issue({
    actorId: "USR-1",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-1",
    projectId: "PRJ-1",
    ...overrides,
  });
  return { gateway, issue };
}

test("execution gateway binds the compact project snapshot to a one-use scoped token", async () => {
  const { gateway, issue } = createFixture();
  const token = issue().token;
  try {
    const captured = await gateway.execute({ input: { projectId: "PRJ-1" }, token });
    assert.equal(captured.snapshot.project.id, "PRJ-1");
    assert.equal(captured.snapshot.metrics.blockedTasks, 2);
    assert.deepEqual(captured.snapshot.risks, ["[high] Integration dependency"]);
    assert.equal(captured.claims.token, undefined);
    assert.equal(captured.claims.projectId, "PRJ-1");

    await assert.rejects(
      () => gateway.execute({ input: { projectId: "PRJ-1" }, token }),
      { code: "AI_CAPABILITY_TOKEN_REPLAYED", status: 409 },
    );
    await assert.rejects(
      () => gateway.execute({ input: { projectId: "PRJ-2" }, token: issue({ invocationId: "AIC-2" }).token }),
      { code: "AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", status: 403 },
    );
  } finally {
    await gateway.close();
  }
});

test("execution gateway rechecks kill switch, actor state, permission, and project access", async () => {
  const cases = [
    [{ enabled: false }, "AI_CAPABILITY_DISABLED", 503],
    [{ actorStatus: "disabled" }, "AI_CAPABILITY_ACTOR_UNAVAILABLE", 403],
    [{ hasAiPermission: false }, "PERMISSION_DENIED", 403],
    [{ allowProject: false }, "PERMISSION_DENIED", 403],
  ];
  for (const [options, code, status] of cases) {
    const { gateway, issue } = createFixture(options);
    try {
      await assert.rejects(
        () => gateway.execute({ input: { projectId: "PRJ-1" }, token: issue().token }),
        { code, status },
      );
    } finally {
      await gateway.close();
    }
  }
});

test("execution gateway exposes only its loopback project-snapshot HTTP endpoint", async () => {
  const { gateway, issue } = createFixture();
  const token = issue().token;
  const baseUrl = await gateway.start();
  try {
    const response = await fetch(`${baseUrl}/v1/project-snapshot`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.snapshot.project.id, "PRJ-1");
    assert.equal(payload.data.evidence.source, "runtime-tool");
    assert.equal(gateway.getCaptured("AIC-1").snapshot.project.id, "PRJ-1");
    assert.equal(gateway.getCaptured("AIC-1"), null);

    const replay = await fetch(`${baseUrl}/v1/project-snapshot`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error.code, "AI_CAPABILITY_TOKEN_REPLAYED");

    const forbidden = await fetch(`${baseUrl}/v1/anything-else`, { method: "POST" });
    assert.equal(forbidden.status, 404);
    assert.equal((await forbidden.json()).error.code, "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN");
  } finally {
    await gateway.close();
  }
});
