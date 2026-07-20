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
    findBuildProject: (id) => row("SELECT project_id FROM builds WHERE id = @id", { id }),
    findRequirementProject: (id) => row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    listDefects,
    updateDefectAffectedVersion: (id, affectedVersion) => run("UPDATE defects SET affected_version = @av WHERE id = @id", { id, av: affectedVersion }),
    updateDefectAssignee: (id, assignee) => run("UPDATE defects SET assignee = @assignee WHERE id = @id", { id, assignee }),
    updateDefectAssigneeRole: (id, assigneeRole) => run("UPDATE defects SET assignee_role = @assigneeRole WHERE id = @id", { id, assigneeRole }),
    updateDefectBuild: (id, foundInBuild) => run("UPDATE defects SET found_in_build = @fb WHERE id = @id", { id, fb: foundInBuild }),
    updateDefectDescription: (id, description) => run("UPDATE defects SET description = @desc WHERE id = @id", { id, desc: description }),
    updateDefectRequirement: (id, requirementId) => run("UPDATE defects SET requirement_id = @rid WHERE id = @id", { id, rid: requirementId }),
    updateDefectSeverity: (id, severity) => run("UPDATE defects SET severity = @severity WHERE id = @id", { id, severity }),
    updateDefectStatus: (id, status) => run("UPDATE defects SET status = @status WHERE id = @id", { id, status }),
    updateDefectTitle: (id, title) => run("UPDATE defects SET title = @title WHERE id = @id", { id, title }),
  };
}
module.exports = { createDefectsRepository };
