const express = require("express");
const crypto = require("node:crypto");
const {
  buildDocumentChunks,
  mapChunkSearchResult,
  scoreChunk,
  sha256,
} = require("./ragIndex");
const {
  RETRYABLE_STATUSES,
  buildRequirementDraft,
  createDocumentAnalysisJob,
  isRetryable,
  mapAiJob,
} = require("./service");

function trimmed(value, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function ids(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => trimmed(item, 128)).filter(Boolean))].slice(0, maxItems);
}

function createAiJobsRouter({
  audit,
  canAccessProject,
  canViewDocument,
  canWriteProject,
  dispatcher,
  fail,
  json,
  mapDocument,
  nextId,
  now,
  ok,
  parse,
  repository,
  requirementPriorities,
  requirePermission,
  transaction,
}) {
  const router = express.Router();
  const respond = (res, job) => res.json(ok(mapAiJob(job, parse)));

  function sourceDocumentForJob(req, res, job) {
    if (job?.source_type !== "document" || !job.source_id) {
      fail(res, 404, "SOURCE_MISSING", "AI job source document no longer exists.");
      return null;
    }
    const document = repository.findDocument(job.source_id);
    if (!document) {
      fail(res, 404, "SOURCE_MISSING", "AI job source document no longer exists.");
      return null;
    }
    if (!canViewDocument(req.user, document)) {
      fail(res, 403, "PERMISSION_DENIED", "You cannot access this AI job.");
      return null;
    }
    return document;
  }

  router.post("/ai/rag/search", requirePermission("ai:*"), (req, res) => {
    const query = trimmed(req.body?.query, 1000);
    if (!query) return fail(res, 400, "VALIDATION_FAILED", "query is required.");
    const projectId = trimmed(req.body?.projectId, 128) || null;
    const documentIds = ids(req.body?.documentIds);
    const limit = Math.min(Math.max(Number(req.body?.limit) || 10, 1), 50);
    if (projectId && !repository.findLiveProject(projectId)) {
      return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    }
    if (projectId && !canAccessProject(req.user, projectId)) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot search this project.");
    }
    const candidates = repository.listDocuments({ projectId, documentIds, limit: 300 });
    if (documentIds.length && candidates.length !== documentIds.length) {
      return fail(res, 404, "RESOURCE_NOT_FOUND", "One or more requested documents were not found.");
    }
    if (documentIds.length && candidates.some((document) => !canViewDocument(req.user, document))) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot search one or more requested documents.");
    }
    const visibleDocuments = candidates.filter((document) => canViewDocument(req.user, document));
    const visibleById = new Map(visibleDocuments.map((document) => [document.id, document]));
    const existingChunks = repository.listChunksForDocuments([...visibleById.keys()]);
    const chunkDocumentIds = new Set(existingChunks.map((chunk) => chunk.document_id));
    for (const document of visibleDocuments) {
      if (chunkDocumentIds.has(document.id)) continue;
      repository.replaceDocumentChunks(document, buildDocumentChunks(document), now());
    }
    const chunks = repository.listChunksForDocuments([...visibleById.keys()]);
    const queryHash = crypto.createHash("sha256").update(query).digest("hex");
    const results = chunks
      .map((chunk) => {
        const document = visibleById.get(chunk.document_id);
        if (!document) return null;
        const { score, matchedFields } = scoreChunk(chunk, document, query);
        if (!score) return null;
        return { chunk, document, score, matchedFields };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || String(b.document.updated_at || "").localeCompare(String(a.document.updated_at || "")))
      .slice(0, limit)
      .map((item, index) => {
        const citationId = `RAGC-${sha256(`${queryHash}:${item.chunk.id}:${req.user?.id || "anonymous"}:${Date.now()}:${index}`).slice(0, 24)}`;
        const result = mapChunkSearchResult({ ...item, query, citationId });
        repository.createRagCitation({
          id: citationId,
          query_hash: queryHash,
          document_id: item.document.id,
          chunk_id: item.chunk.id,
          project_id: item.document.project_id || null,
          quote: result.quote,
          score: result.score,
          source: result.source,
          created_by: req.user?.id || null,
          created_at: now(),
        });
        return result;
      });
    audit(req.user, "ai.rag_search", "ai", null, null, {
      queryHash,
      projectId,
      requestedDocumentCount: documentIds.length,
      resultDocumentIds: results.map((item) => item.documentId),
      resultChunkIds: results.map((item) => item.chunkId),
      citationIds: results.map((item) => item.citationId),
      mode: "keyword",
    }, req.ip);
    res.json(ok({ query, mode: "keyword", results }));
  });

  router.post("/ai/documents/analyze", requirePermission("ai:*"), (req, res, next) => {
    let job = null;
    try {
      const document = repository.findDocument(req.body?.documentId);
      if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
      if (!canViewDocument(req.user, document)) return fail(res, 403, "PERMISSION_DENIED", "You cannot access this document.");
      const jobId = nextId("JOB", "ai_jobs", "job_id");
      const base = createDocumentAnalysisJob({
        jobId,
        documentId: document.id,
        analysisGoals: req.body?.analysisGoals,
        json,
        now,
      });
      job = repository.createJob(base);
      dispatcher.enqueue({ jobId: job.job_id, document: mapDocument(document) });
      const after = repository.findJob(job.job_id);
      audit(req.user, "ai.document_analyze", "ai_job", job.job_id, base, after, req.ip);
      res.status(202).json(ok(mapAiJob(after, parse)));
    } catch (error) {
      try {
        const current = job ? repository.findJob(job.job_id) : null;
        if (current && ["queued", "running"].includes(current.status)) {
          repository.transition(current, "failed", {
            progress: 0,
            current_step: "分析失败",
            error_message: error.message || "Unknown error",
            failed_at: now(),
          });
        }
      } catch { /* best-effort state cleanup */ }
      next(error);
    }
  });

  router.get("/ai/jobs/:id", (req, res) => {
    const job = repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    if (!sourceDocumentForJob(req, res, job)) return;
    respond(res, job);
  });

  router.post("/ai/jobs/:id/confirm", requirePermission("ai:*"), (req, res) => {
    const job = repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    const sourceDocument = sourceDocumentForJob(req, res, job);
    if (!sourceDocument) return;
    if (job.status !== "awaiting_review") return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot confirm job in status "${job.status}". Expected "awaiting_review".`);
    const { requirementDraft, edited } = buildRequirementDraft({ job, body: req.body, parse });
    if (requirementDraft?.priority && !requirementPriorities.includes(requirementDraft.priority)) {
      return fail(res, 400, "VALIDATION_FAILED", `Priority must be one of: ${requirementPriorities.join(", ")}`);
    }
    let projectId = req.body?.projectId || sourceDocument.project_id || null;
    if (!projectId) {
      const linkedRequirements = parse(sourceDocument.linked_requirements, []);
      if (linkedRequirements.length) projectId = repository.findRequirementProject(linkedRequirements[0]);
    }
    if (!projectId) {
      const candidates = repository.listLiveProjectIds();
      if (candidates.length === 1) [projectId] = candidates;
    }
    if (requirementDraft && !projectId) return fail(res, 400, "VALIDATION_FAILED", "确认 AI 结果前需要指定项目。");
    if (requirementDraft?.title === "") return fail(res, 400, "VALIDATION_FAILED", "写入需求前需要填写标题。");

    try {
      const after = transaction(() => {
        let writtenRequirementId = job.written_requirement_id;
        if (requirementDraft && projectId && !writtenRequirementId) {
          const project = repository.findLiveProject(projectId);
          if (!project) throw Object.assign(new Error("projectId does not match a known project."), { code: "VALIDATION_FAILED" });
          if (!canWriteProject(req.user, project.id)) throw Object.assign(new Error("Cannot write an AI-confirmed requirement to an archived or inaccessible project."), { code: "PROJECT_ARCHIVED_OR_ACCESS_DENIED", status: 403 });
          writtenRequirementId = nextId("REQ", "requirements");
          repository.createRequirement({
            id: writtenRequirementId,
            title: requirementDraft.title,
            description: requirementDraft.description,
            status: "draft",
            priority: requirementDraft.priority,
            project_id: project.id,
            product_id: null,
            portfolio_id: null,
            owner: req.user.name,
            completion: 0,
            linked_tasks: json([]),
            acceptance_criteria: json(requirementDraft.acceptanceCriteria),
          });
        }
        return repository.transition(job, "confirmed", {
          confirmed_at: now(),
          written_requirement_id: writtenRequirementId,
        });
      });
      audit(req.user, "ai.job_confirm", "ai_job", req.params.id, job, { writtenRequirementId: after.written_requirement_id, edited }, req.ip);
      respond(res, after);
    } catch (error) {
      if (error.status === 403) return fail(res, 403, error.code, error.message);
      if (error.code === "VALIDATION_FAILED") return fail(res, 400, error.code, error.message);
      if (error.code?.startsWith("AI_JOB_")) return fail(res, 409, error.code, error.message);
      throw error;
    }
  });

  router.post("/ai/jobs/:id/reject", requirePermission("ai:*"), (req, res) => {
    const job = repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    if (!sourceDocumentForJob(req, res, job)) return;
    if (job.status !== "awaiting_review") return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot reject job in status "${job.status}". Expected "awaiting_review".`);
    const reason = req.body?.reason || "未说明驳回原因";
    try {
      const after = repository.transition(job, "rejected", { rejected_at: now(), rejected_reason: reason });
      audit(req.user, "ai.job_reject", "ai_job", req.params.id, job, { rejectedAt: after.rejected_at, reason }, req.ip);
      respond(res, after);
    } catch (error) {
      return fail(res, 409, error.code || "AI_JOB_CONFLICT", error.message);
    }
  });

  router.post("/ai/jobs/:id/retry", requirePermission("ai:*"), (req, res, next) => {
    const job = repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    const sourceDocument = sourceDocumentForJob(req, res, job);
    if (!sourceDocument) return;
    if (!isRetryable(job)) return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot retry job in status "${job.status}". Expected one of: ${[...RETRYABLE_STATUSES].join(", ")}.`);
    try {
      const retryCount = (job.retry_count || 0) + 1;
      let retried = repository.transition(job, "retried", { retry_count: retryCount });
      retried = repository.transition(retried, "queued", {
        progress: 0,
        current_step: "排队中",
        error_message: null,
        failed_at: null,
        rejected_at: null,
        rejected_reason: null,
        result: "{}",
        evidence: "[]",
      });
      dispatcher.enqueue({ jobId: retried.job_id, document: mapDocument(sourceDocument) });
      const after = repository.findJob(retried.job_id);
      audit(req.user, "ai.job_retry", "ai_job", req.params.id, job, { retryCount }, req.ip);
      respond(res, after);
    } catch (error) {
      audit(req.user, "ai.job_retry_failed", "ai_job", req.params.id, job, { error: error.message }, req.ip);
      next(error);
    }
  });

  return router;
}

module.exports = { createAiJobsRouter };
