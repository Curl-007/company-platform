// WebSocket bridge between the in-process agent event bus and authenticated
// platform clients. Runs on its own `/ws/agent` channel of the shared HTTP
// server (the document collaboration channel binds each connection to one
// document at upgrade, so agent streaming cannot piggyback on it).
//
// Wire contract:
//   client -> server: {"type":"agent.subscribe","invocationId":"AIC-..."}
//                     {"type":"agent.unsubscribe","invocationId":"AIC-..."}
//                     {"type":"agent.subscribeUi"} / {"type":"agent.unsubscribeUi"}
//   server -> client: {"type":"agent.subscribed","invocationId":"AIC-..."}
//                     {"type":"agent.event","invocationId":"AIC-...","event":{...}}
//                     {"type":"agent.interaction","invocationId":"AIC-...","interaction":{...}}
//                     {"type":"agent.subscribedUi"}
//                     {"type":"agent.ui","directive":{...}}
//                     {"type":"agent.error","code":"...","message":"..."}
//
// Subscriptions are connection-scoped and die with the socket. Subscribe
// requires ai:* plus access to the invocation's project (verified against the
// ai_capability_invocations row); anything else answers agent.error
// PERMISSION_DENIED. The user-level ui channel (subscribeUi) only requires the
// ai:* baseline — it carries no invocation data. Only subscribe/unsubscribe
// (both channels) are audited — per-event writes would flood the audit trail.
//
// Server-initiated pushes address the authenticated user, not a subscription:
// pushUiDirective fans whitelisted UI directives (validated upstream by
// uiDirectives.js) to every ui-subscribed connection of the user, and
// pushInteraction additionally mirrors agent.interaction frames to those ui
// subscribers so cards without their own invocation subscription stay live.

const { createAgentEventBus } = require("./agentEventBus");

const MAX_PENDING_AUTH_MESSAGES = 100;
const MAX_PENDING_AUTH_BYTES = 256 * 1024;

function sendJson(socket, payload) {
  if (socket?.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // A dead socket is cleaned up by its close handler.
  }
}

function normalizeInvocationId(value) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9-]{1,128}$/.test(text) ? text : "";
}

function sendAgentError(socket, { code, message, invocationId } = {}) {
  const scopedInvocationId = normalizeInvocationId(invocationId);
  sendJson(socket, {
    type: "agent.error",
    code: String(code || "AGENT_ERROR"),
    message: String(message || "Realtime agent stream error."),
    ...(scopedInvocationId ? { invocationId: scopedInvocationId } : {}),
  });
}

