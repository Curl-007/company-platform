function normalizeAccessScope(accessScope) {
  if (accessScope?.all === true) return { all: true, projectIds: [] };
  if (!Array.isArray(accessScope?.projectIds)) return { all: false, projectIds: [] };
  return {
    all: false,
    projectIds: [...new Set(accessScope.projectIds.map(String).map((id) => id.trim()).filter(Boolean))].sort(),
  };
}

function scopedQuery(accessScope, column = "project_id") {
  const normalized = normalizeAccessScope(accessScope);
  if (normalized.all) return { allowed: true, clause: "1=1", params: {} };
  if (!normalized.projectIds.length) return { allowed: false, clause: "1=0", params: {} };
  const params = Object.fromEntries(normalized.projectIds.map((id, index) => [`projectId${index}`, id]));
  const placeholders = normalized.projectIds.map((_, index) => `@projectId${index}`).join(", ");
  return { allowed: true, clause: `${column} IN (${placeholders})`, params };
}

function createDashboardRepository({ row, rows }) {
  return {
    async listProjects(accessScope) {
      const scope = scopedQuery(accessScope, "id");
      if (!scope.allowed) return [];
      return await rows(`SELECT * FROM projects WHERE deleted_at IS NULL AND ${scope.clause}`, scope.params);
    },
    async listTasksByOwner(owner, accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return [];
      const ownerClause = owner ? " AND owner = @owner" : "";
      return await rows(`SELECT * FROM tasks WHERE ${scope.clause}${ownerClause}`, { ...scope.params, ...(owner ? { owner } : {}) });
    },
    async listRequirementsByOwner(owner, accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return [];
      const ownerClause = owner ? " AND (owner = @owner OR assignee = @owner)" : "";
      return await rows(
        `SELECT * FROM requirements WHERE deleted_at IS NULL AND ${scope.clause}${ownerClause}`,
        { ...scope.params, ...(owner ? { owner } : {}) },
      );
    },
    async listTestCases(accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return [];
      return await rows(`SELECT * FROM test_cases WHERE ${scope.clause}`, scope.params);
    },
    async listDocuments(accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return [];
      return await rows(`SELECT * FROM documents WHERE ${scope.clause}`, scope.params);
    },
    async listDefectsByAssignee(assignee, accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return [];
      return await rows(`SELECT * FROM defects WHERE ${scope.clause} AND assignee = @assignee`, { ...scope.params, assignee });
    },
    async listBuildsByCreator(creator, accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return [];
      return await rows(`SELECT * FROM builds WHERE ${scope.clause} AND creator = @creator`, { ...scope.params, creator });
    },
    async findProjectName(id, accessScope) {
      const scope = scopedQuery(accessScope, "id");
      if (!scope.allowed) return id;
      const project = await row(`SELECT name FROM projects WHERE id = @id AND ${scope.clause}`, { ...scope.params, id });
      return project?.name || id;
    },
    async countAiJobs(accessScope) {
      const projectExpression = "COALESCE(CASE WHEN j.source_type = 'project' THEN j.source_id END, d.project_id, sr.project_id, wr.project_id)";
      const scope = scopedQuery(accessScope, projectExpression);
      if (!scope.allowed) return 0;
      const result = await row(
        `SELECT COUNT(*) AS c
           FROM ai_jobs j
           LEFT JOIN documents d ON j.source_type = 'document' AND d.id = j.source_id
           LEFT JOIN requirements sr ON j.source_type = 'requirement' AND sr.id = j.source_id
           LEFT JOIN requirements wr ON wr.id = j.written_requirement_id
          WHERE ${scope.clause}`,
        scope.params,
      );
      return result?.c || 0;
    },
    async countWorkLogs(accessScope) {
      const scope = scopedQuery(accessScope);
      if (!scope.allowed) return 0;
      const result = await row(`SELECT COUNT(*) AS c FROM work_logs WHERE ${scope.clause}`, scope.params);
      return result?.c || 0;
    },
  };
}

module.exports = { createDashboardRepository, normalizeAccessScope, scopedQuery };
