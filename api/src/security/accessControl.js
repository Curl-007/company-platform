const SYSTEM_ROLES = ["admin", "pm", "pdm", "dev", "qa"];

const PAGE_KEYS = [
  "dashboard",
  "projects",
  "products",
  "team",
  "teamlogs",
  "capacity",
  "requirements",
  "testing",
  "documents",
  "ai",
  "reports",
  "flow",
  "dynamic",
  "delivery",
  "builds",
  "releases",
  "mywork",
  "settings",
];

const PAGE_ACCESS_RULES = {
  dashboard: { permissions: [] },
  mywork: { roles: ["pm", "pdm", "dev", "qa"] },
  dynamic: { permissions: ["audit:read"] },
  projects: { permissions: ["project:read", "project:*"] },
  requirements: { permissions: ["requirement:read", "requirement:*"] },
  testing: { permissions: ["test:*", "project:*"] },
  delivery: { permissions: ["build:*", "project:*"] },
  builds: { permissions: ["build:*", "project:*"] },
  releases: { permissions: ["project:*"] },
  flow: { permissions: ["project:*"] },
  documents: { permissions: ["document:read", "document:*"] },
  reports: { permissions: ["project:*"] },
  ai: { permissions: ["ai:*"] },
  products: { permissions: ["product:*", "project:*"] },
  team: { roles: ["admin", "pm"] },
  teamlogs: { roles: ["admin", "pm"] },
  capacity: { roles: ["admin", "pm"] },
  settings: { permissions: ["admin:*", "*"] },
};

const OPERATION_ACCESS_RULES = {
  "users:create": { permissions: ["admin:*", "*"] },
  "users:update": { permissions: ["admin:*", "*"] },
  "users:disable": { permissions: ["admin:*", "*"] },
  "aiProvider:manage": { permissions: ["admin:*", "*"] },
  "projects:create": { permissions: ["project:*"] },
  // The current API has no project-member scope policy yet, so project
  // mutations remain limited to project:* until that policy exists.
  "projects:manage": { permissions: ["project:*"] },
  "projects:update": { permissions: ["project:*"] },
  "projects:delete": { permissions: ["project:*"] },
  "projectMembers:manage": { permissions: ["project:*"] },
  "products:manage": { permissions: ["product:*"] },
  "requirements:manage": { permissions: ["requirement:*"] },
  "testing:manage": { permissions: ["project:*", "test:*"] },
  "delivery:manage": { permissions: ["build:*", "project:*"] },
  "documents:manage": { permissions: ["document:*"] },
  "ai:analyze": { permissions: ["ai:*"] },
  "audit:read": { permissions: ["audit:read"] },
  "source:read": { permissions: ["source:read"] },
};

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRole(role) {
  return SYSTEM_ROLES.includes(role) ? role : "dev";
}

function isSystemRole(role) {
  return SYSTEM_ROLES.includes(role);
}

function permissionsForUser(user) {
  return Array.isArray(user?.permissions) ? user.permissions : parseJson(user?.permissions, []);
}

function hasPermission(user, permission) {
  const permissions = permissionsForUser(user);
  const namespace = permission.split(":")[0];
  return permissions.includes("*") ||
    permissions.includes(permission) ||
    Boolean(namespace && permissions.includes(`${namespace}:*`));
}

function hasAnyPermission(user, permissions = []) {
  if (!permissions.length) return true;
  return permissions.some((permission) => hasPermission(user, permission));
}

function canAccessPageByServerRule(user, page) {
  if (!user || !PAGE_KEYS.includes(page)) return false;
  if (hasPermission(user, "*")) return true;
  const rule = PAGE_ACCESS_RULES[page];
  if (!rule) return false;
  if (rule.roles && !rule.roles.includes(normalizeRole(user.role))) return false;
  return hasAnyPermission(user, rule.permissions || []);
}

function canAccessOperationByServerRule(user, operation) {
  if (!user || !operation) return false;
  if (hasPermission(user, "*")) return true;
  const rule = OPERATION_ACCESS_RULES[operation];
  if (!rule) return false;
  if (rule.roles && !rule.roles.includes(normalizeRole(user.role))) return false;
  return hasAnyPermission(user, rule.permissions || []);
}

function buildCapabilities(user) {
  const sourceUser = {
    ...user,
    permissions: permissionsForUser(user),
  };
  const pages = PAGE_KEYS.filter((page) => canAccessPageByServerRule(sourceUser, page));
  const operations = Object.keys(OPERATION_ACCESS_RULES).filter((operation) =>
    canAccessOperationByServerRule(sourceUser, operation),
  );
  return {
    pages,
    operations,
    permissions: sourceUser.permissions,
    role: normalizeRole(sourceUser.role),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: permissionsForUser(user),
    capabilities: buildCapabilities(user),
    phone: user.phone || "",
    position: user.position || "",
    department: user.department || "",
    departmentId: user.department_id || null,
    bio: user.bio || "",
  };
}

function roleScopeForUser(user) {
  const role = normalizeRole(user?.role);
  if (role === "admin") return ["admin", "pm", "pdm", "dev", "qa"];
  if (role === "pm") return ["pm", "pdm", "dev", "qa"];
  if (role === "pdm") return ["pdm"];
  if (role === "dev") return ["dev"];
  return ["qa"];
}

function canManageDocumentRole(user, targetRole) {
  return roleScopeForUser(user).includes(normalizeRole(targetRole));
}

function visibleDocumentsForUser(user, documents) {
  if (!user || user.role === "admin") return documents;
  return documents.filter((item) => item.ownerRole ? canManageDocumentRole(user, item.ownerRole) : true);
}

function defaultPermissionsForRole(role) {
  if (role === "admin") return ["*"];
  if (role === "pm") return ["project:*", "requirement:*", "document:*", "ai:*", "audit:read", "source:read"];
  if (role === "pdm") return ["product:*", "document:*", "project:read", "requirement:*", "audit:read"];
  if (role === "dev") return ["project:read", "requirement:read", "build:*", "document:*", "audit:read"];
  if (role === "qa") return ["test:*", "defect:*", "document:read", "audit:read"];
  return [];
}

module.exports = {
  SYSTEM_ROLES,
  PAGE_KEYS,
  PAGE_ACCESS_RULES,
  OPERATION_ACCESS_RULES,
  buildCapabilities,
  canManageDocumentRole,
  defaultPermissionsForRole,
  hasAnyPermission,
  hasPermission,
  isSystemRole,
  normalizeRole,
  publicUser,
  roleScopeForUser,
  visibleDocumentsForUser,
};
