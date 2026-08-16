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

test("only the platform assistant may issue a reusable execution token", () => {
  const tokens = createScopedExecutionTokenService({
    now: () => 1_800_000_000_000,
    secret: "capability-token-test-secret-at-least-16",
  });
  const issued = tokens.issue({
    actorId: "USR-1",
    capabilityId: "platform-assistant",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-PLATFORM-1",
    projectId: "PRJ-1",
    reusable: true,
  });

  const claims = tokens.verify(issued.token, { capabilityId: "platform-assistant" });
  assert.equal(claims.reusable, true);
  assert.equal(tokens.publicClaims(claims).reusable, true);
  assert.throws(
    () => tokens.issue({
      actorId: "USR-1",
      capabilityId: "requirements-list",
      capabilityVersion: "1.0.0",
      invocationId: "AIC-OTHER-1",
      projectId: "PRJ-1",
      reusable: true,
    }),
    { code: "AI_CAPABILITY_TOKEN_INVALID" },
  );
});

test("execution tokens confine invocationId to a path-safe charset", () => {
  const tokens = createScopedExecutionTokenService({
    now: () => 1_800_000_000_000,
    secret: "capability-token-test-secret-at-least-16",
  });
  const base = {
    actorId: "USR-1",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    projectId: "PRJ-1",
  };
  // The invocation id feeds screenshot file paths; traversal shapes are
  // rejected at issue time and at verify time (forged claims need the secret,
  // so this is defense in depth for issuer regressions).
  for (const invocationId of ["../escape", "a/b", "a\\b", "..", "AIC-<script>", " "]) {
    assert.throws(() => tokens.issue({ ...base, invocationId }), { code: "AI_CAPABILITY_TOKEN_INVALID" }, invocationId);
  }
  const issued = tokens.issue({ ...base, invocationId: "AIC-3f0c9d8e.11:22_x" });
  assert.equal(tokens.verify(issued.token).invocationId, "AIC-3f0c9d8e.11:22_x");
});
