function createDocumentsRepository({ insert, row, rows, run }) {
  async function listDocuments({ keyword, type, category, projectId, ownerRole } = {}) {
    let sql = "SELECT * FROM documents WHERE 1=1";
    const params = {};
    if (keyword) {
      sql += " AND title LIKE @keyword";
      params.keyword = `%${keyword}%`;
    }
    if (type) {
      sql += " AND type = @type";
      params.type = type;
    }
    if (category) {
      sql += " AND category = @category";
      params.category = category;
    }
    if (projectId) {
      sql += " AND project_id = @projectId";
      params.projectId = projectId;
    }
    if (ownerRole) {
      sql += " AND owner_role = @ownerRole";
      params.ownerRole = ownerRole;
    }
    return rows(`${sql} ORDER BY updated_at DESC`, params);
  }

  async function updateDocumentMetadata({ id, title, type, category, owner, ownerRole, projectId, updatedAt }) {
    if (title !== undefined) await run("UPDATE documents SET title = @title WHERE id = @id", { id, title });
    if (type !== undefined) await run("UPDATE documents SET type = @type WHERE id = @id", { id, type });
    if (category !== undefined) await run("UPDATE documents SET category = @category WHERE id = @id", { id, category });
    if (owner !== undefined) await run("UPDATE documents SET owner = @owner WHERE id = @id", { id, owner });
    if (ownerRole !== undefined) await run("UPDATE documents SET owner_role = @ownerRole WHERE id = @id", { id, ownerRole });
    if (projectId !== undefined) await run("UPDATE documents SET project_id = @projectId WHERE id = @id", { id, projectId });
    return run("UPDATE documents SET updated_at = @updated WHERE id = @id", { id, updated: updatedAt });
  }

  return {
    createDocument: (document) => insert("documents", document),
    createObject: (object) => insert("objects", object),
    deleteDocument: (id) => run("DELETE FROM documents WHERE id = @id", { id }),
    deleteObjectByStorageKey: (storageKey) => run(
      "DELETE FROM objects WHERE storage_key = @key",
      { key: storageKey },
    ),
    findDocument: (id) => row("SELECT * FROM documents WHERE id = @id", { id }),
    findDocumentByStorageKey: (storageKey) => row(
      "SELECT * FROM documents WHERE storage_key = @key",
      { key: storageKey },
    ),
    findDocumentCollaborationState: (id) => row(
      "SELECT content, collab_revision FROM documents WHERE id = @id",
      { id },
    ),
    findDocumentRevision: (id) => row(
      "SELECT id, collab_revision FROM documents WHERE id = @id",
      { id },
    ),
    findObjectByStorageKey: (storageKey) => row(
      "SELECT * FROM objects WHERE storage_key = @key",
      { key: storageKey },
    ),
    findUser: (id) => row("SELECT * FROM users WHERE id = @id", { id }),
    listDocuments,
    updateDocumentCollaboration: ({ id, content, updatedAt, baseRevision }) => run(
      `UPDATE documents
       SET content = @content, updated_at = @updated, collab_revision = collab_revision + 1
       WHERE id = @id AND collab_revision = @baseRevision`,
      { id, content, updated: updatedAt, baseRevision },
    ),
    updateDocumentMetadata,
    updateDocumentObject: ({ id, storageKey, fileName, fileSize, fileType, content, updatedAt }) => run(
      "UPDATE documents SET storage_key = @key, file_name = @name, file_size = @size, file_type = @type, content = @content, updated_at = @updated WHERE id = @id",
      {
        id,
        key: storageKey,
        name: fileName,
        size: fileSize,
        type: fileType,
        content,
        updated: updatedAt,
      },
    ),
  };
}

module.exports = {
  createDocumentsRepository,
};
