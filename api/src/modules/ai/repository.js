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
    createJob(job) {
      insert("ai_jobs", job);
      return this.findJob(job.job_id);
    },
    findJob(jobId) {
      return row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: jobId });
    },
    listTimedOutRunningJobs(cutoffIso) {
      return rows(
        "SELECT * FROM ai_jobs WHERE status = 'running' AND COALESCE(started_at, created_at) <= @cutoffIso ORDER BY created_at ASC",
        { cutoffIso },
      );
    },
    findDocument(documentId) {
      return row("SELECT * FROM documents WHERE id = @id", { id: documentId });
    },
    listDocuments({ projectId, documentIds, limit = 200 } = {}) {
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
      return rows(sql, params);
    },
    listChunksForDocuments(documentIds) {
      if (!Array.isArray(documentIds) || !documentIds.length) return [];
      const params = {};
      const keys = documentIds.map((id, index) => {
        params[`documentId${index}`] = id;
        return `@documentId${index}`;
      });
      return rows(
        `SELECT * FROM document_chunk WHERE document_id IN (${keys.join(", ")}) ORDER BY document_id, chunk_index`,
        params,
      );
    },
    replaceDocumentChunks(document, chunks, indexedAt) {
      run("DELETE FROM document_chunk WHERE document_id = @documentId", { documentId: document.id });
      for (const chunk of chunks) {
        insert("document_chunk", {
          ...chunk,
          project_id: document.project_id || null,
          indexed_at: indexedAt,
        });
      }
      return chunks.length;
    },
    createRagCitation(citation) {
      insert("rag_citation", citation);
      return row("SELECT * FROM rag_citation WHERE id = @id", { id: citation.id });
    },
    findRequirementProject(requirementId) {
      return row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId })?.project_id || null;
    },
    listLiveProjectIds() {
      return rows("SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY id").map((item) => item.id);
    },
    findLiveProject(projectId) {
      return row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    },
    createRequirement(requirement) {
      insert("requirements", requirement);
      return requirement;
    },
    updateDocumentAiStatus(documentId, status) {
      run("UPDATE documents SET ai_status = @status WHERE id = @id", { id: documentId, status });
    },
    transition(job, to, patch = {}) {
      if (!job?.job_id) throw transitionError("AI job is required.", "AI_JOB_NOT_FOUND");
      if (!canTransition("aiJob", job.status, to)) {
        throw transitionError(`Cannot transition AI job from "${job.status}" to "${to}".`);
      }
      const columns = Object.keys(patch);
      if (columns.some((column) => !PATCH_COLUMNS.has(column))) {
        throw transitionError("AI job transition includes an unsupported field.", "AI_JOB_INVALID_PATCH");
      }
      const assignments = ["status = @status", ...columns.map((column) => `${column} = @${column}`)];
      const result = run(
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
    findBuild(id) {
      return row("SELECT * FROM builds WHERE id = @id", { id });
    },
    findDefect(id) {
      return row("SELECT * FROM defects WHERE id = @id", { id });
    },
    findDocument(id) {
      return row("SELECT * FROM documents WHERE id = @id", { id });
    },
    findProject(id) {
      return row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id });
    },
    findRelease(id) {
      return row("SELECT * FROM releases WHERE id = @id", { id });
    },
    findRequirement(id) {
      return row("SELECT * FROM requirements WHERE id = @id AND deleted_at IS NULL", { id });
    },
    findTestCase(id) {
      return row("SELECT * FROM test_cases WHERE id = @id", { id });
    },
    listAiJobsForSource(sourceType, sourceId, limit = 5) {
      return rows(
        "SELECT * FROM ai_jobs WHERE source_type = @sourceType AND source_id = @sourceId ORDER BY created_at DESC LIMIT @limit",
        { sourceType, sourceId, limit },
      );
    },
    listBuildsForProject(projectId) {
      return rows("SELECT * FROM builds WHERE project_id = @id ORDER BY created_at DESC", { id: projectId });
    },
    listDefectsForProject(projectId) {
      return rows("SELECT * FROM defects WHERE project_id = @id ORDER BY id", { id: projectId });
    },
    listDefectsForRequirement(requirementId) {
      return rows("SELECT * FROM defects WHERE requirement_id = @id ORDER BY id", { id: requirementId });
    },
    listRequirementsForProject(projectId) {
      return rows("SELECT * FROM requirements WHERE project_id = @id AND deleted_at IS NULL ORDER BY id", { id: projectId });
    },
    listTasksForDefect(defectId) {
      return rows("SELECT * FROM tasks WHERE source_type = 'defect' AND source_id = @id", { id: defectId });
    },
    listTasksForProject(projectId) {
      return rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: projectId });
    },
    listTasksForRequirement(requirementId) {
      return rows("SELECT * FROM tasks WHERE requirement_id = @id ORDER BY sort_order", { id: requirementId });
    },
    listTasksForTestCase(testCaseId) {
      return rows("SELECT * FROM tasks WHERE source_type = 'test_case' AND source_id = @id", { id: testCaseId });
    },
    listTestCasesForProject(projectId) {
      return rows("SELECT * FROM test_cases WHERE project_id = @id ORDER BY id", { id: projectId });
    },
    listTestCasesForRequirement(requirementId) {
      return rows("SELECT * FROM test_cases WHERE requirement_id = @id ORDER BY id", { id: requirementId });
    },
    listTestRunsForCase(testCaseId) {
      return rows("SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC LIMIT 12", { id: testCaseId });
    },
  };
}

module.exports = { createAiJobRepository, createBusinessAdviceRepository, transitionError };
