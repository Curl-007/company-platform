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

test("document collaboration update requires a base revision", () => {
  const socket = createSocket();
  const result = handleCollaborationUpdate({
    socket,
    rooms: new Map(),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "x" },
    row: () => assert.fail("row should not be called"),
    run: () => assert.fail("run should not be called"),
    now: () => "2026-07-15T10:00:00.000Z",
    audit: () => {},
    publicUser: (user) => user,
    canManageDocument: () => true,
  });
  assert.equal(result, "revision_required");
  assert.equal(socket.sent[0].code, "COLLAB_REVISION_REQUIRED");
});

test("document collaboration update reports conflict without overwriting newer content", () => {
  const socket = createSocket();
  const result = handleCollaborationUpdate({
    socket,
    rooms: new Map([["DOC-001", new Set([socket])]]),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "new", baseRevision: 1 },
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
  assert.deepEqual(socket.sent[0], { type: "conflict", documentId: "DOC-001", content: "latest", revision: 2 });
});

test("document collaboration update writes audit evidence and broadcasts to peers", () => {
  const socket = createSocket();
  const peer = createSocket();
  const audits = [];
  const result = handleCollaborationUpdate({
    socket,
    rooms: new Map([["DOC-001", new Set([socket, peer])]]),
    documentId: "DOC-001",
    user: { id: "USR-001" },
    message: { type: "update", content: "updated content", baseRevision: 2 },
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
  });
  assert.equal(result, "updated");
  assert.deepEqual(socket.sent[0], { type: "saved", documentId: "DOC-001", revision: 3 });
  assert.equal(peer.sent.length, 1);
  assert.deepEqual(peer.sent[0], { type: "update", documentId: "DOC-001", content: "updated content", revision: 3 });
  assert.equal(audits[0][1], "document.collab_update");
  assert.equal(audits[0][3], "DOC-001");
  assert.equal(audits[0][5].contentLength, "updated content".length);
  assert.equal(audits[0][6], "127.0.0.1");
});
