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

function createDocumentAccessPolicy({ canAccessProject, canWriteProject, mapDocument }) {
  if (typeof canAccessProject !== "function" || typeof canWriteProject !== "function" || typeof mapDocument !== "function") {
    throw new Error("Document access policy dependencies are required.");
  }
  return {
    canManageDocument: (user, document) => canManageDocument(user, document, { canWriteProject }),
    canViewDocument: (user, document) => canViewDocument(user, document, { canAccessProject, mapDocument }),
  };
}

module.exports = { canManageDocument, canViewDocument, createDocumentAccessPolicy };
