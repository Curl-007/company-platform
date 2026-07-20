const RETRYABLE_STATUSES = new Set(["failed", "rejected"]);

function createDocumentAnalysisJob({ jobId, documentId, analysisGoals, json, now }) {
  return {
    job_id: jobId,
    scene: "document_analysis",
    status: "queued",
    progress: 0,
    current_step: "排队中",
    source_type: "document",
    source_id: documentId,
    goals: json(analysisGoals || []),
    result: json({}),
    evidence: json([]),
    written_requirement_id: null,
    created_at: now(),
    confirmed_at: null,
    error_message: null,
    retry_count: 0,
    started_at: null,
    failed_at: null,
    rejected_at: null,
    rejected_reason: null,
  };
}

function mapAiJob(job, parse) {
  return {
    jobId: job.job_id,
    scene: job.scene,
    status: job.status,
    progress: job.progress,
    currentStep: job.current_step,
    result: parse(job.result, {}),
    evidence: parse(job.evidence, []),
    writtenRequirementId: job.written_requirement_id,
    errorMessage: job.error_message,
    retryCount: job.retry_count,
    startedAt: job.started_at,
    failedAt: job.failed_at,
    rejectedAt: job.rejected_at,
    rejectedReason: job.rejected_reason,
    createdAt: job.created_at,
    confirmedAt: job.confirmed_at,
  };
}

function buildRequirementDraft({ job, body, parse }) {
  const result = parse(job.result, {});
  const generated = result.requirements?.[0];
  const editedRequirement = body?.requirement && typeof body.requirement === "object" ? body.requirement : null;
  const acceptanceCriteria = editedRequirement && Array.isArray(editedRequirement.acceptanceCriteria)
    ? editedRequirement.acceptanceCriteria.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
    : Array.isArray(generated?.acceptanceCriteria) ? generated.acceptanceCriteria : [];
  const requirementDraft = generated || editedRequirement ? {
    title: String(editedRequirement?.title ?? generated?.title ?? "").trim(),
    description: String(editedRequirement?.description ?? result.summary ?? "").trim(),
    priority: String(editedRequirement?.priority ?? generated?.priority ?? "medium").trim() || "medium",
    acceptanceCriteria,
  } : null;
  return { requirementDraft, edited: Boolean(editedRequirement) };
}

function isRetryable(job) {
  return RETRYABLE_STATUSES.has(job?.status);
}

module.exports = {
  RETRYABLE_STATUSES,
  buildRequirementDraft,
  createDocumentAnalysisJob,
  isRetryable,
  mapAiJob,
};
