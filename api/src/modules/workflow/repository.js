function createWorkflowRepository({ projectRepository, row, rows } = {}) {
  return {
    findProject: typeof projectRepository?.findProject === "function"
      ? (id) => projectRepository.findProject(id)
      : (id) => row(
        "SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL",
        { id },
      ),
    findProjectId: typeof projectRepository?.findProjectId === "function"
      ? (id) => projectRepository.findProjectId(id)
      : (id) => row(
        "SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL",
        { id },
      ),
    listProjectFlowSummaries: typeof projectRepository?.listProjectFlowSummaries === "function"
      ? () => projectRepository.listProjectFlowSummaries()
      : () => rows(
        "SELECT id, name, status, health_score FROM projects WHERE deleted_at IS NULL ORDER BY name",
      ),
    listRequirementStatuses: (projectId) => rows(
      "SELECT status FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL",
      { projectId },
    ),
    listTaskMetrics: (projectId) => rows(
      "SELECT status, estimated_hours, actual_hours, remaining_hours FROM tasks WHERE project_id = @projectId",
      { projectId },
    ),
    listDefectMetrics: (projectId) => rows(
      "SELECT status, severity FROM defects WHERE project_id = @projectId",
      { projectId },
    ),
    listTestCaseMetrics: (projectId) => rows(
      "SELECT total_cases, passed_cases, failed_cases, blocked_cases FROM test_cases WHERE project_id = @projectId",
      { projectId },
    ),
    listProjectDocuments: (projectId) => rows(
      "SELECT type, ai_status, project_id FROM documents WHERE project_id = @projectId",
      { projectId },
    ),
    findReleasedRelease: ({ projectId, productId }) => row(
      `SELECT r.id FROM releases r
       INNER JOIN builds b ON b.id = r.build_id
       WHERE r.status = 'released'
         AND b.project_id = @projectId
         AND (r.product_id = @productId OR (r.product_id IS NULL AND @productId IS NULL))
       LIMIT 1`,
      { projectId, productId },
    ),
  };
}

module.exports = {
  createWorkflowRepository,
};
