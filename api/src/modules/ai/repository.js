const { canTransition } = require("../../workflow/stateMachine");

const PATCH_COLUMNS = new Set([
  "progress",
  "current_step",
  "result",
  "evidence",
  "written_requirement_id",
  "confirmed_at",
  "error_message",
  "retry_count",
  "started_at",
  "failed_at",
  "rejected_at",
  "rejected_reason",
]);

function transitionError(message, code = "AI_JOB_TRANSITION_NOT_ALLOWED") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createAiJobRepository({ insert, row, rows, run }) {
  return {
    async createJob(job) {
      await insert("ai_jobs", job);
      return this.findJob(job.job_id);
    },
    async findJob(jobId) {
      return await row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: jobId });
    },
    async listTimedOutRunningJobs(cutoffIso) {
      return await rows(
        "SELECT * FROM ai_jobs WHERE status = 'running' AND COALESCE(started_at, created_at) <= @cutoffIso ORDER BY created_at ASC",
        { cutoffIso },
      );
    },
    async findDocument(documentId) {
      return await row("SELECT * FROM documents WHERE id = @id", { id: documentId });
    },
    async listDocuments({ projectId, documentIds, limit = 200 } = {}) {
      let sql = "SELECT * FROM documents WHERE 1=1";
      const params = { limit };
      if (projectId) {
        sql += " AND project_id = @projectId";
        params.projectId = projectId;
      }
      if (Array.isArray(documentIds) && documentIds.length) {
        const keys = documentIds.map((_, index) => `@documentId${index}`);
        sql += ` AND id IN (${keys.join(", ")})`;
        documentIds.forEach((id, index) => { params[`documentId${index}`] = id; });
      }
      sql += " ORDER BY updated_at DESC LIMIT @limit";
      return await rows(sql, params);
    },
    async listChunksForDocuments(documentIds) {
      if (!Array.isArray(documentIds) || !documentIds.length) return [];
      const params = {};
      const keys = documentIds.map((id, index) => {
        params[`documentId${index}`] = id;
        return `@documentId${index}`;
      });
      return await rows(
        `SELECT * FROM document_chunk WHERE document_id IN (${keys.join(", ")}) ORDER BY document_id, chunk_index`,
        params,
      );
    },
    async replaceDocumentChunks(document, chunks, indexedAt) {
      await run("DELETE FROM document_chunk WHERE document_id = @documentId", { documentId: document.id });
      for (const chunk of chunks) {
        await insert("document_chunk", {
          id: chunk.id,
          document_id: chunk.document_id || document.id,
          project_id: document.project_id || chunk.project_id || null,
          chunk_index: chunk.chunk_index,
          section_title: chunk.section_title ?? null,
          page_no: chunk.page_no ?? 1,
          content: chunk.content,
          content_hash: chunk.content_hash,
          token_estimate: chunk.token_estimate ?? 0,
          embedding_provider: chunk.embedding_provider ?? null,
          embedding_model: chunk.embedding_model ?? null,
          embedding_vector: chunk.embedding_vector ?? null,
          indexed_at: indexedAt,
        });
      }
      return chunks.length;
    },
    async updateChunkEmbedding(chunkId, { provider, model, vectorJson }) {
      await run(
        `UPDATE document_chunk
         SET embedding_provider = @provider,
             embedding_model = @model,
             embedding_vector = @vector
         WHERE id = @id`,
        { id: chunkId, provider, model, vector: vectorJson },
      );
    },
    async createRagCitation(citation) {
      await insert("rag_citation", citation);
      return await row("SELECT * FROM rag_citation WHERE id = @id", { id: citation.id });
    },
    async findRequirementProject(requirementId) {
      const requirement = await row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId });
      return requirement?.project_id || null;
    },
    async listLiveProjectIds() {
      return (await rows("SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY id")).map((item) => item.id);
    },
    async findLiveProject(projectId) {
      return await row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    },
    async createRequirement(requirement) {
      await insert("requirements", requirement);
      return requirement;
    },
    async updateDocumentAiStatus(documentId, status) {
      await run("UPDATE documents SET ai_status = @status WHERE id = @id", { id: documentId, status });
    },
    async transition(job, to, patch = {}) {
      if (!job?.job_id) throw transitionError("AI job is required.", "AI_JOB_NOT_FOUND");
      if (!canTransition("aiJob", job.status, to)) {
        throw transitionError(`Cannot transition AI job from "${job.status}" to "${to}".`);
      }
      const columns = Object.keys(patch);
      if (columns.some((column) => !PATCH_COLUMNS.has(column))) {
        throw transitionError("AI job transition includes an unsupported field.", "AI_JOB_INVALID_PATCH");
      }
      const assignments = ["status = @status", ...columns.map((column) => `${column} = @${column}`)];
      const result = await run(
        `UPDATE ai_jobs SET ${assignments.join(", ")} WHERE job_id = @jobId AND status = @fromStatus`,
        { jobId: job.job_id, fromStatus: job.status, status: to, ...patch },
      );
      if (result.changes !== 1) {
        throw transitionError("AI job was changed by another operation. Please refresh and retry.", "AI_JOB_CONFLICT");
      }
      return this.findJob(job.job_id);
    },
  };
}

