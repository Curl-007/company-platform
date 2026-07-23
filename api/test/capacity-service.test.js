const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calendarContext,
  evaluateAllocationConcurrency,
  mapPlan,
  normalizeWorkloadThresholds,
  workloadRisk,
} = require("../src/modules/capacity/service");

test("calendar exceptions and capacity plan calculations produce traceable effective hours", () => {
  const calendar = calendarContext(
    { periodStart: "2026-07-13", periodEnd: "2026-07-19" },
    { working_weekdays: "[1,2,3,4,5]" },
    [
      { calendar_date: "2026-07-15", is_working_day: 0 },
      { calendar_date: "2026-07-18", is_working_day: 1 },
    ],
  );
  assert.equal(calendar.workingDays, 5);
  assert.equal(calendar.isWorkingDate("2026-07-15"), false);
  assert.equal(calendar.isWorkingDate("2026-07-18"), true);

  const plan = mapPlan({
    id: "CAP-001",
    user_id: "USR-DEV",
    period_start: "2026-07-13",
    period_end: "2026-07-19",
    working_days: 5,
    use_calendar: 1,
    daily_hours: 8,
    meeting_hours: 4,
    training_hours: 0,
    support_hours: 0,
    other_commitment_hours: 0,
  }, calendar.workingDays);
  assert.equal(plan.theoreticalHours, 40);
  assert.equal(plan.effectiveHours, 36);
  assert.equal(workloadRisk(plan.effectiveHours, 40).code, "overloaded");
  assert.equal(workloadRisk(plan.effectiveHours, 27).code, "balanced");
  const thresholds = normalizeWorkloadThresholds({ balancedMin: 0.5, attentionMin: 0.75, overloadedAbove: 0.9 });
  assert.deepEqual(thresholds, { balancedMin: 0.5, attentionMin: 0.75, overloadedAbove: 0.9 });
  assert.equal(workloadRisk(plan.effectiveHours, 34, thresholds).code, "overloaded");
  assert.equal(normalizeWorkloadThresholds({ balancedMin: 0.9, attentionMin: 0.7, overloadedAbove: 1.1 }), null);
});

test("allocation concurrency evaluates intersecting working days instead of whole-period totals", () => {
  const calendar = calendarContext(
    { periodStart: "2026-07-13", periodEnd: "2026-07-19" },
    { working_weekdays: "[1,2,3,4,5]" },
    [],
  );
  const result = evaluateAllocationConcurrency({
    period: { periodStart: "2026-07-13", periodEnd: "2026-07-17" },
    projectId: "PRJ-TARGET",
    allocationPercent: 50,
    plannedHours: null,
    effectiveHours: 40,
    existingAllocations: [
      {
        project_id: "PRJ-OTHER",
        period_start: "2026-07-15",
        period_end: "2026-07-19",
        allocation_percent: 60,
        planned_hours: null,
      },
    ],
    isWorkingDate: calendar.isWorkingDate,
  });
  assert.equal(result.needsOverrideApproval, true);
  assert.equal(result.peakAllocationPercent, 110);
  assert.deepEqual(result.overloadedDates, ["2026-07-15", "2026-07-16", "2026-07-17"]);
});

test("same-project overlap replaces its prior slice and weekend-only overlap is not concurrent", () => {
  const calendar = calendarContext(
    { periodStart: "2026-07-13", periodEnd: "2026-07-19" },
    { working_weekdays: "[1,2,3,4,5]" },
    [],
  );
  const result = evaluateAllocationConcurrency({
    period: { periodStart: "2026-07-13", periodEnd: "2026-07-17" },
    projectId: "PRJ-TARGET",
    allocationPercent: 75,
    plannedHours: null,
    effectiveHours: 40,
    existingAllocations: [
      {
        project_id: "PRJ-TARGET",
        period_start: "2026-07-13",
        period_end: "2026-07-31",
        allocation_percent: 120,
        planned_hours: null,
      },
      {
        project_id: "PRJ-WEEKEND",
        period_start: "2026-07-18",
        period_end: "2026-07-19",
        allocation_percent: 100,
        planned_hours: 16,
      },
    ],
    isWorkingDate: calendar.isWorkingDate,
  });
  assert.equal(result.needsOverrideApproval, false);
  assert.equal(result.peakAllocationPercent, 75);
  assert.deepEqual(result.overloadedDates, []);
});

test("configured hours are spread over their own working days before overlap comparison", () => {
  const calendar = calendarContext(
    { periodStart: "2026-07-13", periodEnd: "2026-07-17" },
    { working_weekdays: "[1,2,3,4,5]" },
    [],
  );
  const result = evaluateAllocationConcurrency({
    period: { periodStart: "2026-07-15", periodEnd: "2026-07-17" },
    projectId: "PRJ-TARGET",
    allocationPercent: 20,
    plannedHours: 24,
    effectiveHours: 24,
    existingAllocations: [
      {
        project_id: "PRJ-OTHER",
        period_start: "2026-07-13",
        period_end: "2026-07-15",
        allocation_percent: 20,
        planned_hours: 24,
      },
    ],
    isWorkingDate: calendar.isWorkingDate,
  });
  assert.equal(result.needsOverrideApproval, true);
  assert.equal(result.peakAllocationPercent, 40);
  assert.deepEqual(result.overloadedDates, ["2026-07-15"]);
});
