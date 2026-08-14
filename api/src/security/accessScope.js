function createAccessScopeResolver({ rows, canAccessProject }) {
  if (typeof rows !== "function" || typeof canAccessProject !== "function") {
    throw new Error("createAccessScopeResolver requires rows() and canAccessProject().");
  }

  async function resolveAccessScope(user) {
    if (user?.role === "admin" || (Array.isArray(user?.permissions) && user.permissions.includes("*"))) {
      return { all: true };
    }
    if (!user) return { projectIds: [] };

    const projects = await rows("SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY id");
    const projectIds = [];
    for (const project of projects) {
      if (await canAccessProject(user, project.id)) projectIds.push(project.id);
    }
    return { projectIds };
  }

  return { resolveAccessScope };
}

module.exports = { createAccessScopeResolver };
