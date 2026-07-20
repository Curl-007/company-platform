const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDecisionCreate, buildRiskCreate, buildRiskUpdate } = require("../src/modules/governance/service");

test("governance service builds risk and decision defaults without altering supplied values", () => {
  const now = () => "2026-07-13T10:00:00.000Z";
  const risk = buildRiskCreate({ title: "  Deployment risk ", severity: "high" }, { id: "RSK-001", projectId: "PRJ-001", now });
  assert.equal(risk.title, "Deployment risk");
  assert.equal(risk.status, "open");
  assert.equal(risk.owner_id, null);

  const closed = buildRiskUpdate(risk, { status: "closed", mitigationPlan: "Roll back safely" }, { now });
  assert.equal(closed.closedAt, "2026-07-13T10:00:00.000Z");
  assert.equal(closed.mitigationPlan, "Roll back safely");
  assert.equal(closed.severity, "high");

  const decision = buildDecisionCreate({ title: "  Release decision ", status: "approved" }, { id: "DEC-001", projectId: "PRJ-001", actor: { id: "USR-001", name: "Owner" }, now });
  assert.equal(decision.title, "Release decision");
  assert.equal(decision.owner_id, "USR-001");
  assert.equal(decision.decided_at, "2026-07-13T10:00:00.000Z");
});
