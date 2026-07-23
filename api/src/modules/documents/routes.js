const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  canManageDocumentRole,
  hasPermission,
  normalizeRole,
} = require("../../security/accessControl");
const { validateUploadMeta } = require("../../security/uploadPolicy");
const { canManageDocument, canViewDocument } = require("./policy");

function createDocumentsRouter({
  audit,
  canAccessProject,
  canWriteProject,
  deleteDocumentRagIndex,
  documentCategories,
  extractTextFromUpload,
  fail,
  insert,
  json,
  mapDocument,
  nextId,
  now,
  ok,
  paginatedResponse,
  requirePermission,
  reindexDocument,
  row,
  rows,
  run,
  storageDir,
  transaction,
  upload,
}) {
  const router = express.Router();
  const canRead = async (user, document) => canViewDocument(user, document, { canAccessProject, mapDocument });
  const canManage = async (user, document) => canManageDocument(user, document, { canWriteProject });

  router.get("/documents", async (req, res) => {
    let sql = "SELECT * FROM documents WHERE 1=1";
    const params = {};
    if (req.query.keyword) {
      sql += " AND title LIKE @keyword";
      params.keyword = `%${req.query.keyword}%`;
    }
    if (req.query.type) {
      sql += " AND type = @type";
      params.type = req.query.type;
    }
    if (req.query.category) {
      sql += " AND category = @category";
      params.category = req.query.category;
    }
    if (req.query.projectId) {
      sql += " AND project_id = @projectId";
      params.projectId = req.query.projectId;
    }
    if (req.query.ownerRole) {
      sql += " AND owner_role = @ownerRole";
      params.ownerRole = req.query.ownerRole;
    }
    sql += " ORDER BY updated_at DESC";
    let allItems = (await rows(sql, params)).map(mapDocument);
    if (req.user?.role !== "admin") {
      allItems = allItems.filter((item) => item.ownerRole ? canManageDocumentRole(req.user, item.ownerRole) : true);
    }
    {
      const __next_allItems = [];
      for (const item of allItems) {
        if ((!item.projectId ) || (await canAccessProject(req.user, item.projectId))) __next_allItems.push(item);
      }
      allItems = __next_allItems;
    }
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  function safeUnlink(storageKey) {
    if (!storageKey) return;
    try { fs.unlinkSync(path.join(storageDir, storageKey)); } catch { /* may not exist */ }
  }

  async function deleteObjectRow(storageKey, { ignoreErrors = false } = {}) {
    if (!storageKey) return;
    try {
      await run("DELETE FROM objects WHERE storage_key = @key", { key: storageKey });
    } catch (error) {
      if (!ignoreErrors) throw error;
    }
  }

  router.post("/documents", requirePermission("document:*"), async (req, res) => {
    const { title, type, category, owner, ownerRole, projectId, fileName, fileSize, fileType, contentBase64 } = req.body || {};
    if (!title || !type || !owner || !fileName) return fail(res, 400, "VALIDATION_FAILED", "Document title, type, owner, and fileName are required.");
    if (category && !documentCategories.includes(category)) {
      return fail(res, 400, "VALIDATION_FAILED", `Document category must be one of: ${documentCategories.join(", ")}`);
    }
    if (ownerRole && !canManageDocumentRole(req.user, ownerRole)) {
      return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
    }
    if (projectId && !(await canWriteProject(req.user, projectId))) {
      return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "You cannot create a document in an archived or inaccessible project.");
    }
    if (projectId && !(await canAccessProject(req.user, projectId))) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot create a document in this project.");
    }
    const uploadCheck = validateUploadMeta({
      fileName,
      fileType,
      size: fileSize,
      contentBase64,
    });
    if (!uploadCheck.ok) {
      return fail(res, 400, uploadCheck.errorCode || "VALIDATION_FAILED", uploadCheck.message);
    }
    const id = await nextId("DOC", "documents");
    const storageKey = contentBase64
      ? `${id}_${String(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}`
      : null;
    let content = "";
    let wroteFile = false;
    let buffer = null;
    try {
      if (contentBase64) {
        const base64 = String(contentBase64).includes(",") ? String(contentBase64).split(",").pop() : String(contentBase64);
        buffer = Buffer.from(base64, "base64");
        fs.writeFileSync(path.join(storageDir, storageKey), buffer);
        wroteFile = true;
        content = extractTextFromUpload(fileName, fileType, buffer);
      }
      const document = {
        id,
        title,
        type,
        category: category || "project",
        version: "v1.0",
        ai_status: "uploaded",
        owner,
        owner_role: ownerRole || normalizeRole(req.user.role),
        project_id: projectId || null,
        updated_at: now(),
        linked_requirements: json([]),
        risks: json([]),
        file_name: fileName,
        file_size: buffer?.length || Number(fileSize) || 0,
        file_type: fileType || "application/octet-stream",
        storage_key: storageKey,
        content,
      };
      const created = await transaction(async () => {
        if (buffer) {
          await insert("objects", { id: `OBJ-${id}`, bucket: "documents", storage_key: storageKey, original_name: fileName, mime_type: fileType || "application/octet-stream", size: buffer.length, created_by: req.user.id, created_at: now() });
        }
        await insert("documents", document);
        if (reindexDocument) await reindexDocument(document);
        await audit(req.user, "document.upload", "document", id, null, document, req.ip);
        return await row("SELECT * FROM documents WHERE id = @id", { id });
      });
      res.status(201).json(ok(mapDocument(created)));
    } catch (error) {
      if (wroteFile) {
        safeUnlink(storageKey);
        await deleteObjectRow(storageKey, { ignoreErrors: true });
      }
      throw error;
    }
  });

  router.get("/documents/:id", async (req, res) => {
    const document = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
    if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    if (!(await canRead(req.user, document))) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot access this document.");
    }
    res.json(ok(mapDocument(document)));
  });

  // As-built transitional contract for object-storage style clients.
  // Returns the existing multipart upload endpoint instead of a cloud presigned URL.
  router.post("/documents/:id/upload-url", requirePermission("document:*"), async (req, res) => {
    const document = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
    if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    if (!(await canManage(req.user, document))) {
      return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
    }
    const fileName = String(req.body?.fileName || document.file_name || "upload.bin");
    const fileType = String(req.body?.fileType || document.file_type || "application/octet-stream");
    const uploadCheck = validateUploadMeta({
      fileName,
      fileType,
      size: Number(req.body?.fileSize) || 0,
    });
    if (!uploadCheck.ok) return fail(res, 400, uploadCheck.errorCode, uploadCheck.message);
    res.status(201).json(ok({
      mode: "direct_multipart",
      method: "POST",
      uploadUrl: `/api/documents/${document.id}/object`,
      headers: { Authorization: "Bearer <token>" },
      formField: "file",
      maxBytes: 25 * 1024 * 1024,
      expiresAt: null,
      note: "Object-storage presigned URLs are not enabled; use multipart upload to uploadUrl.",
    }));
  });

  async function authorizeObjectUpload(req, res, next) {
    const document = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
    if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    if (!(await canManage(req.user, document))) {
      return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
    }
    req.authorizedDocument = document;
    return next();
  }

  router.post("/documents/:id/object", requirePermission("document:*"), authorizeObjectUpload, upload.single("file"), async (req, res) => {
    if (!req.file) return fail(res, 400, "VALIDATION_FAILED", "File is required.");
    const document = req.authorizedDocument;
    const previousKey = document.storage_key || null;
    const newKey = req.file.filename;
    let after;
    try {
      const buffer = fs.readFileSync(req.file.path);
      const content = extractTextFromUpload(req.file.originalname, req.file.mimetype, buffer);
      after = await transaction(async () => {
        await insert("objects", { id: `OBJ-${Date.now()}`, bucket: "documents", storage_key: newKey, original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size, created_by: req.user.id, created_at: now() });
        await run("UPDATE documents SET storage_key = @key, file_name = @name, file_size = @size, file_type = @type, content = @content, updated_at = @updated WHERE id = @id", { id: req.params.id, key: newKey, name: req.file.originalname, size: req.file.size, type: req.file.mimetype, content, updated: now() });
        const updated = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
        if (deleteDocumentRagIndex) await deleteDocumentRagIndex(req.params.id);
        if (reindexDocument) await reindexDocument(updated);
        await audit(req.user, "object.upload", "document", req.params.id, document, updated, req.ip);
        if (previousKey && previousKey !== newKey) await deleteObjectRow(previousKey);
        return updated;
      });
    } catch (error) {
      safeUnlink(newKey);
      await deleteObjectRow(newKey, { ignoreErrors: true });
      throw error;
    }
    if (previousKey && previousKey !== newKey) safeUnlink(previousKey);
    res.json(ok({ objectKey: newKey, document: mapDocument(after) }));
  });

  router.patch("/documents/:id", requirePermission("document:*"), async (req, res) => {
    const before = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    if (!(await canManage(req.user, before))) {
      return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
    }
    const { title, type, category, owner, ownerRole, projectId } = req.body || {};
    if (category !== undefined && !documentCategories.includes(category)) {
      return fail(res, 400, "VALIDATION_FAILED", `Document category must be one of: ${documentCategories.join(", ")}`);
    }
    if (ownerRole !== undefined && !canManageDocumentRole(req.user, ownerRole)) {
      return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
    }
    if (projectId !== undefined && projectId && !(await canWriteProject(req.user, projectId))) {
      return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "You cannot move a document to an archived or inaccessible project.");
    }
    if (projectId !== undefined && projectId && !(await canAccessProject(req.user, projectId))) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot move a document to this project.");
    }
    if (title !== undefined) await run("UPDATE documents SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
    if (type !== undefined) await run("UPDATE documents SET type = @type WHERE id = @id", { id: req.params.id, type });
    if (category !== undefined) await run("UPDATE documents SET category = @category WHERE id = @id", { id: req.params.id, category });
    if (owner !== undefined) await run("UPDATE documents SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
    if (ownerRole !== undefined) await run("UPDATE documents SET owner_role = @ownerRole WHERE id = @id", { id: req.params.id, ownerRole });
    if (projectId !== undefined) await run("UPDATE documents SET project_id = @projectId WHERE id = @id", { id: req.params.id, projectId: projectId || null });
    await run("UPDATE documents SET updated_at = @updated WHERE id = @id", { id: req.params.id, updated: now() });
    const after = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
    if (reindexDocument) await reindexDocument(after);
    await audit(req.user, "document.update", "document", req.params.id, before, after, req.ip);
    res.json(ok(mapDocument(after)));
  });

  router.delete("/documents/:id", requirePermission("document:*"), async (req, res) => {
    const before = await row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    if (!(await canManage(req.user, before))) {
      return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
    }
    await transaction(async () => {
      if (deleteDocumentRagIndex) await deleteDocumentRagIndex(req.params.id);
      await run("DELETE FROM documents WHERE id = @id", { id: req.params.id });
      if (before.storage_key) await deleteObjectRow(before.storage_key);
      await audit(req.user, "document.delete", "document", req.params.id, before, null, req.ip);
    });
    if (before.storage_key) safeUnlink(before.storage_key);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/objects/:key", async (req, res) => {
    const object = await row("SELECT * FROM objects WHERE storage_key = @key", { key: req.params.key });
    if (!object) return fail(res, 404, "RESOURCE_NOT_FOUND", "Object not found.");
    if (object.bucket === "documents") {
      const document = await row("SELECT * FROM documents WHERE storage_key = @key", { key: req.params.key });
      if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document object not found.");
      if (!(await canRead(req.user, document))) {
        return fail(res, 403, "PERMISSION_DENIED", "You cannot access this document object.");
      }
    } else if (!hasPermission(req.user, "document:*")) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot access this object.");
    }
    res.download(path.join(storageDir, object.storage_key), object.original_name);
  });

  return router;
}

module.exports = {
  createDocumentsRouter,
};
