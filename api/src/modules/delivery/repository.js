function createDeliveryRepository({ insert, row, rows, run }) {
  function idBindings(ids) {
    return {
      placeholders: ids.map((_, index) => `@id${index}`).join(", "),
      params: Object.fromEntries(ids.map((id, index) => [`id${index}`, id])),
    };
  }

  function listBuilds({ projectId, status, keyword } = {}) {
    let sql = "SELECT * FROM builds";
    const clauses = [];
    const params = {};
    if (projectId) { clauses.push("project_id = @projectId"); params.projectId = projectId; }
    if (status) { clauses.push("status = @status"); params.status = status; }
    if (keyword) { clauses.push("(name LIKE @kw OR version LIKE @kw)"); params.kw = `%${keyword}%`; }
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
    return rows(`${sql} ORDER BY created_at DESC`, params);
  }

  function listReleases({ productId, status } = {}) {
    let sql = "SELECT * FROM releases";
    const clauses = [];
    const params = {};
    if (productId) { clauses.push("product_id = @pid"); params.pid = productId; }
    if (status) { clauses.push("status = @status"); params.status = status; }
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
    return rows(`${sql} ORDER BY release_date DESC`, params);
  }

  return {
    countReleasesForBuild: (buildId) => Number(row("SELECT COUNT(*) AS count FROM releases WHERE build_id = @id", { id: buildId })?.count || 0),
    createApproval: (approval) => run(`INSERT INTO release_approvals
      (id, release_id, decision, comment, approver_id, approver_name, created_at)
      VALUES (@id, @release_id, @decision, @comment, @approver_id, @approver_name, @created_at)`, approval),
    createBuild: (build) => insert("builds", build),
    createRelease: (release) => insert("releases", release),
    createRollback: (rollback) => insert("rollback_records", rollback),
    deleteBuild: (id) => run("DELETE FROM builds WHERE id = @id", { id }),
    deleteRelease: (id) => {
      run("DELETE FROM release_approvals WHERE release_id = @id", { id });
      run("DELETE FROM rollback_records WHERE release_id = @id", { id });
      return run("DELETE FROM releases WHERE id = @id", { id });
    },
    findBuild: (id) => row("SELECT * FROM builds WHERE id = @id", { id }),
    findDefectProject: (id) => row("SELECT project_id FROM defects WHERE id = @id", { id }),
    findProjectId: (id) => row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findRequirementProject: (id) => row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    findRelease: (id) => row("SELECT * FROM releases WHERE id = @id", { id }),
    findApprovalByApprover: (releaseId, approverId) => row(
      "SELECT * FROM release_approvals WHERE release_id = @releaseId AND approver_id = @approverId",
      { releaseId, approverId },
    ),
    hasApprovedRelease: (releaseId) => Boolean(row(
      "SELECT id FROM release_approvals WHERE release_id = @id AND decision = 'approve' ORDER BY created_at DESC LIMIT 1",
      { id: releaseId },
    )),
    listActiveRequirementsByIds: (ids) => {
      if (!ids.length) return [];
      const bound = idBindings(ids);
      return rows(`SELECT * FROM requirements WHERE deleted_at IS NULL AND id IN (${bound.placeholders}) ORDER BY id`, bound.params);
    },
    listApprovals: (releaseId) => rows("SELECT * FROM release_approvals WHERE release_id = @id ORDER BY created_at DESC", { id: releaseId }),
    listBuilds,
    listDefectsByIds: (ids) => {
      if (!ids.length) return [];
      const bound = idBindings(ids);
      return rows(`SELECT * FROM defects WHERE id IN (${bound.placeholders}) ORDER BY id`, bound.params);
    },
    listDeliveryAudit: (resourceIds) => {
      if (!resourceIds.length) return [];
      const bound = idBindings(resourceIds);
      return rows(`SELECT * FROM audit_logs WHERE resource_id IN (${bound.placeholders}) ORDER BY created_at DESC LIMIT 50`, bound.params);
    },
    listReleases,
    listRollbacks: (releaseId) => rows("SELECT * FROM rollback_records WHERE release_id = @id ORDER BY created_at DESC", { id: releaseId }),
    listTasksByRequirementIds: (ids) => {
      if (!ids.length) return [];
      const bound = idBindings(ids);
      return rows(`SELECT id, title, status, progress, remaining_hours, blocker, requirement_id FROM tasks WHERE requirement_id IN (${bound.placeholders})`, bound.params);
    },
    listTestCasesByRequirementIds: (ids) => {
      if (!ids.length) return [];
      const bound = idBindings(ids);
      return rows(`SELECT id, name, status, total_cases, passed_cases, failed_cases, blocked_cases, requirement_id FROM test_cases WHERE requirement_id IN (${bound.placeholders})`, bound.params);
    },
    listDefectsByRequirementIds: (ids) => {
      if (!ids.length) return [];
      const bound = idBindings(ids);
      return rows(`SELECT id, title, status, severity, requirement_id, found_in_build FROM defects WHERE requirement_id IN (${bound.placeholders})`, bound.params);
    },
    updateBuildBugs: (id, linkedBugs) => run("UPDATE builds SET linked_bugs = @b WHERE id = @id", { id, b: linkedBugs }),
    updateBuildDate: (id, buildDate) => run("UPDATE builds SET build_date = @d WHERE id = @id", { id, d: buildDate }),
    updateBuildName: (id, name) => run("UPDATE builds SET name = @name WHERE id = @id", { id, name }),
    updateBuildNotes: (id, notes) => run("UPDATE builds SET notes = @n WHERE id = @id", { id, n: notes }),
    updateBuildScmHash: (id, scmHash) => run("UPDATE builds SET scm_hash = @h WHERE id = @id", { id, h: scmHash }),
    updateBuildStatus: (id, status) => run("UPDATE builds SET status = @status WHERE id = @id", { id, status }),
    updateBuildStories: (id, linkedStories) => run("UPDATE builds SET linked_stories = @s WHERE id = @id", { id, s: linkedStories }),
    updateBuildVersion: (id, version) => run("UPDATE builds SET version = @version WHERE id = @id", { id, version }),
    updateReleaseBugs: (id, linkedBugs) => run("UPDATE releases SET linked_bugs = @b WHERE id = @id", { id, b: linkedBugs }),
    updateReleaseBuild: (id, buildId) => run("UPDATE releases SET build_id = @b WHERE id = @id", { id, b: buildId }),
    updateReleaseDate: (id, releaseDate) => run("UPDATE releases SET release_date = @d WHERE id = @id", { id, d: releaseDate }),
    updateReleaseName: (id, name) => run("UPDATE releases SET name = @name WHERE id = @id", { id, name }),
    updateReleaseNotes: (id, releaseNotes) => run("UPDATE releases SET release_notes = @n WHERE id = @id", { id, n: releaseNotes }),
    updateReleaseStatus: (id, status) => run("UPDATE releases SET status = @status WHERE id = @id", { id, status }),
    updateReleaseStories: (id, linkedStories) => run("UPDATE releases SET linked_stories = @s WHERE id = @id", { id, s: linkedStories }),
    updateReleaseType: (id, releaseType) => run("UPDATE releases SET release_type = @t WHERE id = @id", { id, t: releaseType }),
    updateReleaseVersion: (id, version) => run("UPDATE releases SET version = @v WHERE id = @id", { id, v: version }),
  };
}

module.exports = {
  createDeliveryRepository,
};
