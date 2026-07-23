const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const { wrapRouterAsync } = require("../src/lib/asyncHandler");
const { createDocumentsRouter } = require("../src/modules/documents/routes");

function clone(value) {
  return value == null ? value : structuredClone(value);
}

async function withDocumentServer({ canWriteProject, storageDir, state, upload, audit }, work) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: "U-1", name: "Alice", role: "admin", permissions: ["*"] };
    next();
  });
  const run = async (sql, params = {}) => {
    if (sql.startsWith("UPDATE documents SET storage_key")) {
      state.document = {
        ...state.document,
        storage_key: params.key,
        file_name: params.name,
        file_size: params.size,
        file_type: params.type,
        content: params.content,
        updated_at: params.updated,
      };
      return { changes: 1 };
    }
    if (sql.startsWith("DELETE FROM objects")) {
      state.objects.delete(params.key);
      return { changes: 1 };
    }
    return { changes: 0 };
  };
  const router = createDocumentsRouter({
    audit,
    canAccessProject: async () => true,
    canWriteProject,
    deleteDocumentRagIndex: async () => { state.rag = []; },
    documentCategories: ["project"],
    extractTextFromUpload: (_name, _type, buffer) => buffer.toString("utf8"),
    fail: (res, status, errorCode, message) => res.status(status).json({ errorCode, message }),
    insert: async (table, record) => {
      if (table === "objects") state.objects.add(record.storage_key);
    },
    json: JSON.stringify,
    mapDocument: (item) => item,
    nextId: async () => "DOC-2",
    now: () => "2026-07-23T00:00:00.000Z",
    ok: (data) => ({ data }),
    paginatedResponse: (items) => items,
    reindexDocument: async (document) => { state.rag = [{ documentId: document.id, content: document.content }]; },
    requirePermission: () => (_req, _res, next) => next(),
    row: async (sql) => sql.includes("FROM documents") ? clone(state.document) : null,
    rows: async () => [],
    run,
    storageDir,
    transaction: async (operation) => {
      const snapshot = {
        document: clone(state.document),
        objects: new Set(state.objects),
        rag: clone(state.rag),
      };
      try {
        return await operation();
      } catch (error) {
        state.document = snapshot.document;
        state.objects = snapshot.objects;
        state.rag = snapshot.rag;
        throw error;
      }
    },
    upload,
  });
  app.use("/api", wrapRouterAsync(router));
  app.use((error, _req, res, _next) => res.status(500).json({ errorCode: "INTERNAL_ERROR", message: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await work(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("multipart document upload authorizes before disk write", async () => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "document-auth-"));
  const state = {
    document: { id: "DOC-1", project_id: "PRJ-1", owner_role: "admin", storage_key: "old.txt" },
    objects: new Set(["old.txt"]),
    rag: [],
  };
  let uploadCalls = 0;
  const upload = {
    single: () => (_req, _res, next) => {
      uploadCalls += 1;
      fs.writeFileSync(path.join(storageDir, "unauthorized.txt"), "secret");
      next();
    },
  };
  try {
    await withDocumentServer({
      audit: async () => {},
      canWriteProject: async () => false,
      state,
      storageDir,
      upload,
    }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/documents/DOC-1/object`, { method: "POST" });
      assert.equal(response.status, 403);
    });
    assert.equal(uploadCalls, 0);
    assert.equal(fs.existsSync(path.join(storageDir, "unauthorized.txt")), false);
  } finally {
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
});

test("failed multipart replacement rolls back object, document, RAG, and preserves old file", async () => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "document-atomic-"));
  const oldKey = "old.txt";
  const newKey = "new.txt";
  fs.writeFileSync(path.join(storageDir, oldKey), "old content");
  const state = {
    document: {
      id: "DOC-1",
      project_id: "PRJ-1",
      owner_role: "admin",
      storage_key: oldKey,
      file_name: oldKey,
      file_size: 11,
      file_type: "text/plain",
      content: "old content",
    },
    objects: new Set([oldKey]),
    rag: [{ documentId: "DOC-1", content: "old content" }],
  };
  const upload = {
    single: () => (req, _res, next) => {
      const filePath = path.join(storageDir, newKey);
      fs.writeFileSync(filePath, "new content");
      req.file = {
        filename: newKey,
        originalname: "replacement.txt",
        mimetype: "text/plain",
        size: 11,
        path: filePath,
      };
      next();
    },
  };
  try {
    await withDocumentServer({
      audit: async () => { throw new Error("audit unavailable"); },
      canWriteProject: async () => true,
      state,
      storageDir,
      upload,
    }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/documents/DOC-1/object`, { method: "POST" });
      assert.equal(response.status, 500);
    });
    assert.equal(state.document.storage_key, oldKey);
    assert.equal(state.document.content, "old content");
    assert.deepEqual([...state.objects], [oldKey]);
    assert.deepEqual(state.rag, [{ documentId: "DOC-1", content: "old content" }]);
    assert.equal(fs.readFileSync(path.join(storageDir, oldKey), "utf8"), "old content");
    assert.equal(fs.existsSync(path.join(storageDir, newKey)), false);
  } finally {
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
});
