const assert = require("node:assert/strict");
const test = require("node:test");
const { createDocumentAnalysisRunner } = require("../src/modules/ai/jobRunner");

test("AI document analysis runner owns status transitions and document AI status update", async () => {
  const transitions = [];
  const documentStatuses = [];
  const jobs = new Map([
    ["JOB-001", { job_id: "JOB-001", status: "queued" }],
  ]);
  const repository = {
    findJob(jobId) {
      return jobs.get(jobId);
    },
    transition(job, to, patch) {
      transitions.push({ from: job.status, to, patch });
      const next = { ...job, ...patch, status: to };
      jobs.set(job.job_id, next);
      return next;
    },
    updateDocumentAiStatus(documentId, status) {
      documentStatuses.push({ documentId, status });
    },
  };
  const runner = createDocumentAnalysisRunner({
    repository,
    analyzeDocument: async () => ({ summary: "ok" }),
    json: JSON.stringify,
    now: () => "2026-07-15T12:00:00.000Z",
  });

  const result = await runner.run("JOB-001", { id: "DOC-001", title: "需求文档" });

  assert.equal(result.status, "awaiting_review");
  assert.deepEqual(result.evidence, [{ documentId: "DOC-001", pageNo: 1, quote: "需求文档" }]);
  assert.deepEqual(transitions.map((item) => [item.from, item.to]), [
    ["queued", "running"],
    ["running", "awaiting_review"],
  ]);
  assert.equal(transitions[0].patch.current_step, "文档解析中");
  assert.equal(transitions[1].patch.current_step, "结构化结果已生成");
  assert.deepEqual(documentStatuses, [{ documentId: "DOC-001", status: "awaiting_review" }]);
});

test("AI document analysis runner marks queued or running jobs failed when analysis throws", async () => {
  const transitions = [];
  let job = { job_id: "JOB-FAIL", status: "queued" };
  const repository = {
    findJob() {
      return job;
    },
    transition(current, to, patch) {
      transitions.push({ from: current.status, to, patch });
      job = { ...current, ...patch, status: to };
      return job;
    },
    updateDocumentAiStatus() {
      throw new Error("should not update document status after failure");
    },
  };
  const runner = createDocumentAnalysisRunner({
    repository,
    analyzeDocument: async () => {
      throw new Error("model down");
    },
    json: JSON.stringify,
    now: () => "2026-07-15T12:30:00.000Z",
  });

  await assert.rejects(
    () => runner.run("JOB-FAIL", { id: "DOC-FAIL", title: "失败文档" }),
    /model down/,
  );
  assert.deepEqual(transitions.map((item) => [item.from, item.to]), [
    ["queued", "running"],
    ["running", "failed"],
  ]);
  assert.equal(transitions[1].patch.current_step, "分析失败");
  assert.equal(transitions[1].patch.error_message, "model down");
  assert.equal(transitions[1].patch.failed_at, "2026-07-15T12:30:00.000Z");
});
