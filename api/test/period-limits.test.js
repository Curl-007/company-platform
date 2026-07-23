const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_CAPACITY_PERIOD_DAYS,
  assertPeriodWithinLimit,
  inclusiveDaySpan,
} = require("../src/lib/periodLimits");

test("period limits accept week and reject oversized spans", () => {
  const ok = assertPeriodWithinLimit({ periodStart: "2026-07-01", periodEnd: "2026-07-07" });
  assert.equal(ok.ok, true);
  assert.equal(ok.period.periodStart, "2026-07-01");

  assert.equal(inclusiveDaySpan("2026-01-01", "2026-01-01"), 1);
  assert.equal(inclusiveDaySpan("2026-01-01", "2026-12-31"), 365);

  const tooLarge = assertPeriodWithinLimit({
    periodStart: "2025-01-01",
    periodEnd: "2026-12-31",
  });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.code, "PERIOD_TOO_LARGE");

  const boundary = assertPeriodWithinLimit({
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  }, { maxDays: MAX_CAPACITY_PERIOD_DAYS });
  assert.equal(boundary.ok, true);

  const inverted = assertPeriodWithinLimit({ periodStart: "2026-07-10", periodEnd: "2026-07-01" });
  assert.equal(inverted.ok, false);
  assert.equal(inverted.code, "VALIDATION_FAILED");
});
