const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildBuildCreate,
  buildReleaseApproval,
  buildReleaseCreate,
  buildRollbackCreate,
  createDeliveryService,
} = require("../src/modules/delivery/service");
const {
  mapDeliveryAudit,
  mapReleaseApproval,
  mapRollbackRecord,
} = require("../src/modules/delivery/mappers");

test("delivery service builds traceable build, release, approval, and rollback records", () => {
  const now = () => "2026-07-13T10:00:00.000Z";
  const actor = { id: "USR-001", name: "Release Manager" };
  const build = buildBuildCreate({ projectId: "PRJ-001", name: "  Web build ", linkedStories: ["REQ-001"] }, { id: "BLD-001", actor, now, json: JSON.stringify });
  assert.equal(build.name, "Web build");
  assert.equal(build.status, "building");
  assert.deepEqual(JSON.parse(build.linked_stories), ["REQ-001"]);

  const release = buildReleaseCreate({ name: "  v1.0 ", buildId: build.id }, { id: "REL-001", actor, now, json: JSON.stringify });
  assert.equal(release.status, "draft");
  assert.equal(release.creator_id, actor.id);
  assert.equal(release.build_id, build.id);

  const approval = buildReleaseApproval({ decision: "approve", comment: "  Ready  " }, { id: "APR-001", releaseId: release.id, actor, now });
  assert.equal(approval.comment, "Ready");
  assert.equal(approval.approver_id, actor.id);

  const rollback = buildRollbackCreate({ reason: "  Roll back ", impact: "Customers" }, { id: "RBK-001", releaseId: release.id, actor, now });
  assert.equal(rollback.reason, "Roll back");
  assert.equal(rollback.operator_name, actor.name);
});

test("delivery service evaluates release gates and assembles auditable release reports", async () => {
  const build = {
    id: "BLD-001",
    project_id: "PRJ-001",
    name: "Web build",
    version: "1.0.0",
    status: "released",
    linked_stories: JSON.stringify(["REQ-001"]),
    linked_bugs: JSON.stringify(["BUG-001"]),
    notes: "Verified scope",
  };
  const release = {
    id: "REL-001",
    name: "Public release",
    version: "1.0.0",
    status: "staging",
    build_id: build.id,
    linked_stories: JSON.stringify([]),
    linked_bugs: JSON.stringify([]),
    release_notes: "Scope, impact, and rollback plan are documented.",
  };
  const repository = {
    findBuild: (id) => (id === build.id ? build : null),
    hasApprovedRelease: (id) => id === release.id,
    listActiveRequirementsByIds: () => [{ id: "REQ-001", title: "Checkout", status: "accepted" }],
    listApprovals: () => [{ id: "APR-001", release_id: release.id, decision: "approve", approver_name: "PM", created_at: "2026-07-15T09:00:00.000Z" }],
    listBuilds: () => [build],
    listDefectsByIds: () => [{ id: "BUG-001", title: "Fixed defect", status: "closed" }],
    listDefectsByRequirementIds: () => [],
    listDeliveryAudit: () => [{ id: "AUD-001", action: "release.approval_approve", actor_name: "PM", resource_type: "release", resource_id: release.id, created_at: "2026-07-15T09:00:00.000Z" }],
    listReleases: () => [release],
    listRollbacks: () => [],
    listTasksByRequirementIds: () => [{ id: "TASK-001", status: "done", remaining_hours: 0, blocker: "", requirement_id: "REQ-001" }],
    listTestCasesByRequirementIds: () => [{ id: "TC-001", status: "passed", passed_cases: 5, failed_cases: 0, blocked_cases: 0, requirement_id: "REQ-001" }],
  };
  const service = createDeliveryService({
    repository,
    parse: (value, fallback) => {
      try { return JSON.parse(value); } catch { return fallback; }
    },
    mapBuild: (item) => ({ id: item.id, name: item.name, status: item.status }),
    mapDefect: (item) => ({ id: item.id, status: item.status }),
    mapDeliveryAudit: (item) => ({ id: item.id, action: item.action }),
    mapRelease: (item) => ({ id: item.id, name: item.name, version: item.version, status: item.status, releaseNotes: item.release_notes }),
    mapReleaseApproval: (item) => ({ id: item.id, decision: item.decision }),
    mapRequirement: (item) => ({ id: item.id, status: item.status }),
    mapRollbackRecord: (item) => ({ id: item.id }),
  });

  const buildGate = await service.validateBuildStatusTransition(build, "released");
  assert.equal(buildGate.ok, true);

  const releaseGate = await service.evaluateReleaseDeliveryGates(release);
  assert.equal(releaseGate.ready, true);
  assert.equal(releaseGate.score, 100);

  const report = await service.buildReleaseReport(release);
  assert.equal(report.metrics.requirementCount, 1);
  assert.equal(report.metrics.defectCount, 1);
  assert.equal(report.metrics.approvalCount, 1);
  assert.equal(report.metrics.auditCount, 1);
  assert.equal(report.gate.ready, true);
});

test("delivery mappers expose stable public delivery evidence fields", () => {
  assert.deepEqual(mapReleaseApproval({
    id: "APR-001",
    release_id: "REL-001",
    decision: "approve",
    comment: "",
    approver_id: null,
    approver_name: "PM",
    created_at: "2026-07-15T09:00:00.000Z",
  }), {
    id: "APR-001",
    releaseId: "REL-001",
    decision: "approve",
    comment: "",
    approverId: null,
    approverName: "PM",
    createdAt: "2026-07-15T09:00:00.000Z",
  });

  assert.deepEqual(mapRollbackRecord({
    id: "RBK-001",
    release_id: "REL-001",
    reason: "bad build",
    impact: null,
    plan: null,
    operator_id: "USR-001",
    operator_name: "Ops",
    created_at: "2026-07-15T10:00:00.000Z",
  }), {
    id: "RBK-001",
    releaseId: "REL-001",
    reason: "bad build",
    impact: "",
    plan: "",
    operatorId: "USR-001",
    operatorName: "Ops",
    createdAt: "2026-07-15T10:00:00.000Z",
  });

  assert.deepEqual(mapDeliveryAudit({
    id: "AUD-001",
    action: "release.approval_approve",
    actor_name: "PM",
    resource_type: "release",
    resource_id: "REL-001",
    created_at: "2026-07-15T11:00:00.000Z",
  }), {
    id: "AUD-001",
    action: "release.approval_approve",
    actorName: "PM",
    resourceType: "release",
    resourceId: "REL-001",
    createdAt: "2026-07-15T11:00:00.000Z",
  });
});
