function createDashboardRepository({ row, rows }) {
  return {
    listProjects() {
      return rows("SELECT * FROM projects WHERE deleted_at IS NULL");
    },
    listTasksByOwner(owner) {
      return rows(owner ? "SELECT * FROM tasks WHERE owner = @owner" : "SELECT * FROM tasks", owner ? { owner } : {});
    },
    listRequirementsByOwner(owner) {
      const sql = owner
        ? "SELECT * FROM requirements WHERE (owner = @owner OR assignee = @owner) AND deleted_at IS NULL"
        : "SELECT * FROM requirements WHERE deleted_at IS NULL";
      return rows(sql, owner ? { owner } : {});
    },
    listTestCases() {
      return rows("SELECT * FROM test_cases");
    },
    listDocuments() {
      return rows("SELECT * FROM documents");
    },
    listDefectsByAssignee(assignee) {
      return rows("SELECT * FROM defects WHERE assignee = @assignee", { assignee });
    },
    listBuildsByCreator(creator) {
      return rows("SELECT * FROM builds WHERE creator = @creator", { creator });
    },
    findProjectName(id) {
      return row("SELECT name FROM projects WHERE id = @id", { id })?.name || id;
    },
    countAiJobs() {
      return row("SELECT COUNT(*) AS c FROM ai_jobs")?.c || 0;
    },
    countWorkLogs() {
      return row("SELECT COUNT(*) AS c FROM work_logs")?.c || 0;
    },
  };
}

module.exports = { createDashboardRepository };
