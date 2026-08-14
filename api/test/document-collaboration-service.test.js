const assert = require("node:assert/strict");
const test = require("node:test");
const { handleCollaborationUpdate } = require("../src/modules/documents/collaboration");

function createSocket() {
  return {
    readyState: 1,
    sent: [],
    closed: null,
    send(value) { this.sent.push(JSON.parse(value)); },
    close(code, reason) { this.closed = { code, reason }; },
  };
}

test("document collaboration update requires a base revision", async () => {
  const socket = createSocket();
  const result = await handleCollaborationUpdate({
    socket,
    rooms: new Map(),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "x", clientMutationId: "mutation-invalid" },
    row: () => assert.fail("row should not be called"),
    run: () => assert.fail("run should not be called"),
    now: () => "2026-07-15T10:00:00.000Z",
    audit: () => {},
    publicUser: (user) => user,
    canManageDocument: () => true,
  });
  assert.equal(result, "revision_required");
  assert.equal(socket.sent[0].code, "COLLAB_REVISION_REQUIRED");
  assert.equal(socket.sent[0].clientMutationId, "mutation-invalid");
});

test("document collaboration update reports conflict without overwriting newer content", async () => {
  const socket = createSocket();
  const result = await handleCollaborationUpdate({
    socket,
    rooms: new Map([["DOC-001", new Set([socket])]]),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "new", baseRevision: 1, clientMutationId: "mutation-conflict" },
    row: (sql) => sql.includes("FROM users")
      ? { id: "USR-001", status: "active" }
      : sql.includes("SELECT content")
        ? { content: "latest", collab_revision: 2 }
        : { id: "DOC-001", content: "old", collab_revision: 2 },
    run: () => ({ changes: 0 }),
    now: () => "2026-07-15T10:00:00.000Z",
    audit: () => assert.fail("audit should not be written for conflicts"),
    publicUser: (user) => user,
    canManageDocument: () => true,
  });
  assert.equal(result, "conflict");
  assert.deepEqual(socket.sent[0], {
    type: "conflict",
    documentId: "DOC-001",
    content: "latest",
    revision: 2,
    preserveLocalDraft: true,
    clientMutationId: "mutation-conflict",
  });
});

test("document collaboration update writes audit evidence and broadcasts to peers", async () => {
  const socket = createSocket();
  const peer = createSocket();
  const audits = [];
  let transactionCount = 0;
  const result = await handleCollaborationUpdate({
    socket,
    rooms: new Map([["DOC-001", new Set([socket, peer])]]),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "updated content", baseRevision: 2, clientMutationId: "mutation-saved" },
    remoteAddress: "127.0.0.1",
    row: (sql) => sql.includes("FROM users")
      ? { id: "USR-001", name: "用户", status: "active" }
      : sql.includes("SELECT id, collab_revision")
        ? { id: "DOC-001", collab_revision: 3 }
        : { id: "DOC-001", content: "old", collab_revision: 2 },
    run: (_sql, params) => {
      assert.equal(params.baseRevision, 2);
      assert.equal(params.content, "updated content");
      return { changes: 1 };
    },
    now: () => "2026-07-15T10:00:00.000Z",
    audit: (...args) => audits.push(args),
    publicUser: (user) => ({ id: user.id, name: user.name }),
    canManageDocument: () => true,
    transaction: async (work) => {
      transactionCount += 1;
      return work();
    },
  });
  assert.equal(result, "updated");
  assert.equal(socket.sent[0].type, "saved");
  assert.equal(socket.sent[0].documentId, "DOC-001");
  assert.equal(socket.sent[0].revision, 3);
  assert.equal(socket.sent[0].clientMutationId, "mutation-saved");
  assert.ok(Array.isArray(socket.sent[0].peers));
  assert.equal(peer.sent.length, 1);
  assert.equal(peer.sent[0].type, "update");
  assert.equal(peer.sent[0].documentId, "DOC-001");
  assert.equal(peer.sent[0].content, "updated content");
  assert.equal(peer.sent[0].revision, 3);
  assert.equal(audits[0][1], "document.collab_update");
  assert.equal(audits[0][3], "DOC-001");
  assert.equal(audits[0][5].contentLength, "updated content".length);
  assert.equal(audits[0][6], "127.0.0.1");
  assert.equal(transactionCount, 1);
});

test("document collaboration update accepts the injected repository boundary", async () => {
  const socket = createSocket();
  const calls = [];
  const repository = {
    findUser: async () => ({ id: "USR-001", name: "Alice", status: "active" }),
    findDocument: async () => ({ id: "DOC-001", content: "before", collab_revision: 4 }),
    updateDocumentCollaboration: async (input) => {
      calls.push(["update", input]);
      return { changes: 1 };
    },
    findDocumentRevision: async () => ({ id: "DOC-001", collab_revision: 5 }),
  };
  const result = await handleCollaborationUpdate({
    socket,
    rooms: new Map([["DOC-001", new Set([socket])]]),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "after", baseRevision: 4 },
    repository,
    now: () => "2026-08-14T00:00:00.000Z",
    audit: async () => {},
    publicUser: (user) => user,
    canManageDocument: () => true,
  });

  assert.equal(result, "updated");
  assert.deepEqual(calls, [["update", {
    id: "DOC-001",
    content: "after",
    updatedAt: "2026-08-14T00:00:00.000Z",
    baseRevision: 4,
  }]]);
  assert.equal(socket.sent[0].revision, 5);
});

test("document collaboration presence lists unique online peers", () => {
  const { listRoomPresence } = require("../src/modules/documents/collaboration");
  const a = { readyState: 1, collabUser: { id: "USR-1", name: "甲" } };
  const b = { readyState: 1, collabUser: { id: "USR-2", name: "乙" } };
  const rooms = new Map([["DOC-1", new Set([a, b, a])]]);
  const peers = listRoomPresence(rooms, "DOC-1");
  assert.equal(peers.length, 2);
  assert.deepEqual(peers.map((item) => item.id).sort(), ["USR-1", "USR-2"]);
});
