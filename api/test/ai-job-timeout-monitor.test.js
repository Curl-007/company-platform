const assert = require("node:assert/strict");
const test = require("node:test");
const {
  failTimedOutAiJobs,
  isTimedOutAiJob,
} = require("../src/modules/ai/timeoutMonitor");

test("AI job timeout monitor fails stale running jobs and writes audit evidence", async () => {
  const staleJob = {
    job_id: "JOB-STALE",
    status: "running",
    started_at: "2026-07-15T10:00:00.000Z",
    created_at: "2026-07-15T09:59:00.000Z",
  };
  const freshJob = {
    job_id: "JOB-FRESH",
    status: "running",
    started_at: "2026-07-15T10:04:30.000Z",
    created_at: "2026-07-15T10:04:30.000Z",
  };
  const transitions = [];
  const audits = [];
  const repository = {
    listTimedOutRunningJobs(cutoffIso) {
      assert.equal(cutoffIso, "2026-07-15T10:00:00.000Z");
      return [staleJob, freshJob];
    },
    transition(job, to, patch) {
      transitions.push({ jobId: job.job_id, to, patch });
      return { ...job, ...patch, status: to };
    },
  };

  assert.equal(isTimedOutAiJob(staleJob, {
    referenceNow: new Date("2026-07-15T10:05:00.000Z"),
    timeoutMs: 300000,
  }), true);
  assert.equal(isTimedOutAiJob(freshJob, {
    referenceNow: new Date("2026-07-15T10:05:00.000Z"),
    timeoutMs: 300000,
  }), false);

  const count = await failTimedOutAiJobs({
    repository,
    audit: (...args) => audits.push(args),
    now: () => "2026-07-15T10:05:00.000Z",
    timeoutMs: 300000,
    referenceNow: new Date("2026-07-15T10:05:00.000Z"),
    logger: { warn: () => {} },
  });

  assert.equal(count, 1);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].jobId, "JOB-STALE");
  assert.equal(transitions[0].to, "failed");
  assert.equal(transitions[0].patch.current_step, "分析超时");
  assert.equal(transitions[0].patch.failed_at, "2026-07-15T10:05:00.000Z");
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1], "ai.job_timeout");
  assert.equal(audits[0][2], "ai_job");
  assert.equal(audits[0][3], "JOB-STALE");
  assert.equal(audits[0][5].timeoutMs, 300000);
});