function createAgentEventBridge({
  WebSocketServer,
  server,
  path = "/ws/agent",
  authenticateSocket,
  hasPermission,
  canAccessProject,
  capabilityRepository,
  agentEventBus = createAgentEventBus(),
  audit,
  logger = console,
}) {
  if (typeof WebSocketServer !== "function" || !server) throw new Error("Agent event bridge requires a WebSocketServer and the HTTP server.");
  if (typeof authenticateSocket !== "function") throw new Error("Agent event bridge requires socket authentication.");
  if (typeof hasPermission !== "function" || typeof canAccessProject !== "function") throw new Error("Agent event bridge requires permission checks.");
  if (!capabilityRepository || typeof capabilityRepository.find !== "function") throw new Error("Agent event bridge requires the AI capability repository.");

  // noServer + selective upgrade routing: another WebSocketServer (document
  // collaboration) shares this HTTP server, and ws's default { server, path }
  // binding aborts every non-matching upgrade with a 400 handshake rejection.
  // Each channel must silently ignore upgrades it does not own.
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try { pathname = new URL(req.url || "/", "http://localhost").pathname; } catch { return; }
    if (pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  const connections = new Set();

  function writeAudit(user, operation, invocationId, projectId, remoteAddress) {
    if (typeof audit !== "function") return;
    Promise.resolve(audit(
      user,
      "ai.agent_event_stream",
      "ai_capability_invocation",
      invocationId,
      null,
      { invocationId, operation },
      remoteAddress,
      { scopeType: "project", projectId },
    )).catch((error) => {
      // Observability only: a failed audit write never breaks the subscription.
      logger?.warn?.("Agent event stream audit write failed:", error?.message || error);
    });
  }

  // The user-level ui channel has no invocation row to anchor a project scope,
  // so its subscribe/unsubscribe audits stay global and carry only the channel
  // operation — same best-effort semantics as the invocation stream above.
  function writeUiAudit(user, operation, remoteAddress) {
    if (typeof audit !== "function") return;
    Promise.resolve(audit(
      user,
      "ai.agent_ui_stream",
      "ai_agent_ui_channel",
      null,
      null,
      { operation },
      remoteAddress,
    )).catch((error) => {
      logger?.warn?.("Agent ui stream audit write failed:", error?.message || error);
    });
  }

  async function handleSubscribe(socket, user, message, remoteAddress) {
    if (socket.agentClosed || !socket.agentReady || socket.readyState !== 1) return;
    const invocationId = normalizeInvocationId(message.invocationId);
    if (!invocationId) {
      sendAgentError(socket, { code: "VALIDATION_FAILED", message: "A valid invocationId is required." });
      return;
    }
    if (!hasPermission(user, "ai:*")) {
      sendAgentError(socket, { invocationId, code: "PERMISSION_DENIED", message: "You cannot subscribe to agent event streams." });
      return;
    }
    const record = await capabilityRepository.find(invocationId);
    if (!record) {
      sendAgentError(socket, { invocationId, code: "PERMISSION_DENIED", message: "AI capability invocation not found." });
      return;
    }
    if (!(await canAccessProject(user, record.project_id))) {
      sendAgentError(socket, { invocationId, code: "PERMISSION_DENIED", message: "You cannot access this AI capability invocation." });
      return;
    }
    if (socket.agentClosed || !socket.agentReady || socket.readyState !== 1) return;
    socket.agentSubscriptions.set(invocationId, record.project_id);
    sendJson(socket, { type: "agent.subscribed", invocationId });
    writeAudit(user, "subscribe", invocationId, record.project_id, remoteAddress);
  }

  function handleUnsubscribe(socket, user, message, remoteAddress) {
    const invocationId = normalizeInvocationId(message.invocationId);
    if (!invocationId || !socket.agentSubscriptions?.has(invocationId)) return;
    const projectId = socket.agentSubscriptions.get(invocationId);
    socket.agentSubscriptions.delete(invocationId);
    writeAudit(user, "unsubscribe", invocationId, projectId, remoteAddress);
  }

  // User-level ui channel: no invocationId, no project scope — only the ai:*
  // baseline that every bridge connection already re-checks here defensively.
  function handleSubscribeUi(socket, user, remoteAddress) {
    if (!hasPermission(user, "ai:*")) {
      sendJson(socket, { type: "agent.error", code: "PERMISSION_DENIED", message: "You cannot subscribe to agent ui directives." });
      return;
    }
    if (!socket.agentUiSubscribed) {
      socket.agentUiSubscribed = true;
      writeUiAudit(user, "subscribe", remoteAddress);
    }
    sendJson(socket, { type: "agent.subscribedUi" });
  }

  function handleUnsubscribeUi(socket, user, remoteAddress) {
    if (!socket.agentUiSubscribed) return;
    socket.agentUiSubscribed = false;
    writeUiAudit(user, "unsubscribe", remoteAddress);
  }

  const unsubscribeBus = agentEventBus.subscribe((message) => {
    if (!connections.size) return;
    const invocationId = String(message?.invocationId || "");
    if (!invocationId) return;
    for (const socket of connections) {
      if (!socket.agentSubscriptions?.has(invocationId)) continue;
      sendJson(socket, { type: "agent.event", invocationId, event: message.event });
    }
  });

  // Authentication is asynchronous, but ws emits client frames immediately
  // after the upgrade. Install the message/close handlers before awaiting auth
  // and queue a bounded number of frames so the first subscribe cannot be
  // dropped. A per-connection promise chain preserves frame ordering after the
  // identity is established.
  const authenticating = new Set();
  const userRevocationGeneration = new Map();
  let revocationGeneration = 0;

  function cleanupSocket(socket) {
    socket.agentClosed = true;
    socket.agentReady = false;
    socket.agentPendingMessages = [];
    socket.agentPendingBytes = 0;
    socket.agentSubscriptions?.clear();
    socket.agentUiSubscribed = false;
    connections.delete(socket);
    authenticating.delete(socket);
  }

  function processMessage(socket, user, raw, remoteAddress) {
    if (socket.agentClosed || !socket.agentReady || socket.readyState !== 1) return Promise.resolve();
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      sendJson(socket, { type: "agent.error", code: "VALIDATION_FAILED", message: "Messages must be JSON objects." });
      return Promise.resolve();
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      sendJson(socket, { type: "agent.error", code: "VALIDATION_FAILED", message: "Messages must be JSON objects." });
      return Promise.resolve();
    }
    if (message.type === "agent.subscribe") {
      return handleSubscribe(socket, user, message, remoteAddress).catch((error) => {
        logger?.warn?.("Agent event subscribe failed:", error?.message || error);
        sendAgentError(socket, {
          invocationId: message.invocationId,
          code: "AGENT_BRIDGE_SUBSCRIBE_FAILED",
          message: "Subscription could not be established.",
        });
      });
    }
    if (message.type === "agent.unsubscribe") {
      handleUnsubscribe(socket, user, message, remoteAddress);
      return Promise.resolve();
    }
    if (message.type === "agent.subscribeUi") {
      handleSubscribeUi(socket, user, remoteAddress);
      return Promise.resolve();
    }
    if (message.type === "agent.unsubscribeUi") {
      handleUnsubscribeUi(socket, user, remoteAddress);
      return Promise.resolve();
    }
    sendJson(socket, { type: "agent.error", code: "AGENT_BRIDGE_UNKNOWN_MESSAGE", message: "Unsupported message type." });
    return Promise.resolve();
  }

  function enqueueMessage(socket, raw) {
    if (socket.agentClosed) return;
    socket.agentMessageChain = socket.agentMessageChain
      .then(() => processMessage(socket, socket.agentUser, raw, socket.agentRemoteAddress))
      .catch((error) => {
        logger?.warn?.("Agent event message failed:", error?.message || error);
        sendJson(socket, { type: "agent.error", code: "AGENT_BRIDGE_MESSAGE_FAILED", message: "Agent message could not be processed." });
      });
  }

  wss.on("connection", (socket, req) => {
    socket.agentSubscriptions = new Map();
    socket.agentUiSubscribed = false;
    socket.agentReady = false;
    socket.agentClosed = false;
    socket.agentPendingMessages = [];
    socket.agentPendingBytes = 0;
    socket.agentMessageChain = Promise.resolve();
    socket.agentRemoteAddress = req.socket?.remoteAddress;
    socket.agentAuthGeneration = revocationGeneration;
    authenticating.add(socket);

    // These handlers deliberately precede the async authenticateSocket call.
    socket.on("message", (raw) => {
      if (socket.agentClosed) return;
      if (!socket.agentReady) {
        const bytes = Buffer.byteLength(raw?.toString?.() || "", "utf8");
        if (
          socket.agentPendingMessages.length >= MAX_PENDING_AUTH_MESSAGES
          || socket.agentPendingBytes + bytes > MAX_PENDING_AUTH_BYTES
        ) {
          socket.agentClosed = true;
          try { socket.close(1008, "Too many messages before authentication"); } catch { /* ignore */ }
          return;
        }
        socket.agentPendingMessages.push(raw);
        socket.agentPendingBytes += bytes;
        return;
      }
      enqueueMessage(socket, raw);
    });
    socket.on("close", () => cleanupSocket(socket));
    socket.on("error", () => cleanupSocket(socket));

    void (async () => {
      let user;
      try {
        user = await authenticateSocket(req);
        if (!user || !hasPermission(user, "ai:*")) {
          try { socket.close(1008, "Unauthorized"); } catch { /* ignore */ }
          return;
        }
      } catch (error) {
        logger?.warn?.("Agent event authentication failed:", error?.message || error);
        try { socket.close(1011, "Internal error"); } catch { /* ignore */ }
        return;
      }
      if (socket.agentClosed || socket.readyState !== 1) return;
      if ((userRevocationGeneration.get(String(user.id)) || 0) > socket.agentAuthGeneration) {
        try { socket.close(1008, "Session revoked"); } catch { /* ignore */ }
        return;
      }

      // Sprint 5.1 interaction push targets: server-initiated messages are
      // user-addressed, so the connection keeps its authenticated identity.
      socket.agentUser = user;
      socket.agentUserId = user.id;
      socket.agentReady = true;
      authenticating.delete(socket);
      connections.add(socket);

      const pending = socket.agentPendingMessages;
      socket.agentPendingMessages = [];
      socket.agentPendingBytes = 0;
      for (const raw of pending) enqueueMessage(socket, raw);
    })().catch((error) => {
      logger?.warn?.("Agent event bridge connection failed:", error?.message || error);
      try { socket.close(1011, "Internal error"); } catch { /* ignore */ }
    });
  });

  // Server-initiated interaction notification ("agent.interaction"): sent to
  // the target user's connections that already subscribed to this invocation,
  // and mirrored to the same user's ui-channel subscribers so interaction cards
  // without their own invocation subscription stay live. A connection in both
  // sets receives the frame exactly once. Clients without any matching
  // subscription still see pending interactions through the REST polling
  // fallback, so delivery here never blocks the ask/approval lifecycle.
  function pushInteraction(userId, invocationId, interaction) {
    if (!connections.size) return 0;
    const targetUser = String(userId || "");
    const targetInvocation = String(invocationId || "");
    if (!targetUser || !targetInvocation) return 0;
    let delivered = 0;
    const messaged = new Set();
    for (const socket of connections) {
      if (String(socket.agentUserId || "") !== targetUser) continue;
      if (!socket.agentSubscriptions?.has(targetInvocation) && !socket.agentUiSubscribed) continue;
      if (messaged.has(socket)) continue;
      messaged.add(socket);
      sendJson(socket, { type: "agent.interaction", invocationId: targetInvocation, interaction });
      delivered += 1;
    }
    return delivered;
  }

  // Server-initiated UI directive ("agent.ui"): the payload must already have
  // passed the shared uiDirectives whitelist at the emitting entry point
  // (REST route or execution gateway); delivery itself is best-effort.
  function pushUiDirective(userId, directive) {
    if (!connections.size) return 0;
    const targetUser = String(userId || "");
    if (!targetUser) return 0;
    let delivered = 0;
    for (const socket of connections) {
      if (String(socket.agentUserId || "") !== targetUser) continue;
      if (!socket.agentUiSubscribed) continue;
      sendJson(socket, { type: "agent.ui", directive });
      delivered += 1;
    }
    return delivered;
  }

  function closeUserConnections(userId, code = 1008, reason = "Session revoked") {
    const targetUser = String(userId || "");
    if (!targetUser) return 0;
    userRevocationGeneration.set(targetUser, ++revocationGeneration);
    let closed = 0;
    for (const socket of connections) {
      if (String(socket.agentUserId || "") !== targetUser) continue;
      cleanupSocket(socket);
      try {
        socket.close(code, reason);
        closed += 1;
      } catch {
        // The close/error handler will finish cleanup if the transport already died.
      }
    }
    return closed;
  }

  function close(callback) {
    unsubscribeBus();
    for (const socket of new Set([...connections, ...authenticating])) {
      cleanupSocket(socket);
      try { socket.close(1001, "Server shutting down"); } catch { /* ignore */ }
    }
    return wss.close(callback);
  }

  return {
    close,
    closeUserConnections,
    pushInteraction,
    pushUiDirective,
    wss,
    status: () => ({
      connections: connections.size,
      subscriptions: [...connections].reduce((total, socket) => total + (socket.agentSubscriptions?.size || 0), 0),
      uiSubscriptions: [...connections].filter((socket) => socket.agentUiSubscribed).length,
    }),
  };
}

module.exports = {
  createAgentEventBridge,
  normalizeInvocationId,
};
