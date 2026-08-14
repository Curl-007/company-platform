const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PROJECT_SNAPSHOT_MANIFEST,
  createCapabilityRegistry,
  validateCapabilityManifest,
} = require("../src/modules/ai/capabilityRegistry");

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

test("company capability manifests reject write risk and non-company runtime adapters", () => {
  assert.throws(
    () => validateCapabilityManifest({
      ...PROJECT_SNAPSHOT_MANIFEST,
      risk: "write",
    }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
  );
  assert.throws(
    () => validateCapabilityManifest({
      ...PROJECT_SNAPSHOT_MANIFEST,
      runtime: { kind: "npm_plugin", toolName: "project_snapshot" },
    }),
    { code: "AI_CAPABILITY_MANIFEST_INVALID" },
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
