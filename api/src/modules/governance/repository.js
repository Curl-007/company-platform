function createGovernanceRepository({ insert, row, rows, run }) {
  return {
    countOpenRisks: async (projectId) => Number((await row("SELECT COUNT(*) AS count FROM project_risks WHERE project_id = @projectId AND status != 'closed'", { projectId }))?.count || 0),
    createDecision: (decision) => insert("project_decisions", decision),
    createRisk: (risk) => insert("project_risks", risk),
    findRisk: (id, projectId) => row("SELECT * FROM project_risks WHERE id = @id AND project_id = @projectId", { id, projectId }),
    findRiskById: (id) => row("SELECT * FROM project_risks WHERE id = @id", { id }),
    listDecisions: (projectId) => rows("SELECT * FROM project_decisions WHERE project_id = @projectId ORDER BY updated_at DESC", { projectId }),
    listRisks: (projectId) => rows("SELECT * FROM project_risks WHERE project_id = @projectId ORDER BY updated_at DESC", { projectId }),
    updateProjectRiskCount: (projectId, count, updatedAt) => run("UPDATE projects SET risk_count = @count, updated_at = @updatedAt WHERE id = @projectId", { projectId, count, updatedAt }),
    updateRisk: (next) => run(
      "UPDATE project_risks SET title=@title, description=@description, severity=@severity, status=@status, owner_id=@ownerId, owner_name=@ownerName, mitigation_plan=@mitigationPlan, due_date=@dueDate, updated_at=@updatedAt, closed_at=@closedAt WHERE id=@id",
      next,
    ),
  };
}

module.exports = {
  createGovernanceRepository,
};
