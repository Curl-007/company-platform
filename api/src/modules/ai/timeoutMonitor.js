function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isTimedOutAiJob(job, { referenceNow = new Date(), timeoutMs }) {
  if (!job || job.status !== "running") return false;
  const timeout = normalizePositiveNumber(timeoutMs, 0);
  if (!timeout) return false;
  const startedAt = toDate(job.started_at || job.created_at);
  const reference = toDate(referenceNow);
  if (!startedAt || !reference) return false;
  return reference.getTime() - startedAt.getTime() >= timeout;
}

function buildTimedOutAiJobPatch({ now }) {
  return {
    progress: 0,
    current_step: "分析超时",
    error_message: "AI job exceeded the configured worker timeout and was marked failed by the worker monitor.",
    failed_at: now(),
  };
}

function failTimedOutAiJobs({
  repository,
  audit,
  now,
  timeoutMs,
  referenceNow = new Date(),
  actor = { id: "system", name: "AI Worker Monitor" },
  ip = null,
  logger = console,
}) {
  const timeout = normalizePositiveNumber(timeoutMs, 0);
  if (!timeout || !repository?.listTimedOutRunningJobs || !repository?.transition) return 0;
  const reference = toDate(referenceNow) || new Date();
  const cutoffIso = new Date(reference.getTime() - timeout).toISOString();
  const jobs = repository.listTimedOutRunningJobs(cutoffIso);
  let failed = 0;
  for (const job of jobs) {
    if (!isTimedOutAiJob(job, { referenceNow: reference, timeoutMs: timeout })) continue;
    try {
      const patch = buildTimedOutAiJobPatch({ now });
      const after = repository.transition(job, "failed", patch);
      audit?.(actor, "ai.job_timeout", "ai_job", job.job_id, job, {
        status: after.status,
        timeoutMs: timeout,
        cutoffIso,
        failedAt: after.failed_at,
        errorMessage: after.error_message,
      }, ip);
      failed += 1;
    } catch (error) {
      logger?.warn?.(`Unable to fail timed-out AI job ${job.job_id}: ${error.message}`);
    }
  }
  return failed;
}

function startAiJobTimeoutMonitor({
  repository,
  audit,
  now,
  timeoutMs,
  sweepMs = 60_000,
  schedule = setInterval,
  ...rest
}) {
  const timeout = normalizePositiveNumber(timeoutMs, 0);
  if (!timeout) return null;
  const interval = normalizePositiveNumber(sweepMs, 60_000);
  const timer = schedule(() => {
    failTimedOutAiJobs({ repository, audit, now, timeoutMs: timeout, ...rest });
  }, interval);
  timer?.unref?.();
  return timer;
}

module.exports = {
  buildTimedOutAiJobPatch,
  failTimedOutAiJobs,
  isTimedOutAiJob,
  startAiJobTimeoutMonitor,
};
