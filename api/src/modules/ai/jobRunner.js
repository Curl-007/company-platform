function buildDocumentAnalysisEvidence(document) {
  return [{ documentId: document.id, pageNo: 1, quote: document.title }];
}

function createDocumentAnalysisRunner({ repository, analyzeDocument, json, now }) {
  if (!repository) throw new Error("AI job repository is required.");
  if (typeof analyzeDocument !== "function") throw new Error("AI document analyzer is required.");
  if (typeof json !== "function") throw new Error("json serializer is required.");
  if (typeof now !== "function") throw new Error("clock is required.");

  async function run(jobId, document) {
    let job = repository.findJob(jobId);
    if (!job) throw new Error("AI job not found.");
    try {
      job = repository.transition(job, "running", {
        progress: 30,
        current_step: "文档解析中",
        started_at: now(),
      });
      const result = await analyzeDocument(document);
      const evidence = buildDocumentAnalysisEvidence(document);
      repository.transition(job, "awaiting_review", {
        progress: 100,
        current_step: "结构化结果已生成",
        result: json(result),
        evidence: json(evidence),
        failed_at: null,
        error_message: null,
      });
      repository.updateDocumentAiStatus(document.id, "awaiting_review");
      return { status: "awaiting_review", result, evidence };
    } catch (error) {
      const current = repository.findJob(jobId);
      if (current && ["queued", "running"].includes(current.status)) {
        repository.transition(current, "failed", {
          progress: 0,
          current_step: "分析失败",
          error_message: error.message || "Unknown error",
          failed_at: now(),
        });
      }
      throw error;
    }
  }

  return { run };
}

module.exports = {
  buildDocumentAnalysisEvidence,
  createDocumentAnalysisRunner,
};
