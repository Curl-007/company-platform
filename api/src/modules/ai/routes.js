const express = require("express");
const crypto = require("node:crypto");
const {
  buildDocumentChunks,
  sha256,
} = require("./ragIndex");
const { rankChunksHybrid, mapHybridSearchResult } = require("./ragSearch");
const { serializeEmbedding } = require("./embedding");
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

  async function sourceDocumentForJob(req, res, job) {
    if (job?.source_type !== "document" || !job.source_id) {
      fail(res, 404, "SOURCE_MISSING", "AI job source document no longer exists.");
      return null;
    }
    const document = await repository.findDocument(job.source_id);
    if (!document) {
      fail(res, 404, "SOURCE_MISSING", "AI job source document no longer exists.");
      return null;
    }
    if (!(await canViewDocument(req.user, document))) {
      fail(res, 403, "PERMISSION_DENIED", "You cannot access this AI job.");
      return null;
    }
    return document;
  }

  router.post("/ai/rag/search", requirePermission("ai:*"), async (req, res) => {
    const query = trimmed(req.body?.query, 1000);
    if (!query) return fail(res, 400, "VALIDATION_FAILED", "query is required.");
    const projectId = trimmed(req.body?.projectId, 128) || null;
    const documentIds = ids(req.body?.documentIds);
    const limit = Math.min(Math.max(Number(req.body?.limit) || 10, 1), 50);
    if (projectId && !await repository.findLiveProject(projectId)) {
      return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    }
    if (projectId && !(await canAccessProject(req.user, projectId))) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot search this project.");
    }
    const candidates = await repository.listDocuments({ projectId, documentIds, limit: 300 });
    if (documentIds.length && candidates.length !== documentIds.length) {
      return fail(res, 404, "RESOURCE_NOT_FOUND", "One or more requested documents were not found.");
    }
    if (documentIds.length) {
      for (const document of candidates) {
        if (!(await canViewDocument(req.user, document))) {
          return fail(res, 403, "PERMISSION_DENIED", "You cannot search one or more requested documents.");
        }
      }
    }
    const visibleDocuments = [];
    for (const document of candidates) {
      if (await canViewDocument(req.user, document)) visibleDocuments.push(document);
    }
    const visibleById = new Map(visibleDocuments.map((document) => [document.id, document]));
    const existingChunks = await repository.listChunksForDocuments([...visibleById.keys()]);
    const chunkDocumentIds = new Set(existingChunks.map((chunk) => chunk.document_id));
    for (const document of visibleDocuments) {
      if (chunkDocumentIds.has(document.id)) continue;
      await repository.replaceDocumentChunks(document, buildDocumentChunks(document), now());
    }
    const chunks = await repository.listChunksForDocuments([...visibleById.keys()]);
    const queryHash = crypto.createHash("sha256").update(query).digest("hex");
    const ranked = rankChunksHybrid({
      chunks,
      documentsById: visibleById,
      query,
      limit,
    });

    // Persist local embeddings for chunks that were scored without stored vectors.
    for (const item of ranked.hits) {
      if (!item.needsPersist) continue;
      if (typeof repository.updateChunkEmbedding === "function") {
        await repository.updateChunkEmbedding(item.chunk.id, {
          provider: item.chunk.embedding_provider,
          model: item.chunk.embedding_model,
          vectorJson: item.chunk.embedding_vector || serializeEmbedding([]),
        });
      }
    }

    const results = [];
    for (let index = 0; index < ranked.hits.length; index += 1) {
      const item = ranked.hits[index];
      const citationId = `RAGC-${sha256(`${queryHash}:${item.chunk.id}:${req.user?.id || "anonymous"}:${Date.now()}:${index}`).slice(0, 24)}`;
      const result = mapHybridSearchResult(item, { query, citationId });
      await repository.createRagCitation({
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
      results.push(result);
    }

    await audit(req.user, "ai.rag_search", "ai", null, null, {
      queryHash,
      projectId,
      requestedDocumentCount: documentIds.length,
      resultDocumentIds: results.map((item) => item.documentId),
      resultChunkIds: results.map((item) => item.chunkId),
      citationIds: results.map((item) => item.citationId),
      mode: ranked.mode,
      embeddingProvider: ranked.queryEmbedding?.provider || null,
      embeddingModel: ranked.queryEmbedding?.model || null,
    }, req.ip);
    res.json(ok({
      query,
      mode: ranked.mode,
      embedding: ranked.queryEmbedding
        ? { provider: ranked.queryEmbedding.provider, model: ranked.queryEmbedding.model, dimensions: ranked.queryEmbedding.dimensions }
        : null,
      results,
    }));
  });

  router.post("/ai/documents/analyze", requirePermission("ai:*"), async (req, res, next) => {
    let job = null;
    try {
      const document = await repository.findDocument(req.body?.documentId);
      if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
      if (!(await canViewDocument(req.user, document))) return fail(res, 403, "PERMISSION_DENIED", "You cannot access this document.");
      const jobId = await nextId("JOB", "ai_jobs", "job_id");
      const base = createDocumentAnalysisJob({
        jobId,
        documentId: document.id,
        analysisGoals: req.body?.analysisGoals,
        json,
        now,
      });
      job = await repository.createJob(base);
      dispatcher.enqueue({ jobId: job.job_id, document: mapDocument(document) });
      const after = await repository.findJob(job.job_id);
      await audit(req.user, "ai.document_analyze", "ai_job", job.job_id, base, after, req.ip);
      res.status(202).json(ok(mapAiJob(after, parse)));
    } catch (error) {
      try {
        const current = job ? await repository.findJob(job.job_id) : null;
        if (current && ["queued", "running"].includes(current.status)) {
          await repository.transition(current, "failed", {
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

  router.get("/ai/jobs/:id", requirePermission("ai:*"), async (req, res) => {
    const job = await repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    if (!(await sourceDocumentForJob(req, res, job))) return;
    respond(res, job);
  });

  router.post("/ai/jobs/:id/confirm", requirePermission("ai:*"), async (req, res) => {
    const job = await repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    const sourceDocument = await sourceDocumentForJob(req, res, job);
    if (!sourceDocument) return;
    if (job.status !== "awaiting_review") return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot confirm job in status "${job.status}". Expected "awaiting_review".`);
    const { requirementDraft, edited } = buildRequirementDraft({ job, body: req.body, parse });
    if (requirementDraft?.priority && !requirementPriorities.includes(requirementDraft.priority)) {
      return fail(res, 400, "VALIDATION_FAILED", `Priority must be one of: ${requirementPriorities.join(", ")}`);
    }
    let projectId = req.body?.projectId || sourceDocument.project_id || null;
    if (!projectId) {
      const linkedRequirements = parse(sourceDocument.linked_requirements, []);
      if (linkedRequirements.length) projectId = await repository.findRequirementProject(linkedRequirements[0]);
    }
    if (!projectId) {
      const candidates = await repository.listLiveProjectIds();
      if (candidates.length === 1) [projectId] = candidates;
    }
    if (requirementDraft && !projectId) return fail(res, 400, "VALIDATION_FAILED", "确认 AI 结果前需要指定项目。");
    if (requirementDraft?.title === "") return fail(res, 400, "VALIDATION_FAILED", "写入需求前需要填写标题。");

    try {
      const after = await transaction(async () => {
        let writtenRequirementId = job.written_requirement_id;
        if (requirementDraft && projectId && !writtenRequirementId) {
          const project = await repository.findLiveProject(projectId);
          if (!project) throw Object.assign(new Error("projectId does not match a known project."), { code: "VALIDATION_FAILED" });
          if (!(await canWriteProject(req.user, project.id))) throw Object.assign(new Error("Cannot write an AI-confirmed requirement to an archived or inaccessible project."), { code: "PROJECT_ARCHIVED_OR_ACCESS_DENIED", status: 403 });
          writtenRequirementId = await nextId("REQ", "requirements");
          await repository.createRequirement({
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
        return await repository.transition(job, "confirmed", {
          confirmed_at: now(),
          written_requirement_id: writtenRequirementId,
        });
      });
      await audit(req.user, "ai.job_confirm", "ai_job", req.params.id, job, { writtenRequirementId: after.written_requirement_id, edited }, req.ip);
      respond(res, after);
    } catch (error) {
      if (error.status === 403) return fail(res, 403, error.code, error.message);
      if (error.code === "VALIDATION_FAILED") return fail(res, 400, error.code, error.message);
      if (error.code?.startsWith("AI_JOB_")) return fail(res, 409, error.code, error.message);
      throw error;
    }
  });

  router.post("/ai/jobs/:id/reject", requirePermission("ai:*"), async (req, res) => {
    const job = await repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    if (!(await sourceDocumentForJob(req, res, job))) return;
    if (job.status !== "awaiting_review") return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot reject job in status "${job.status}". Expected "awaiting_review".`);
    const reason = req.body?.reason || "未说明驳回原因";
    try {
      const after = await repository.transition(job, "rejected", { rejected_at: now(), rejected_reason: reason });
      await audit(req.user, "ai.job_reject", "ai_job", req.params.id, job, { rejectedAt: after.rejected_at, reason }, req.ip);
      respond(res, after);
    } catch (error) {
      return fail(res, 409, error.code || "AI_JOB_CONFLICT", error.message);
    }
  });

  router.post("/ai/jobs/:id/retry", requirePermission("ai:*"), async (req, res, next) => {
    const job = await repository.findJob(req.params.id);
    if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
    const sourceDocument = await sourceDocumentForJob(req, res, job);
    if (!sourceDocument) return;
    if (!isRetryable(job)) return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot retry job in status "${job.status}". Expected one of: ${[...RETRYABLE_STATUSES].join(", ")}.`);
    try {
      const retryCount = (job.retry_count || 0) + 1;
      let retried = await repository.transition(job, "retried", { retry_count: retryCount });
      retried = await repository.transition(retried, "queued", {
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
      const after = await repository.findJob(retried.job_id);
      await audit(req.user, "ai.job_retry", "ai_job", req.params.id, job, { retryCount }, req.ip);
      respond(res, after);
    } catch (error) {
      await audit(req.user, "ai.job_retry_failed", "ai_job", req.params.id, job, { error: error.message }, req.ip);
      next(error);
    }
  });

  return router;
}

module.exports = { createAiJobsRouter };
