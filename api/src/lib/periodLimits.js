const MAX_CAPACITY_PERIOD_DAYS = 366;

function isoDateOnly(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

/**
 * Inclusive day count between ISO dates (UTC).
 * @param {string} start
 * @param {string} end
 */
function inclusiveDaySpan(start, end) {
  const a = new Date(`${start}T00:00:00.000Z`).getTime();
  const b = new Date(`${end}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * @param {{ periodStart?: string, periodEnd?: string }} period
 * @param {{ maxDays?: number }} [options]
 * @returns {{ ok: true, period: { periodStart: string, periodEnd: string } } | { ok: false, code: string, message: string }}
 */
function assertPeriodWithinLimit(period, options = {}) {
  const maxDays = options.maxDays || MAX_CAPACITY_PERIOD_DAYS;
  const periodStart = isoDateOnly(period?.periodStart);
  const periodEnd = isoDateOnly(period?.periodEnd);
  if (!periodStart || !periodEnd) {
    return { ok: false, code: "VALIDATION_FAILED", message: "periodStart and periodEnd must be valid ISO dates (YYYY-MM-DD)." };
  }
  if (periodEnd < periodStart) {
    return { ok: false, code: "VALIDATION_FAILED", message: "periodEnd must not be before periodStart." };
  }
  const span = inclusiveDaySpan(periodStart, periodEnd);
  if (span == null || span > maxDays) {
    return {
      ok: false,
      code: "PERIOD_TOO_LARGE",
      message: `Date range must be at most ${maxDays} days (got ${span ?? "invalid"}).`,
    };
  }
  return { ok: true, period: { periodStart, periodEnd } };
}

module.exports = {
  MAX_CAPACITY_PERIOD_DAYS,
  assertPeriodWithinLimit,
  inclusiveDaySpan,
  isoDateOnly,
};
