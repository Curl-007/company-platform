const assert = require("node:assert/strict");
const test = require("node:test");
const { buildProjectCreate, buildProjectUpdate, projectActivationReadiness } = require("../src/modules/projects/service");

test("project service builds creation defaults and preserves absent update fields", () => {
  const created = buildProjectCreate(
    { name: "  Delivery platform ", owner: "  Project Manager  ", objective: "  Reduce delivery lead time  " },
    { id: "PRJ-001", now: "2026-07-13T10:00:00.000Z", json: JSON.stringify },
  );
  assert.equal(created.name, "Delivery platform");
  assert.equal(created.owner, "Project Manager");
  assert.equal(created.objective, "Reduce delivery lead time");
  assert.equal(created.status, "planning");
  assert.equal(created.version, 1);
  assert.deepEqual(JSON.parse(created.milestones), []);

  const updated = buildProjectUpdate(
    { ...created, process_mode: created.process_mode, program_id: null, product_id: null },
    { objective: "缩短客户开通时长", description: "明确交付范围", milestones: [{ name: "上线", status: "planned", date: "2026-08-01" }] },
    { expectedVersion: 1, now: "2026-07-14T10:00:00.000Z" },
  );
  assert.equal(updated.name, "Delivery platform");
  assert.equal(updated.description, "明确交付范围");
  assert.equal(updated.objective, "缩短客户开通时长");
  assert.equal(updated.expectedVersion, 1);
  assert.deepEqual(JSON.parse(updated.milestones), [{ name: "上线", status: "planned", date: "2026-08-01" }]);
});

test("project activation readiness requires allocated, approved, capacity-backed staffing", async () => {
  const project = {
    id: "PRJ-001",
    objective: "Deliver the approved scope",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    milestones: JSON.stringify([{ name: "Production release", date: "2026-08-30" }]),
  };
  const parse = (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const evidence = (allocations) => ({
    memberCount: 2,
    sprintCount: 0,
    unownedHighRiskCount: 0,
    allocations,
  });
  const readiness = async (allocations) => projectActivationReadiness(project, { activationEvidence: async () => evidence(allocations) }, parse);

  assert.equal((await readiness([{ approval_status: "approved", capacity_plan_id: "CAP-001" }])).ok, true);
  assert.deepEqual((await readiness([])).missing, ["capacityAllocations"]);
  assert.ok((await readiness([{ approval_status: "pending", capacity_plan_id: "CAP-001" }])).missing.includes("capacityApprovals"));
  assert.ok((await readiness([{ approval_status: "approved", capacity_plan_id: null }])).missing.includes("capacityPlans"));
});
