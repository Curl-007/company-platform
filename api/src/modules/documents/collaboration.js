const { createDocumentsRepository } = require("./repository");

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

function closeUserConnections(rooms, userId, code = 1008, reason = "Session revoked") {
  let closed = 0;
  for (const sockets of rooms.values()) {
    for (const socket of sockets) {
      if (socket.collabUser?.id !== userId) continue;
      try {
        socket.close(code, reason);
        closed += 1;
      } catch {
        // The regular close handler will clean up sockets that are still registered.
      }
    }
  }
  return closed;
}

async function handleCollaborationUpdate({
  socket,
  rooms,
  documentId,
  user,
  message,
  remoteAddress,
  repository: suppliedRepository,
  row,
  run,
  now,
  audit,
  publicUser,
  canManageDocument,
  reindexDocument,
  transaction,
}) {
  const repository = suppliedRepository || createDocumentsRepository({ row, run });
  const clientMutationId = typeof message.clientMutationId === "string"
    ? message.clientMutationId.trim().slice(0, 100)
    : "";
  const baseRevision = Number(message.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    sendJson(socket, {
      type: "error",
      code: "COLLAB_REVISION_REQUIRED",
      message: "baseRevision is required for document updates.",
      clientMutationId,
    });
    return "revision_required";
  }
  const currentUser = await repository.findUser(user.id);
  const before = await repository.findDocument(documentId);
  if (!currentUser || currentUser.status !== "active" || !before || !(await canManageDocument(publicUser(currentUser), before))) {
    socket.close(1008, "Unauthorized");
    return "unauthorized";
  }
  const content = String(message.content || "").slice(0, 100000);
  const updatedAt = now();
  const persistUpdate = async () => {
    const update = await repository.updateDocumentCollaboration({
      id: documentId,
      content,
      updatedAt,
      baseRevision,
    });
    if (update.changes !== 1) {
      const latest = await repository.findDocumentCollaborationState(documentId);
      return { conflict: true, latest };
    }
    const after = await repository.findDocumentRevision(documentId);
    if (reindexDocument) {
      await reindexDocument({ ...before, content, updated_at: updatedAt, collab_revision: after?.collab_revision });
    }
    await audit(publicUser(currentUser), "document.collab_update", "document", documentId, before, {
      id: documentId,
      contentLength: content.length,
      collabRevision: after.collab_revision,
    }, remoteAddress);
    return { conflict: false, after };
  };
  const outcome = typeof transaction === "function"
    ? await transaction(persistUpdate)
    : await persistUpdate();
  if (outcome.conflict) {
    sendJson(socket, {
      type: "conflict",
      documentId,
      content: outcome.latest?.content || "",
      revision: Number(outcome.latest?.collab_revision) || 0,
      preserveLocalDraft: true,
      clientMutationId,
    });
    return "conflict";
  }
  const { after } = outcome;
  const peers = listRoomPresence(rooms, documentId);
  const savedRevision = Number(after.collab_revision) || 0;
  // ACK only confirms the content that was actually written (content-aware save ACK).
  sendJson(socket, {
    type: "saved",
    documentId,
    revision: savedRevision,
    content,
    clientMutationId,
    peers,
    count: peers.length,
  });
  for (const peer of rooms.get(documentId) || []) {
    if (peer !== socket && peer.readyState === 1) {
      sendJson(peer, {
        type: "update",
        documentId,
        content,
        revision: savedRevision,
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
  repository: suppliedRepository,
  row,
  run,
  now,
  audit,
  publicUser,
  reindexDocument,
  transaction,
}) {
  const wss = new WebSocketServer({ server, path });
  const repository = suppliedRepository || createDocumentsRepository({ row, run });
  const rooms = new Map();
  wss.on("connection", (socket, req) => {
    void (async () => {
      const url = new URL(req.url, "http://localhost");
      const documentId = url.searchParams.get("documentId");
      const user = await authenticateSocket(req);
      if (!documentId || !user || !hasPermission(user, "document:*")) return socket.close(1008, "Unauthorized");
      const document = await repository.findDocument(documentId);
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
        let requestMutationId = "";
        void (async () => {
          let message;
          try {
            message = JSON.parse(raw.toString());
          } catch {
            return;
          }
          requestMutationId = typeof message?.clientMutationId === "string"
            ? message.clientMutationId.trim().slice(0, 100)
            : "";
          if (message && message.type === "update") {
            await handleCollaborationUpdate({
              socket,
              rooms,
              documentId,
              user,
              message,
              remoteAddress: req.socket.remoteAddress,
              repository,
              now,
              audit,
              publicUser,
              canManageDocument,
              reindexDocument,
              transaction,
            });
          } else if (message && message.type === "ping") {
            sendJson(socket, { type: "pong", documentId, peers: listRoomPresence(rooms, documentId) });
          }
        })().catch((error) => {
          console.warn("document collaboration message failed:", error.message);
          if (socket.readyState === 1) {
            sendJson(socket, {
              type: "error",
              code: "COLLAB_UPDATE_FAILED",
              message: "Document update failed. Retry after checking the connection.",
              clientMutationId: requestMutationId,
            });
          }
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
  return {
    wss,
    rooms,
    closeUserConnections: (userId, code, reason) => closeUserConnections(rooms, userId, code, reason),
  };
}

module.exports = {
  createDocumentCollaborationServer,
  handleCollaborationUpdate,
  listRoomPresence,
  broadcastPresence,
  closeUserConnections,
  sendJson,
};
