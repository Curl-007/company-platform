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
    const invocationId = normalizeInvocationId(message.invocationId);
    if (!invocationId) {
      sendJson(socket, { type: "agent.error", code: "VALIDATION_FAILED", message: "A valid invocationId is required." });
      return;
    }
    if (!hasPermission(user, "ai:*")) {
      sendJson(socket, { type: "agent.error", code: "PERMISSION_DENIED", message: "You cannot subscribe to agent event streams." });
      return;
    }
    const record = await capabilityRepository.find(invocationId);
    if (!record) {
      sendJson(socket, { type: "agent.error", code: "PERMISSION_DENIED", message: "AI capability invocation not found." });
      return;
    }
    if (!(await canAccessProject(user, record.project_id))) {
      sendJson(socket, { type: "agent.error", code: "PERMISSION_DENIED", message: "You cannot access this AI capability invocation." });
      return;
    }
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

  wss.on("connection", (socket, req) => {
    void (async () => {
      const user = await authenticateSocket(req);
      if (!user || !hasPermission(user, "ai:*")) return socket.close(1008, "Unauthorized");
      socket.agentSubscriptions = new Map();
      socket.agentUiSubscribed = false;
      // Sprint 5.1 interaction push targets: server-initiated messages are
      // user-addressed, so the connection keeps its authenticated identity.
      socket.agentUserId = user.id;
      connections.add(socket);
      socket.on("message", (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          sendJson(socket, { type: "agent.error", code: "VALIDATION_FAILED", message: "Messages must be JSON objects." });
          return;
        }
        if (!message || typeof message !== "object") {
          sendJson(socket, { type: "agent.error", code: "VALIDATION_FAILED", message: "Messages must be JSON objects." });
          return;
        }
        if (message.type === "agent.subscribe") {
          handleSubscribe(socket, user, message, req.socket.remoteAddress).catch((error) => {
            logger?.warn?.("Agent event subscribe failed:", error?.message || error);
            sendJson(socket, { type: "agent.error", code: "AGENT_BRIDGE_SUBSCRIBE_FAILED", message: "Subscription could not be established." });
          });
        } else if (message.type === "agent.unsubscribe") {
          handleUnsubscribe(socket, user, message, req.socket.remoteAddress);
        } else if (message.type === "agent.subscribeUi") {
          handleSubscribeUi(socket, user, req.socket.remoteAddress);
        } else if (message.type === "agent.unsubscribeUi") {
          handleUnsubscribeUi(socket, user, req.socket.remoteAddress);
        } else {
          sendJson(socket, { type: "agent.error", code: "AGENT_BRIDGE_UNKNOWN_MESSAGE", message: "Unsupported message type." });
        }
      });
      socket.on("close", () => {
        socket.agentSubscriptions?.clear();
        socket.agentUiSubscribed = false;
        connections.delete(socket);
      });
      socket.on("error", () => {
        socket.agentSubscriptions?.clear();
        socket.agentUiSubscribed = false;
        connections.delete(socket);
      });
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
      if (socket.agentUserId !== targetUser) continue;
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
      if (socket.agentUserId !== targetUser) continue;
      if (!socket.agentUiSubscribed) continue;
      sendJson(socket, { type: "agent.ui", directive });
      delivered += 1;
    }
    return delivered;
  }

  function close(callback) {
    unsubscribeBus();
    for (const socket of connections) {
      socket.agentSubscriptions?.clear();
      socket.agentUiSubscribed = false;
      try { socket.close(1001, "Server shutting down"); } catch { /* ignore */ }
    }
    connections.clear();
    return wss.close(callback);
  }

  return {
    close,
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
