const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");
const { createDocumentsRepository } = require("../src/modules/documents/repository");

function fixture() {
  const runtime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  runtime.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, status TEXT);
    CREATE TABLE documents (
      id TEXT PRIMARY KEY, title TEXT, type TEXT, category TEXT, version TEXT,
      ai_status TEXT, owner TEXT, owner_role TEXT, project_id TEXT, updated_at TEXT,
      linked_requirements TEXT, risks TEXT, file_name TEXT, file_size INTEGER,
      file_type TEXT, storage_key TEXT, content TEXT, collab_revision INTEGER DEFAULT 0
    );
    CREATE TABLE objects (
      id TEXT PRIMARY KEY, bucket TEXT, storage_key TEXT, original_name TEXT,
      mime_type TEXT, size INTEGER, created_by TEXT, created_at TEXT
    );
  `);
  const access = createSqliteAccess(runtime);
  return { runtime, access, repository: createDocumentsRepository(access) };
}

async function seedDocument(repository) {
  await repository.createDocument({
    id: "DOC-1",
    title: "Initial plan",
    type: "plan",
    category: "project",
    version: "v1.0",
    ai_status: "uploaded",
    owner: "Alice",
    owner_role: "pm",
    project_id: "PRJ-1",
    updated_at: "2026-08-14T00:00:00.000Z",
    linked_requirements: "[]",
    risks: "[]",
    file_name: "initial.md",
    file_size: 12,
    file_type: "text/markdown",
    storage_key: "initial.md",
    content: "Initial content",
    collab_revision: 0,
  });
}

test("documents repository filters documents and persists metadata changes", async () => {
  const { runtime, repository } = fixture();
  try {
    await seedDocument(repository);
    const listed = await repository.listDocuments({ keyword: "plan", projectId: "PRJ-1" });
    assert.deepEqual(listed.map((item) => item.id), ["DOC-1"]);

    await repository.updateDocumentMetadata({
      id: "DOC-1",
      title: "Revised plan",
      ownerRole: "qa",
      projectId: null,
      updatedAt: "2026-08-14T01:00:00.000Z",
    });
    const updated = await repository.findDocument("DOC-1");
    assert.equal(updated.title, "Revised plan");
    assert.equal(updated.owner_role, "qa");
    assert.equal(updated.project_id, null);
    assert.equal(updated.updated_at, "2026-08-14T01:00:00.000Z");
  } finally {
    runtime.close();
  }
});

test("documents repository enforces collaborative compare-and-swap updates", async () => {
  const { runtime, access, repository } = fixture();
  try {
    await seedDocument(repository);
    await access.insert("users", { id: "USR-1", name: "Alice", status: "active" });

    const written = await repository.updateDocumentCollaboration({
      id: "DOC-1",
      content: "First collaborative revision",
      updatedAt: "2026-08-14T02:00:00.000Z",
      baseRevision: 0,
    });
    assert.equal(written.changes, 1);
    assert.equal((await repository.findDocumentRevision("DOC-1")).collab_revision, 1);
    assert.equal((await repository.findDocumentCollaborationState("DOC-1")).content, "First collaborative revision");
    assert.equal((await repository.findUser("USR-1")).status, "active");

    const stale = await repository.updateDocumentCollaboration({
      id: "DOC-1",
      content: "Lost update",
      updatedAt: "2026-08-14T03:00:00.000Z",
      baseRevision: 0,
    });
    assert.equal(stale.changes, 0);
    assert.equal((await repository.findDocumentCollaborationState("DOC-1")).content, "First collaborative revision");
  } finally {
    runtime.close();
  }
});

test("documents repository object mutation participates in the caller transaction", async () => {
  const { runtime, access, repository } = fixture();
  try {
    await seedDocument(repository);
    await repository.createObject({
      id: "OBJ-1",
      bucket: "documents",
      storage_key: "initial.md",
      original_name: "initial.md",
      mime_type: "text/markdown",
      size: 12,
      created_by: "USR-1",
      created_at: "2026-08-14T00:00:00.000Z",
    });

    await assert.rejects(
      access.transaction(async () => {
        await repository.updateDocumentObject({
          id: "DOC-1",
          storageKey: "replacement.md",
          fileName: "replacement.md",
          fileSize: 20,
          fileType: "text/markdown",
          content: "Replacement",
          updatedAt: "2026-08-14T04:00:00.000Z",
        });
        await repository.deleteObjectByStorageKey("initial.md");
        throw new Error("rag indexing failed");
      }),
      /rag indexing failed/,
    );

    assert.equal((await repository.findDocument("DOC-1")).storage_key, "initial.md");
    assert.equal((await repository.findObjectByStorageKey("initial.md")).id, "OBJ-1");
  } finally {
    runtime.close();
  }
});
