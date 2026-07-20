const { canManageDocumentRole, visibleDocumentsForUser } = require("../../security/accessControl");

async function canViewDocument(user, document, { canAccessProject, mapDocument }) {
  if (!user || !document) return false;
  if (document.project_id && !(await canAccessProject(user, document.project_id))) return false;
  return visibleDocumentsForUser(user, [mapDocument(document)]).length > 0;
}

async function canManageDocument(user, document, { canWriteProject }) {
  if (!user || !document) return false;
  if (document.project_id && !(await canWriteProject(user, document.project_id))) return false;
  return user.role === "admin" || canManageDocumentRole(user, document.owner_role);
}

module.exports = { canManageDocument, canViewDocument };
