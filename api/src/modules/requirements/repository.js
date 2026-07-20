function createRequirementsRepository({ insert, row, rows, run }) {
  async function listRequirements({ keyword, status, priority, projectId } = {}) {
    let sql = "SELECT * FROM requirements WHERE deleted_at IS NULL";
    const params = {};
    if (keyword) {
      sql += " AND title LIKE @keyword";
      params.keyword = `%${keyword}%`;
    }
    if (status) {
      sql += " AND status = @status";
      params.status = status;
    }
    if (priority) {
      sql += " AND priority = @priority";
      params.priority = priority;
    }
    if (projectId) {
      sql += " AND project_id = @projectId";
      params.projectId = projectId;
    }
    return rows(`${sql} ORDER BY id DESC`, params);
  }

  async function requirementDependencies(id) {
    const dependencies = [
      ["children", "SELECT COUNT(*) AS count FROM requirements WHERE parent_id = @id AND deleted_at IS NULL"],
      ["tasks", "SELECT COUNT(*) AS count FROM tasks WHERE requirement_id = @id"],
      ["testCases", "SELECT COUNT(*) AS count FROM test_cases WHERE requirement_id = @id"],
      ["defects", "SELECT COUNT(*) AS count FROM defects WHERE requirement_id = @id"],
    ];
    const entries = [];
    for (const [resource, sql] of dependencies) {
      const count = Number((await row(sql, { id }))?.count || 0);
      if (count > 0) entries.push([resource, count]);
    }
    return Object.fromEntries(entries);
  }

  return {
    createRequirement: (requirement) => insert("requirements", requirement),
    softDeleteRequirement: ({ id, deletedAt }) => run("UPDATE requirements SET deleted_at = @deletedAt WHERE id = @id AND deleted_at IS NULL", { id, deletedAt }),
    findRequirement: (id) => row("SELECT * FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    findRequirementId: (id) => row("SELECT id, project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    findRequirementProject: (id) => row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    findRequirementVersion: (id) => row("SELECT version FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    listChildren: (parentId) => rows("SELECT * FROM requirements WHERE parent_id = @pid AND deleted_at IS NULL ORDER BY id", { pid: parentId }),
    listRequirements,
    requirementDependencies,
    updateRequirement: (next) => run(
      `UPDATE requirements SET title=@title, description=@description, priority=@priority,
       acceptance_criteria=@acceptanceCriteria, parent_id=@parentId, assignee=@assignee,
       assignee_role=@assigneeRole, assignment_status=@assignmentStatus, completion=@completion,
       version=version+1 WHERE id=@id AND version=@expectedVersion`,
      next,
    ),
    updateRequirementStatus: ({ id, status, completion, expectedVersion }) => run(
      "UPDATE requirements SET status = @status, completion = @completion, version = version + 1 WHERE id = @id AND version = @expectedVersion",
      { id, status, completion, expectedVersion },
    ),
  };
}

module.exports = {
  createRequirementsRepository,
};
