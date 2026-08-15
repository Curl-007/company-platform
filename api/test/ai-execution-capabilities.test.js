const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EXECUTION_CAPABILITIES,
  EXECUTION_CAPABILITY_MODES,
  findExecutionCapability,
} = require("../src/modules/ai/executionCapabilities");
const { normalizeExecution } = require("../src/modules/ai/harnessRuntime");

const VALID_EXECUTION = {
  capabilityId: "project-snapshot",
  capabilityVersion: "1.0.0",
  gatewayBaseUrl: "http://127.0.0.1:43210",
  projectId: "PRJ-1",
  token: "company-scoped-execution-token",
};

test("execution capability registry declares the domain toolset with platform permissions", () => {
  assert.deepEqual(
    EXECUTION_CAPABILITIES.map(({ id, version, permission, mode }) => ({ id, version, permission, mode })),
    [
      { id: "project-snapshot", version: "1.0.0", permission: "project:read", mode: "read" },
      { id: "requirements-list", version: "1.0.0", permission: "requirement:read", mode: "read" },
      { id: "requirement-get", version: "1.0.0", permission: "requirement:read", mode: "read" },
      { id: "tasks-list", version: "1.0.0", permission: "project:read", mode: "read" },
      // defect:read -> project:read: PM (project:* + ai:*) gains defect reads;
      // no reachable grant is lost (qa holds defect:* but no ai:* baseline).
      { id: "defects-list", version: "1.0.0", permission: "project:read", mode: "read" },
      { id: "requirement-create", version: "1.0.0", permission: "requirement:*", mode: "write" },
      { id: "task-create", version: "1.0.0", permission: "project:*", mode: "write" },
      { id: "reminders-list", version: "1.0.0", permission: "project:read", mode: "read" },
      { id: "reminder-create", version: "1.0.0", permission: "project:read", mode: "write" },
      // ui-control pushes whitelisted UI directives to the invoking user's own
      // clients: user-visible write semantics, but no project data involved.
      { id: "ui-control", version: "1.0.0", permission: "ai:*", mode: "write" },
      // browser-control drives the headless browser: write side effects
      // outside the project realm, audited before every action.
      { id: "browser-control", version: "1.0.0", permission: "ai:*", mode: "write" },
    ],
  );
  for (const capability of EXECUTION_CAPABILITIES) {
    assert.ok(EXECUTION_CAPABILITY_MODES.has(capability.mode));
  }
});

test("findExecutionCapability requires an exact id and version match", () => {
  assert.equal(findExecutionCapability("project-snapshot", "1.0.0")?.mode, "read");
  assert.equal(findExecutionCapability("requirement-create", "1.0.0")?.mode, "write");
  assert.equal(findExecutionCapability("requirement-create", "1.0.0")?.permission, "requirement:*");
  // Unknown ids, unknown versions, and partial lookups never resolve.
  assert.equal(findExecutionCapability("requirements-export", "1.0.0"), null);
  assert.equal(findExecutionCapability("requirements-list", "1.0.1"), null);
  assert.equal(findExecutionCapability("requirements-list", ""), null);
  assert.equal(findExecutionCapability("", "1.0.0"), null);
  assert.equal(findExecutionCapability(null, undefined), null);
});

test("normalizeExecution accepts every registered execution capability", () => {
  for (const capability of EXECUTION_CAPABILITIES) {
    const normalized = normalizeExecution({ ...VALID_EXECUTION, capabilityId: capability.id });
    assert.equal(normalized.capabilityId, capability.id);
    assert.equal(normalized.capabilityVersion, "1.0.0");
    assert.equal(normalized.projectId, "PRJ-1");
    assert.equal(normalized.token, "company-scoped-execution-token");
  }
});

test("normalizeExecution rejects unregistered capabilities and version drift", () => {
  assert.throws(
    () => normalizeExecution({ ...VALID_EXECUTION, capabilityId: "requirements-export" }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );
  assert.throws(
    () => normalizeExecution({ ...VALID_EXECUTION, capabilityVersion: "1.0.1" }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );
  assert.throws(
    () => normalizeExecution({ ...VALID_EXECUTION, capabilityVersion: "latest" }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );
  assert.throws(
    () => normalizeExecution({ ...VALID_EXECUTION, capabilityId: "Project-Snapshot" }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );
});

test("normalizeExecution keeps the shape, loopback, and length constraints", () => {
  assert.equal(normalizeExecution(undefined), null);
  assert.equal(normalizeExecution(null), null);
  assert.throws(() => normalizeExecution("project-snapshot"), { code: "AI_HARNESS_EXECUTION_INVALID" });
  assert.throws(() => normalizeExecution([]), { code: "AI_HARNESS_EXECUTION_INVALID" });
  assert.throws(
    () => normalizeExecution({ ...VALID_EXECUTION, token: "" }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );
  assert.throws(
    () => normalizeExecution({ ...VALID_EXECUTION, projectId: "P".repeat(2049) }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );
  // The gateway must stay an unauthenticated IPv4 loopback endpoint.
  for (const gatewayBaseUrl of [
    "https://127.0.0.1:43210",
    "http://localhost:43210",
    "http://user:pass@127.0.0.1:43210",
    "http://10.0.0.5:43210",
    "not-a-url",
  ]) {
    assert.throws(
      () => normalizeExecution({ ...VALID_EXECUTION, gatewayBaseUrl }),
      { code: "AI_HARNESS_EXECUTION_INVALID" },
      gatewayBaseUrl,
    );
  }
});
