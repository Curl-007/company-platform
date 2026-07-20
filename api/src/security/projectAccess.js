const { normalizeRole } = require("./accessControl");

function createProjectAccess({ row }) {
  function isOrganizationProjectManager(user) {
    const role = normalizeRole(user?.role);
    return role === "admin" || role === "pm";
  }

  function canAccessProject(user, projectId) {
    if (!user || !projectId) return false;
    const project = row("SELECT id, owner FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    if (!project) return false;
    if (isOrganizationProjectManager(user)) return true;
    if (project.owner === user.name) return true;

    const membership = row(
      `SELECT id
       FROM project_members
       WHERE project_id = @projectId
         AND (user_id = @userId OR (user_id IS NULL AND user_name = @userName))`,
      { projectId, userId: user.id, userName: user.name },
    );
    return Boolean(membership);
  }

  function canWriteProject(user, projectId) {
    if (!canAccessProject(user, projectId)) return false;
    const project = row("SELECT status FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    return Boolean(project && project.status !== "archived");
  }

  function canManageProject(user, projectId) {
    if (!user?.permissions?.includes("*") && !user?.permissions?.includes("project:*")) return false;
    return canWriteProject(user, projectId);
  }

  return {
    canAccessProject,
    canManageProject,
    canWriteProject,
    isOrganizationProjectManager,
  };
}

module.exports = {
  createProjectAccess,
};
