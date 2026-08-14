const assert = require("node:assert/strict");
const test = require("node:test");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");

test("scoped execution tokens bind actor, capability, project, and expiry", () => {
  let clock = 1_800_000_000_000;
  const tokens = createScopedExecutionTokenService({
    now: () => clock,
    secret: "capability-token-test-secret-at-least-16",
    ttlMs: 1000,
  });
  const issued = tokens.issue({
    actorId: "USR-1",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-1",
    projectId: "PRJ-1",
  });
  const claims = tokens.verify(issued.token, { capabilityId: "project-snapshot", projectId: "PRJ-1" });
  assert.equal(claims.actorId, "USR-1");
  assert.equal(tokens.publicClaims(claims).token, undefined);
  assert.throws(() => tokens.verify(issued.token, { projectId: "PRJ-2" }), { code: "AI_CAPABILITY_TOKEN_SCOPE_MISMATCH" });
  assert.throws(() => tokens.verify(`${issued.token}x`), { code: "AI_CAPABILITY_TOKEN_INVALID" });
  clock += 1000;
  assert.throws(() => tokens.verify(issued.token), { code: "AI_CAPABILITY_TOKEN_EXPIRED" });
});
