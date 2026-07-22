/**
 * Shared project-scoped handoff target resolution.
 *
 * Rules:
 * - Target must be an active user account
 * - Target must belong to the project (project_members)
 * - Target's project membership role must equal the workflow target role (dev/qa)
 * - Global admin/PM accounts cannot masquerade as dev/qa unless they hold that
 *   membership role on the project
 * - Auto-pick only when the client did not name a target and exactly one
 *   project member has the target role
 */

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function isMemberMatch(member, user) {
  if (!member || !user) return false;
  if (user.id && member.user_id && member.user_id === user.id) return true;
  if (user.name && member.user_name && member.user_name === user.name) return true;
  return false;
}

function roleMismatchMessage(targetRole) {
  return targetRole === "qa"
    ? "交接目标必须是项目中的测试成员（角色 qa）。"
    : "交接目标必须是项目中的开发成员（角色 dev）。";
}

function missingTargetMessage(targetRole) {
  return targetRole === "qa"
    ? "请指定测试工程师（assignee/assigneeId），或确保项目中仅有一名测试成员。"
    : "请指定开发工程师（assignee/assigneeId），或确保项目中仅有一名开发成员。";
}

/**
 * @param {{ findActiveUserById: Function, findActiveUserByName: Function, listProjectMembers: Function }} repository
 * @param {string} projectId
 * @param {{ assigneeId?: string, assigneeName?: string, targetRole: string }} input
 * @returns {Promise<{ ok: true, user: { id: string, name: string, role: string } } | { ok: false, message: string, reason: string }>}
 */
async function resolveProjectHandoffTarget(repository, projectId, { assigneeId, assigneeName, targetRole }) {
  const role = normalizeRole(targetRole);
  if (!projectId || !role) {
    return { ok: false, reason: "INVALID_INPUT", message: "projectId and targetRole are required." };
  }

  const members = await repository.listProjectMembers(projectId);
  const roleMembers = members.filter((member) => normalizeRole(member.role) === role);

  const explicitId = assigneeId ? String(assigneeId).trim() : "";
  const explicitName = assigneeName ? String(assigneeName).trim() : "";

  let user = null;
  if (explicitId) user = await repository.findActiveUserById(explicitId);
  if (!user && explicitName) user = await repository.findActiveUserByName(explicitName);

  // Only auto-pick when the client did not name a target.
  if (!user && !explicitId && !explicitName && roleMembers.length === 1) {
    const sole = roleMembers[0];
    if (sole.user_id) user = await repository.findActiveUserById(sole.user_id);
    if (!user && sole.user_name) user = await repository.findActiveUserByName(sole.user_name);
  }

  if (!user) {
    return {
      ok: false,
      reason: explicitId || explicitName ? "USER_NOT_FOUND" : "TARGET_REQUIRED",
      message: missingTargetMessage(role),
    };
  }

  const membership = members.find((member) => isMemberMatch(member, user));
  if (!membership) {
    return {
      ok: false,
      reason: "NOT_PROJECT_MEMBER",
      message: "交接目标必须是当前项目的成员。",
    };
  }

  const membershipRole = normalizeRole(membership.role);
  if (membershipRole !== role) {
    return {
      ok: false,
      reason: "ROLE_MISMATCH",
      message: roleMismatchMessage(role),
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      role: membershipRole,
    },
  };
}

module.exports = {
  resolveProjectHandoffTarget,
};
