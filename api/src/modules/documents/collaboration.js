function sendJson(socket, payload) {
  socket.send(JSON.stringify(payload));
}

async function handleCollaborationUpdate({
  socket,
  rooms,
  documentId,
  user,
  message,
  remoteAddress,
  row,
  run,
  now,
  audit,
  publicUser,
  canManageDocument,
  reindexDocument,
}) {
  const baseRevision = Number(message.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    sendJson(socket, { type: "error", code: "COLLAB_REVISION_REQUIRED", message: "baseRevision is required for document updates." });
    return "revision_required";
  }
  const currentUser = await row("SELECT * FROM users WHERE id = @id", { id: user.id });
  const before = await row("SELECT * FROM documents WHERE id = @id", { id: documentId });
  if (!currentUser || currentUser.status !== "active" || !before || !(await canManageDocument(publicUser(currentUser), before))) {
    socket.close(1008, "Unauthorized");
    return "unauthorized";
  }
  const content = String(message.content || "").slice(0, 100000);
  const updatedAt = now();
  const update = await run(
    `UPDATE documents
     SET content = @content, updated_at = @updated, collab_revision = collab_revision + 1
     WHERE id = @id AND collab_revision = @baseRevision`,
    { id: documentId, content, updated: updatedAt, baseRevision },
  );
  if (update.changes !== 1) {
    const latest = await row("SELECT content, collab_revision FROM documents WHERE id = @id", { id: documentId });
    sendJson(socket, { type: "conflict", documentId, content: latest?.content || "", revision: Number(latest?.collab_revision) || 0 });
    return "conflict";
  }
  const after = await row("SELECT id, collab_revision FROM documents WHERE id = @id", { id: documentId });
  if (reindexDocument) {
    await reindexDocument({ ...before, content, updated_at: updatedAt, collab_revision: after?.collab_revision });
  }
  await audit(publicUser(currentUser), "document.collab_update", "document", documentId, before, {
    id: documentId,
    contentLength: content.length,
    collabRevision: after.collab_revision,
  }, remoteAddress);
  sendJson(socket, { type: "saved", documentId, revision: Number(after.collab_revision) || 0 });
  for (const peer of rooms.get(documentId) || []) {
    if (peer !== socket && peer.readyState === 1) {
      sendJson(peer, { type: "update", documentId, content, revision: Number(after.collab_revision) || 0 });
    }
  }
  return "updated";
}

function createDocumentCollaborationServer({
  WebSocketServer,
  server,
  path = "/ws/collab",
  authenticateSocket,
  hasPermission,
  canManageDocument,
  row,
  run,
  now,
  audit,
  publicUser,
  reindexDocument,
}) {
  const wss = new WebSocketServer({ server, path });
  const rooms = new Map();
  wss.on("connection", (socket, req) => {
    void (async () => {
      const url = new URL(req.url, "http://localhost");
      const documentId = url.searchParams.get("documentId");
      const user = await authenticateSocket(req);
      if (!documentId || !user || !hasPermission(user, "document:*")) return socket.close(1008, "Unauthorized");
      const document = await row("SELECT * FROM documents WHERE id = @id", { id: documentId });
      if (!document || !(await canManageDocument(user, document))) return socket.close(1008, "Unauthorized");
      if (!rooms.has(documentId)) rooms.set(documentId, new Set());
      rooms.get(documentId).add(socket);
      sendJson(socket, { type: "snapshot", documentId, content: document.content || "", revision: Number(document.collab_revision) || 0 });
      socket.on("message", (raw) => {
        void (async () => {
          let message;
          try {
            message = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (message && message.type === "update") {
            await handleCollaborationUpdate({
              socket,
              rooms,
              documentId,
              user,
              message,
              remoteAddress: req.socket.remoteAddress,
              row,
              run,
              now,
              audit,
              publicUser,
              canManageDocument,
              reindexDocument,
            });
          }
        })().catch((error) => {
          console.warn("document collaboration message failed:", error.message);
        });
      });
      socket.on("close", () => rooms.get(documentId)?.delete(socket));
    })().catch((error) => {
      console.warn("document collaboration connection failed:", error.message);
      try { socket.close(1011, "Internal error"); } catch { /* ignore */ }
    });
  });
  return { wss, rooms };
}

module.exports = {
  createDocumentCollaborationServer,
  handleCollaborationUpdate,
  sendJson,
};
