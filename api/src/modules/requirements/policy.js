function createRequirementPolicy({ canWriteProject, hasPermission, normalizeRole }) {
  if (typeof canWriteProject !== "function" || typeof hasPermission !== "function" || typeof normalizeRole !== "function") {
    throw new Error("createRequirementPolicy requires canWriteProject(), hasPermission(), and normalizeRole().");
  }

  async function canOperateRequirement(user, requirement) {
    if (!user || !requirement) return false;
    if (!(await canWriteProject(user, requirement.project_id))) return false;
    if (hasPermission(user, "requirement:*")) return true;
    const role = normalizeRole(user.role);
    if (!["dev", "qa"].includes(role)) return false;
    return requirement.assignee === user.name && requirement.assignee_role === role;
  }

  return { canOperateRequirement };
}

module.exports = { createRequirementPolicy };
