function createDefectsRepository({ insert, row, rows, run }) {
  async function listDefects({ keyword, status, severity, projectId, assignee } = {}) {
    let sql = "SELECT * FROM defects WHERE 1=1";
    const params = {};
    if (keyword) { sql += " AND title LIKE @keyword"; params.keyword = `%${keyword}%`; }
    if (status) { sql += " AND status = @status"; params.status = status; }
    if (severity) { sql += " AND severity = @severity"; params.severity = severity; }
    if (projectId) { sql += " AND project_id = @projectId"; params.projectId = projectId; }
    if (assignee) { sql += " AND assignee = @assignee"; params.assignee = assignee; }
    return await rows(sql, params);
  }
  return {
    createDefect: (defect) => insert("defects", defect),
    deleteDefect: async (id) => { await run("DELETE FROM defects WHERE id = @id", { id }); return await run("DELETE FROM tasks WHERE source_type = 'defect' AND source_id = @id", { id }); },
    findDefect: (id) => row("SELECT * FROM defects WHERE id = @id", { id }),
    findDefectVersion: (id) => row("SELECT version FROM defects WHERE id = @id", { id }),
    findBuildProject: (id) => row("SELECT project_id FROM builds WHERE id = @id", { id }),
    findRequirementProject: (id) => row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    findActiveUserByName: (name) => row(
      "SELECT id, name, role FROM users WHERE name = @name AND status = 'active'",
      { name },
    ),
    findActiveUserById: (id) => row(
      "SELECT id, name, role FROM users WHERE id = @id AND status = 'active'",
      { id },
    ),
    listProjectMembers: (projectId) => rows(
      "SELECT * FROM project_members WHERE project_id = @projectId ORDER BY created_at DESC",
      { projectId },
    ),
    listDefects,
    handoffDefect: (next) => run(
      `UPDATE defects SET assignee = @assignee, assignee_role = @assigneeRole, status = @status,
       version = version + 1
       WHERE id = @id AND version = @expectedVersion`,
      next,
    ),
    updateDefect: (id, expectedVersion, updates) => {
      const columns = {
        title: "title",
        description: "description",
        severity: "severity",
        assignee: "assignee",
        assigneeRole: "assignee_role",
        requirementId: "requirement_id",
        foundInBuild: "found_in_build",
        affectedVersion: "affected_version",
        status: "status",
      };
      const entries = Object.entries(updates).filter(([key, value]) => columns[key] && value !== undefined);
      if (!entries.length) throw new Error("updateDefect requires at least one mutable field.");
      const assignments = entries.map(([key]) => `${columns[key]} = @${key}`);
      return run(
        `UPDATE defects SET ${assignments.join(", ")}, version = COALESCE(version, 1) + 1
         WHERE id = @id AND COALESCE(version, 1) = @expectedVersion`,
        Object.assign({ id, expectedVersion }, Object.fromEntries(entries)),
      );
    },
  };
}
module.exports = { createDefectsRepository };
