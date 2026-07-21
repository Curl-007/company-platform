function sendJson(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function peerUserSummary(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || user.email || user.id,
  };
}

function listRoomPresence(rooms, documentId) {
  const sockets = rooms.get(documentId);
  if (!sockets) return [];
  const seen = new Set();
  const peers = [];
  for (const peer of sockets) {
    const user = peer.collabUser;
    if (!user?.id || seen.has(user.id)) continue;
    seen.add(user.id);
    peers.push(peerUserSummary(user));
  }
  return peers;
}

function broadcastPresence(rooms, documentId) {
  const peers = listRoomPresence(rooms, documentId);
  const payload = { type: "presence", documentId, peers, count: peers.length };
  for (const peer of rooms.get(documentId) || []) {
    if (peer.readyState === 1) sendJson(peer, payload);
  }
  return peers;
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
  const peers = listRoomPresence(rooms, documentId);
  sendJson(socket, {
    type: "saved",
    documentId,
    revision: Number(after.collab_revision) || 0,
    peers,
    count: peers.length,
  });
  for (const peer of rooms.get(documentId) || []) {
    if (peer !== socket && peer.readyState === 1) {
      sendJson(peer, {
        type: "update",
        documentId,
        content,
        revision: Number(after.collab_revision) || 0,
        peers,
        count: peers.length,
      });
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
      socket.collabUser = peerUserSummary(user);
      socket.collabDocumentId = documentId;
      if (!rooms.has(documentId)) rooms.set(documentId, new Set());
      rooms.get(documentId).add(socket);
      const peers = listRoomPresence(rooms, documentId);
      sendJson(socket, {
        type: "snapshot",
        documentId,
        content: document.content || "",
        revision: Number(document.collab_revision) || 0,
        peers,
        count: peers.length,
      });
      broadcastPresence(rooms, documentId);
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
          } else if (message && message.type === "ping") {
            sendJson(socket, { type: "pong", documentId, peers: listRoomPresence(rooms, documentId) });
          }
        })().catch((error) => {
          console.warn("document collaboration message failed:", error.message);
        });
      });
      socket.on("close", () => {
        rooms.get(documentId)?.delete(socket);
        if (rooms.get(documentId)?.size === 0) rooms.delete(documentId);
        else broadcastPresence(rooms, documentId);
      });
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
  listRoomPresence,
  broadcastPresence,
  sendJson,
};
