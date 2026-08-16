const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CAPABILITY_RISKS,
  COMPANY_CAPABILITY_MANIFESTS,
  PROJECT_SNAPSHOT_MANIFEST,
  createCapabilityRegistry,
  publicManifest,
  validateCapabilityManifest,
} = require("../src/modules/ai/capabilityRegistry");
const { EXECUTION_CAPABILITIES } = require("../src/modules/ai/executionCapabilities");

test("company capability registry exposes only validated static manifests", () => {
  const registry = createCapabilityRegistry();
  const manifest = registry.get("project-snapshot");
  assert.equal(manifest.id, "project-snapshot");
  assert.equal(manifest.runtime.toolName, "project_snapshot");
  assert.deepEqual(registry.normalizeInvocationInput("project-snapshot", { projectId: " PRJ-1 " }), { projectId: "PRJ-1" });
  assert.throws(
    () => registry.normalizeInvocationInput("project-snapshot", { projectId: "PRJ-1", model: "untrusted" }),
    { code: "VALIDATION_FAILED" },
  );
  assert.throws(
    () => registry.normalizeInvocationInput("not-a-capability", { projectId: "PRJ-1" }),
    { code: "RESOURCE_NOT_FOUND" },
  );
});

test("the default registry carries a manifest for every invocable execution capability", () => {
  const registry = createCapabilityRegistry();
  // ui-control (projectScoped: false) is gateway-only: it is driven by the
  // dsh ui_control tool and has no invocation-surface manifest — the REST
  // invocation input is string-typed while a UI directive is an object.
  // platform-assistant is the ordinary chat's multi-tool session. It is
  // deliberately not exposed through the manual capability-invocation API.
  // browser-control is also projectScoped:false at the gateway but DOES carry
  // a manifest: its control-plane invocation carries a project for audit and
  // screenshot storage, and the action payload is plain strings.
  const gatewayOnlyCapabilities = new Set(["platform-assistant", "ui-control"]);
  const invocableCapabilities = EXECUTION_CAPABILITIES.filter((capability) => !gatewayOnlyCapabilities.has(capability.id));
  const expectedIds = invocableCapabilities.map((capability) => capability.id).sort();
  assert.deepEqual(
    registry.list().map((manifest) => manifest.id).sort(),
    expectedIds,
  );
  assert.deepEqual(
    COMPANY_CAPABILITY_MANIFESTS.map((manifest) => manifest.id).sort(),
    expectedIds,
  );
  assert.equal(
    invocableCapabilities.length + gatewayOnlyCapabilities.size,
    EXECUTION_CAPABILITIES.length,
    "only gateway-only capabilities are exempt from the manifest invariant",
  );
  for (const manifest of registry.list()) {
    assert.equal(manifest.status, "approved");
    assert.equal(typeof manifest.description, "string", `${manifest.id} must carry a Chinese one-line description`);
    assert.match(manifest.runtime.toolName, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(manifest.runtime.kind, "company_harness_tool");
    assert.equal(manifest.requiresConfirmation, false);
  }
});

test("domain manifests derive their required permissions from the execution registry", () => {
  const registry = createCapabilityRegistry();
  const byId = new Map(EXECUTION_CAPABILITIES.map((capability) => [capability.id, capability]));
  for (const manifest of registry.list()) {
    if (manifest.id === "project-snapshot") continue; // frozen invocation gate: ai:*
    assert.deepEqual(manifest.requiredPermissions, [byId.get(manifest.id).permission], `${manifest.id} must mirror executionCapabilities`);
  }
  // defects-list moved to the project namespace so PM (project:* + ai:*) can read defects.
  assert.deepEqual(registry.get("defects-list").requiredPermissions, ["project:read"]);
  assert.deepEqual(registry.get("requirement-create").requiredPermissions, ["requirement:*"]);
});

test("write capabilities declare the project_write risk while unknown risks stay rejected", () => {
  assert.equal(CAPABILITY_RISKS.has("read_only"), true);
  assert.equal(CAPABILITY_RISKS.has("project_write"), true);
  // external_action: browser-control drives side effects outside the project
  // realm (headless browser), audited by the gateway before every action.
  assert.equal(CAPABILITY_RISKS.has("external_action"), true);
  const registry = createCapabilityRegistry();
  assert.deepEqual(
    registry.list().filter((manifest) => manifest.risk === "project_write").map((manifest) => manifest.id),
    ["requirement-create", "task-create", "reminder-create"],
  );
  assert.deepEqual(
    registry.list().filter((manifest) => manifest.risk === "external_action").map((manifest) => manifest.id),
    ["browser-control"],
  );
  const browserManifest = registry.get("browser-control");
  assert.equal(browserManifest.runtime.toolName, "browser_control");
  assert.deepEqual(Object.keys(browserManifest.inputSchema.properties).sort(), [
    "action",
    "key",
    "projectId",
    "selector",
    "text",
    "url",
    "waitMs",
  ]);
  assert.throws(
    () => validateCapabilityManifest({
      ...PROJECT_SNAPSHOT_MANIFEST,
      risk: "write",
    }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
  // Even project_write capabilities never delegate interactive confirmation.
  assert.throws(
    () => validateCapabilityManifest({
      ...registry.get("requirement-create"),
      requiresConfirmation: true,
    }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
  assert.throws(
    () => validateCapabilityManifest({
      ...registry.get("requirement-create"),
      runtime: { kind: "npm_plugin", toolName: "requirement_create" },
    }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
});

test("manifest descriptions are optional strings with a bounded length", () => {
  const { description: _omitted, ...withoutDescription } = PROJECT_SNAPSHOT_MANIFEST;
  assert.equal(validateCapabilityManifest(withoutDescription).description, undefined);
  assert.throws(
    () => validateCapabilityManifest({ ...PROJECT_SNAPSHOT_MANIFEST, description: 42 }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
  assert.throws(
    () => validateCapabilityManifest({ ...PROJECT_SNAPSHOT_MANIFEST, description: "x".repeat(201) }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
  assert.equal(publicManifest(COMPANY_CAPABILITY_MANIFESTS[0]).description, COMPANY_CAPABILITY_MANIFESTS[0].description);
  assert.equal(Object.hasOwn(publicManifest(validateCapabilityManifest(withoutDescription)), "description"), false);
});

test("the registry rejects duplicate capability ids", () => {
  assert.throws(
    () => createCapabilityRegistry([PROJECT_SNAPSHOT_MANIFEST, PROJECT_SNAPSHOT_MANIFEST]),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
});

test("domain capability inputs normalize like the gateway expects", () => {
  const registry = createCapabilityRegistry();
  assert.deepEqual(
    registry.normalizeInvocationInput("requirement-create", { projectId: "PRJ-1", title: " New requirement ", description: "detail" }),
    { projectId: "PRJ-1", title: "New requirement", description: "detail" },
  );
  assert.throws(
    () => registry.normalizeInvocationInput("requirement-create", { projectId: "PRJ-1" }),
    { code: "VALIDATION_FAILED" },
  );
  assert.deepEqual(
    registry.normalizeInvocationInput("requirement-get", { projectId: " PRJ-1 ", requirementId: " REQ-1 " }),
    { projectId: "PRJ-1", requirementId: "REQ-1" },
  );
});

test("company capability results reject fields outside the declared output contract", () => {
  const registry = createCapabilityRegistry();
  const validResult = {
    evidence: ["Project PRJ-1 is scoped to this invocation."],
    generatedBy: "platform_snapshot",
    metrics: { tasks: 3 },
    modelFallback: true,
    project: { id: "PRJ-1", name: "Project one" },
    risks: [],
    summary: "Project one is active.",
  };

  assert.deepEqual(registry.validateInvocationOutput("project-snapshot", validResult), validResult);
  assert.throws(
    () => registry.validateInvocationOutput("project-snapshot", { ...validResult, providerTrace: "unapproved" }),
    { code: "AI_CAPABILITY_OUTPUT_INVALID", status: 502 },
  );
});
