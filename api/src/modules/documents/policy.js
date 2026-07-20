const { canManageDocumentRole, visibleDocumentsForUser } = require("../../security/accessControl");

function canViewDocument(user, document, { canAccessProject, mapDocument }) {
  if (!user || !document) return false;
  if (document.project_id && !canAccessProject(user, document.project_id)) return false;
  return visibleDocumentsForUser(user, [mapDocument(document)]).length > 0;
}

function canManageDocument(user, document, { canWriteProject }) {
  if (!user || !document) return false;
  if (document.project_id && !canWriteProject(user, document.project_id)) return false;
  return user.role === "admin" || canManageDocumentRole(user, document.owner_role);
}

module.exports = { canManageDocument, canViewDocument };
