const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiAssistantExecutionService } = require("../src/modules/ai/assistantExecutionService");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");

function createFixture({ assistantAvailable = true, projectId = "PRJ-1" } = {}) {
  const records = new Map();
  const audits = [];
  const tokenService = createScopedExecutionTokenService({
    now: () => 1_800_000_000_000,
    secret: "assistant-execution-test-secret-at-least-16",
  });
  const service = createAiAssistantExecutionService({
    audit: async (_actor, action, _type, id) => { audits.push({ action, id }); },
    canAccessProject: async () => true,
    executionGateway: { start: async () => "http://127.0.0.1:43123" },
    findActiveActor: async (id) => ({ id, name: "Alice", role: "pm", status: "active", permissions: ["ai:*"] }),
    getAssistant: async () => ({
      available: assistantAvailable,
      enabled: assistantAvailable,
      name: "Platform Assistant",
      resolvedModel: "test-model",
      resolvedProviderId: "AIP-1",
    }),
    hasPermission: (user, permission) => user.permissions.includes(permission),
    json: JSON.stringify,
    now: () => "2026-08-16T00:00:00.000Z",
    publicUser: (user) => user,
    repository: {
      create: async (record) => {
        records.set(record.id, { ...record });
        return records.get(record.id);
      },
      update: async (id, patch) => {
        const next = { ...records.get(id), ...patch };
        records.set(id, next);
        return next;
      },
    },
    selectProjectAnchor: async () => projectId,
    tokenService,
  });
  return { audits, records, service, tokenService };
}

test("assistant execution creates a reusable platform session and closes it after the chat turn", async () => {
  const { audits, records, service, tokenService } = createFixture();
  const session = await service.create({
    accessScope: { projectIds: ["PRJ-1"] },
    actor: { id: "USR-1", permissions: ["ai:*"] },
    currentPage: "projects",
    scope: "project-management",
  });

  assert.ok(session);
  assert.equal(records.get(session.invocationId).status, "accepted");
  const token = await session.execution.issueToken();
  const claims = tokenService.verify(token, { capabilityId: "platform-assistant", projectId: "PRJ-1" });
  assert.equal(claims.reusable, true);
  assert.equal(records.get(session.invocationId).status, "running");

  await session.finish({ modelUsed: true });
  assert.equal(records.get(session.invocationId).status, "completed");
  assert.deepEqual(audits.map((item) => item.action), [
    "ai.assistant_tool_session_started",
    "ai.assistant_tool_session_completed",
  ]);
  await assert.rejects(
    () => session.execution.issueToken(),
    { code: "AI_CAPABILITY_INVOCATION_INACTIVE", status: 403 },
  );
});

test("assistant execution stays absent when no real accessible project can anchor it", async () => {
  const { records, service } = createFixture({ projectId: "" });
  const session = await service.create({
    accessScope: { projectIds: [] },
    actor: { id: "USR-1", permissions: ["ai:*"] },
  });

  assert.equal(session, null);
  assert.equal(records.size, 0);
});
