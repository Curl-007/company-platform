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

  // Cascade delete a requirement and its leaf dependencies.
  // Strategy (mixed): hard-delete tasks / defects / test cases (+ their test
  // runs and sync tasks), soft-delete child requirements and the requirement
  // itself (preserves audit history via deleted_at). Returns before-snapshots
  // of everything removed so the caller can write audit entries.
  //
  // NOTE: the @name binder maps each placeholder to a single positional value,
  // so we loop per-id for test-case-scoped deletes instead of using IN(@list).
  async function cascadeDeleteRequirement({ id, now: deletedAt }) {
    const params = { id };
    const [tasks, defects, testCases, children] = await Promise.all([
      rows("SELECT id FROM tasks WHERE requirement_id = @id ORDER BY id", params),
      rows("SELECT id FROM defects WHERE requirement_id = @id ORDER BY id", params),
      rows("SELECT id FROM test_cases WHERE requirement_id = @id ORDER BY id", params),
      rows("SELECT id FROM requirements WHERE parent_id = @id AND deleted_at IS NULL ORDER BY id", params),
    ]);

    const deletedTestRuns = [];
    const deletedSyncTasks = [];
    for (const testCase of testCases) {
      const tcParams = { id: testCase.id };
      const runList = await rows("SELECT id FROM test_runs WHERE test_case_id = @id ORDER BY id", tcParams);
      const syncTaskList = await rows("SELECT id FROM tasks WHERE source_type = 'test_case' AND source_id = @id ORDER BY id", tcParams);
      for (const item of runList) deletedTestRuns.push({ id: item.id, testCaseId: testCase.id });
      for (const item of syncTaskList) deletedSyncTasks.push({ id: item.id, testCaseId: testCase.id });
      await run("DELETE FROM test_runs WHERE test_case_id = @id", tcParams);
      await run("DELETE FROM tasks WHERE source_type = 'test_case' AND source_id = @id", tcParams);
    }
    await run("DELETE FROM test_cases WHERE requirement_id = @id", params);
    await run("DELETE FROM tasks WHERE requirement_id = @id", params);
    await run("DELETE FROM defects WHERE requirement_id = @id", params);
    await run("UPDATE requirements SET deleted_at = @deletedAt WHERE parent_id = @id AND deleted_at IS NULL", { id, deletedAt });
    await run("UPDATE requirements SET deleted_at = @deletedAt WHERE id = @id AND deleted_at IS NULL", { id, deletedAt });

    return {
      tasks,
      defects,
      testCases,
      children,
      testRuns: deletedTestRuns,
      syncTasks: deletedSyncTasks,
    };
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
    cascadeDeleteRequirement,
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
