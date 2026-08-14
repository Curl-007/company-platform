function ensureRoleAllowed(targetRole, allowedRoles, fieldName = "role") {
  if (!targetRole || !allowedRoles.includes(targetRole)) {
    return `${fieldName} must be one of: ${allowedRoles.join(", ")}`;
  }
  return null;
}

module.exports = { ensureRoleAllowed };
