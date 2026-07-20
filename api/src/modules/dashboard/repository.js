function createDashboardRepository({ row, rows }) {
  return {
    async listProjects() {
      return await rows("SELECT * FROM projects WHERE deleted_at IS NULL");
    },
    async listTasksByOwner(owner) {
      return await rows(owner ? "SELECT * FROM tasks WHERE owner = @owner" : "SELECT * FROM tasks", owner ? { owner } : {});
    },
    async listRequirementsByOwner(owner) {
      const sql = owner
        ? "SELECT * FROM requirements WHERE (owner = @owner OR assignee = @owner) AND deleted_at IS NULL"
        : "SELECT * FROM requirements WHERE deleted_at IS NULL";
      return await rows(sql, owner ? { owner } : {});
    },
    async listTestCases() {
      return await rows("SELECT * FROM test_cases");
    },
    async listDocuments() {
      return await rows("SELECT * FROM documents");
    },
    async listDefectsByAssignee(assignee) {
      return await rows("SELECT * FROM defects WHERE assignee = @assignee", { assignee });
    },
    async listBuildsByCreator(creator) {
      return await rows("SELECT * FROM builds WHERE creator = @creator", { creator });
    },
    async findProjectName(id) {
      const project = await row("SELECT name FROM projects WHERE id = @id", { id });
      return project?.name || id;
    },
    async countAiJobs() {
      const result = await row("SELECT COUNT(*) AS c FROM ai_jobs");
      return result?.c || 0;
    },
    async countWorkLogs() {
      const result = await row("SELECT COUNT(*) AS c FROM work_logs");
      return result?.c || 0;
    },
  };
}

module.exports = { createDashboardRepository };
