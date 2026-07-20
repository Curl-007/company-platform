function createProjectsRepository({ insert, row, rows, run }) {
  function listProjects({ keyword, status } = {}) {
    let sql = "SELECT * FROM projects WHERE deleted_at IS NULL";
    const params = {};
    if (keyword) {
      sql += " AND name LIKE @keyword";
      params.keyword = `%${keyword}%`;
    }
    if (status) {
      sql += " AND status = @status";
      params.status = status;
    }
    return rows(`${sql} ORDER BY updated_at DESC`, params);
  }

  function projectDependencies(projectId) {
    const dependencies = [
      ["members", "SELECT COUNT(*) AS count FROM project_members WHERE project_id = @projectId"],
      ["requirements", "SELECT COUNT(*) AS count FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL"],
      ["tasks", "SELECT COUNT(*) AS count FROM tasks WHERE project_id = @projectId"],
      ["sprints", "SELECT COUNT(*) AS count FROM sprints WHERE project_id = @projectId"],
      ["testCases", "SELECT COUNT(*) AS count FROM test_cases WHERE project_id = @projectId"],
      ["defects", "SELECT COUNT(*) AS count FROM defects WHERE project_id = @projectId"],
      ["documents", "SELECT COUNT(*) AS count FROM documents WHERE project_id = @projectId"],
      ["builds", "SELECT COUNT(*) AS count FROM builds WHERE project_id = @projectId"],
      ["allocations", "SELECT COUNT(*) AS count FROM project_allocations WHERE project_id = @projectId"],
      ["risks", "SELECT COUNT(*) AS count FROM project_risks WHERE project_id = @projectId"],
      ["decisions", "SELECT COUNT(*) AS count FROM project_decisions WHERE project_id = @projectId"],
      ["workLogs", "SELECT COUNT(*) AS count FROM work_logs WHERE project_id = @projectId"],
    ];
    return Object.fromEntries(
      dependencies
        .map(([resource, sql]) => [resource, Number(row(sql, { projectId })?.count || 0)])
        .filter(([, count]) => count > 0),
    );
  }

  return {
    createProject: (project) => insert("projects", project),
    softDeleteProject: ({ id, deletedAt }) => run(
      "UPDATE projects SET deleted_at = @deletedAt, updated_at = @deletedAt WHERE id = @id AND deleted_at IS NULL",
      { id, deletedAt },
    ),
    deleteProjectMember: (id) => run("DELETE FROM project_members WHERE id = @id", { id }),
    findActiveUserByName: (name) => row("SELECT id, name FROM users WHERE name = @name AND status = 'active'", { name }),
    findProject: (id) => row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findProjectId: (id) => row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findProjectMember: (id, projectId) => row("SELECT * FROM project_members WHERE id = @id AND project_id = @projectId", { id, projectId }),
    findProjectMemberByIdentity: ({ projectId, userId, userName, role }) => row(
      "SELECT * FROM project_members WHERE project_id = @projectId AND (user_id = @userId OR (user_id IS NULL AND user_name = @userName)) AND role = @role",
      { projectId, userId, userName, role },
    ),
    findProjectVersion: (id) => row("SELECT version FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    listProjectMembers: (projectId) => rows("SELECT * FROM project_members WHERE project_id = @projectId ORDER BY created_at DESC", { projectId }),
    listProjectSprints: (projectId) => rows("SELECT * FROM sprints WHERE project_id = @projectId", { projectId }),
    listProjectTasks: (projectId) => rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: projectId }),
    activationEvidence: ({ projectId, projectStart, projectEnd }) => {
      const memberCount = Number(row("SELECT COUNT(*) AS count FROM project_members WHERE project_id = @projectId", { projectId })?.count || 0);
      const sprintCount = Number(row("SELECT COUNT(*) AS count FROM sprints WHERE project_id = @projectId", { projectId })?.count || 0);
      const unownedHighRiskCount = Number(row(
        `SELECT COUNT(*) AS count FROM project_risks
         WHERE project_id = @projectId AND severity IN ('high', 'critical') AND status != 'closed'
           AND (owner_id IS NULL OR owner_id = '')`,
        { projectId },
      )?.count || 0);
      const allocations = rows(
        `SELECT allocation.id, allocation.approval_status, plan.id AS capacity_plan_id
         FROM project_allocations AS allocation
         LEFT JOIN capacity_plans AS plan
           ON plan.user_id = allocation.user_id
          AND plan.period_start = allocation.period_start
          AND plan.period_end = allocation.period_end
         WHERE allocation.project_id = @projectId
           AND allocation.period_start <= @projectEnd
           AND allocation.period_end >= @projectStart`,
        { projectId, projectStart, projectEnd },
      );
      return { memberCount, sprintCount, unownedHighRiskCount, allocations };
    },
    listProjectFlowSummaries: () => rows("SELECT id, name, status, health_score FROM projects WHERE deleted_at IS NULL ORDER BY name"),
    listProjects,
    projectDependencies,
    reconnectProjectMemberUser: (id, userId) => run("UPDATE project_members SET user_id = @userId WHERE id = @id", { id, userId }),
    saveProjectMember: (member) => insert("project_members", member),
    updateProject: (next) => run(
      `UPDATE projects SET name=@name, objective=@objective, code=@code, description=@description, owner=@owner, status=@status,
       progress=@progress, process_mode=@processMode, program_id=@programId, product_id=@productId,
       milestones=@milestones, start_date=@startDate, end_date=@endDate, source_path=@sourcePath,
       updated_at=@updatedAt, version=version+1 WHERE id=@id AND version=@expectedVersion`,
      next,
    ),
    updateProjectStatus: ({ id, status, updatedAt, expectedVersion }) => run(
      "UPDATE projects SET status = @status, updated_at = @updatedAt, version = version + 1 WHERE id = @id AND version = @expectedVersion",
      { id, status, updatedAt, expectedVersion },
    ),
    updateProjectMilestones: ({ id, milestones, updatedAt }) => run(
      "UPDATE projects SET milestones = @milestones, updated_at = @updatedAt WHERE id = @id AND deleted_at IS NULL",
      { id, milestones, updatedAt },
    ),
  };
}

module.exports = {
  createProjectsRepository,
};