function createBusinessAdviceRepository({ row, rows }) {
  return {
    async findBuild(id) {
      return await row("SELECT * FROM builds WHERE id = @id", { id });
    },
    async findDefect(id) {
      return await row("SELECT * FROM defects WHERE id = @id", { id });
    },
    async findDocument(id) {
      return await row("SELECT * FROM documents WHERE id = @id", { id });
    },
    async findProject(id) {
      return await row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id });
    },
    async findRelease(id) {
      return await row("SELECT * FROM releases WHERE id = @id", { id });
    },
    async findRequirement(id) {
      return await row("SELECT * FROM requirements WHERE id = @id AND deleted_at IS NULL", { id });
    },
    async findTestCase(id) {
      return await row("SELECT * FROM test_cases WHERE id = @id", { id });
    },
    async listAiJobsForSource(sourceType, sourceId, limit = 5) {
      return await rows(
        "SELECT * FROM ai_jobs WHERE source_type = @sourceType AND source_id = @sourceId ORDER BY created_at DESC LIMIT @limit",
        { sourceType, sourceId, limit },
      );
    },
    async listBuildsForProject(projectId) {
      return await rows("SELECT * FROM builds WHERE project_id = @id ORDER BY created_at DESC", { id: projectId });
    },
    async listDefectsForProject(projectId) {
      return await rows("SELECT * FROM defects WHERE project_id = @id ORDER BY id", { id: projectId });
    },
    async listDefectsForRequirement(requirementId) {
      return await rows("SELECT * FROM defects WHERE requirement_id = @id ORDER BY id", { id: requirementId });
    },
    async listRequirementsForProject(projectId) {
      return await rows("SELECT * FROM requirements WHERE project_id = @id AND deleted_at IS NULL ORDER BY id", { id: projectId });
    },
    async listTasksForDefect(defectId) {
      return await rows("SELECT * FROM tasks WHERE source_type = 'defect' AND source_id = @id", { id: defectId });
    },
    async listTasksForProject(projectId) {
      return await rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: projectId });
    },
    async listTasksForRequirement(requirementId) {
      return await rows("SELECT * FROM tasks WHERE requirement_id = @id ORDER BY sort_order", { id: requirementId });
    },
    async listTasksForTestCase(testCaseId) {
      return await rows("SELECT * FROM tasks WHERE source_type = 'test_case' AND source_id = @id", { id: testCaseId });
    },
    async listTestCasesForProject(projectId) {
      return await rows("SELECT * FROM test_cases WHERE project_id = @id ORDER BY id", { id: projectId });
    },
    async listTestCasesForRequirement(requirementId) {
      return await rows("SELECT * FROM test_cases WHERE requirement_id = @id ORDER BY id", { id: requirementId });
    },
    async listTestRunsForCase(testCaseId) {
      return await rows("SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC LIMIT 12", { id: testCaseId });
    },
  };
}

module.exports = { createAiJobRepository, createBusinessAdviceRepository, transitionError };
