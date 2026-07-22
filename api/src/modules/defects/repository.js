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
    updateDefectAffectedVersion: (id, affectedVersion) => run("UPDATE defects SET affected_version = @av, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, av: affectedVersion }),
    updateDefectAssignee: (id, assignee) => run("UPDATE defects SET assignee = @assignee, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, assignee }),
    updateDefectAssigneeRole: (id, assigneeRole) => run("UPDATE defects SET assignee_role = @assigneeRole, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, assigneeRole }),
    updateDefectBuild: (id, foundInBuild) => run("UPDATE defects SET found_in_build = @fb, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, fb: foundInBuild }),
    updateDefectDescription: (id, description) => run("UPDATE defects SET description = @desc, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, desc: description }),
    updateDefectRequirement: (id, requirementId) => run("UPDATE defects SET requirement_id = @rid, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, rid: requirementId }),
    updateDefectSeverity: (id, severity) => run("UPDATE defects SET severity = @severity, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, severity }),
    updateDefectStatus: (id, status) => run("UPDATE defects SET status = @status, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, status }),
    updateDefectTitle: (id, title) => run("UPDATE defects SET title = @title, version = COALESCE(version, 1) + 1 WHERE id = @id", { id, title }),
  };
}
module.exports = { createDefectsRepository };
