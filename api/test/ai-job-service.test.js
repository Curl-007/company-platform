const assert = require("node:assert/strict");
const test = require("node:test");
const { buildRequirementDraft, createDocumentAnalysisJob, isRetryable, mapAiJob } = require("../src/modules/ai/service");

test("AI job service creates reviewable jobs and preserves edited requirement input", () => {
  const job = createDocumentAnalysisJob({
    jobId: "JOB-001",
    documentId: "DOC-001",
    analysisGoals: ["requirements"],
    json: JSON.stringify,
    now: () => "2026-07-13T10:00:00.000Z",
  });
  assert.equal(job.status, "queued");
  assert.equal(job.source_id, "DOC-001");

  const reviewJob = {
    ...job,
    status: "awaiting_review",
    result: JSON.stringify({ summary: "Generated", requirements: [{ title: "Generated title", priority: "high", acceptanceCriteria: ["Generated AC"] }] }),
    evidence: "[]",
  };
  const draft = buildRequirementDraft({
    job: reviewJob,
    body: { requirement: { title: "  Edited title ", acceptanceCriteria: ["  Edited AC ", ""] } },
    parse: JSON.parse,
  });
  assert.equal(draft.edited, true);
  assert.deepEqual(draft.requirementDraft, {
    title: "Edited title",
    description: "Generated",
    priority: "high",
    acceptanceCriteria: ["Edited AC"],
  });
  assert.equal(isRetryable({ status: "failed" }), true);
  assert.equal(isRetryable({ status: "confirmed" }), false);
  assert.equal(mapAiJob(reviewJob, JSON.parse).jobId, "JOB-001");
});
