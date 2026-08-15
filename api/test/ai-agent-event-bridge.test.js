const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const WebSocket = require("ws");
const { createAgentEventBus } = require("../src/modules/ai/agentEventBus");
const { createAgentEventBridge } = require("../src/modules/ai/agentEventBridge");

function once(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once("error", reject);
  });
}

// Collects parsed messages until the predicate matches (or the socket closes).
function messageSink(socket) {
  const received = [];
  socket.on("message", (raw) => {
    try {
      received.push(JSON.parse(raw.toString()));
    } catch {
      // Non-JSON frames are dropped by the assertion helpers below.
    }
  });
  return {
    async next(predicate, timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = received.find(predicate);
        if (found) return found;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for message; got: ${JSON.stringify(received)}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    received,
  };
}

function createBridgeFixture({ user = { id: "USR-1", permissions: ["ai:*"] }, invocation, canAccessProject = async () => true } = {}) {
  const server = http.createServer((req, res) => {
    res.writeHead(404).end();
  });
  const bus = createAgentEventBus();
  const audits = [];
  const invocations = new Map(invocation ? [[invocation.id, invocation]] : []);
  let bridge;
  return {
    audits,
    bus,
    bridge: () => bridge,
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const { port } = server.address();
      bridge = createAgentEventBridge({
        WebSocketServer: require("ws").WebSocketServer,
        server,
        authenticateSocket: async () => user,
        hasPermission: (candidate, permission) => (candidate?.permissions || []).includes(permission),
        canAccessProject,
        capabilityRepository: { find: async (id) => invocations.get(id) || null },
        agentEventBus: bus,
        audit: async (...args) => audits.push(args),
        logger: { warn: () => {} },
      });
      return { port };
    },
    async stop() {
      await new Promise((resolve) => bridge.close(() => resolve()));
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/agent`);
  const opened = once(socket, "open");
  return { opened, socket };
}

test("agent event bridge streams subscribed invocation events to the owning connection only", { timeout: 10000 }, async () => {
  const fixture = createBridgeFixture({
    invocation: { id: "AIC-STREAM", project_id: "PRJ-1" },
  });
  const { port } = await fixture.start();
  const audits = fixture.audits;
  try {
    const subscriber = connect(port);
    const bystander = connect(port);
    await subscriber.opened;
    await bystander.opened;
    const subscriberSink = messageSink(subscriber.socket);
    const bystanderSink = messageSink(bystander.socket);

    // Events published before any subscription are not delivered.
    fixture.bus.publish({ event: { seq: 0, type: "early" }, invocationId: "AIC-STREAM" });

    subscriber.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "AIC-STREAM" }));
    await subscriberSink.next((message) => message.type === "agent.subscribed");
    assert.deepEqual(
      subscriberSink.received.filter((message) => message.type === "agent.event"),
      [],
      "events published before subscribing are not replayed",
    );

    const event = { seq: 1, type: "assistant/message", data: { text: "进行中" } };
    fixture.bus.publish({ event, invocationId: "AIC-STREAM", projectId: "PRJ-1", userId: "USR-9" });
    const delivered = await subscriberSink.next((message) => message.type === "agent.event");
    assert.deepEqual(delivered, { type: "agent.event", invocationId: "AIC-STREAM", event });

    fixture.bus.publish({ event: { seq: 2, type: "turn/end" }, invocationId: "AIC-OTHER" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      subscriberSink.received.some((message) => message.invocationId === "AIC-OTHER"),
      false,
      "invocations the connection did not subscribe to stay invisible",
    );
    assert.equal(bystanderSink.received.length, 0, "an un-subscribed connection receives nothing");

    assert.deepEqual(audits.map((entry) => entry[1]), ["ai.agent_event_stream"]);
    assert.equal(audits[0][2], "ai_capability_invocation");
    assert.equal(audits[0][3], "AIC-STREAM");
    assert.deepEqual(audits[0][5], { invocationId: "AIC-STREAM", operation: "subscribe" });
    assert.deepEqual(audits[0][7], { scopeType: "project", projectId: "PRJ-1" });

    // Unsubscribe stops delivery and is audited; no acknowledgement is defined.
    subscriber.socket.send(JSON.stringify({ type: "agent.unsubscribe", invocationId: "AIC-STREAM" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    fixture.bus.publish({ event: { seq: 3, type: "turn/end" }, invocationId: "AIC-STREAM" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      subscriberSink.received.filter((message) => message.type === "agent.event").length,
      1,
      "no events arrive after unsubscribing",
    );
    assert.deepEqual(audits.map((entry) => entry[1]), ["ai.agent_event_stream", "ai.agent_event_stream"]);
    assert.deepEqual(audits[1][5], { invocationId: "AIC-STREAM", operation: "unsubscribe" });

    subscriber.socket.close();
    bystander.socket.close();
  } finally {
    await fixture.stop();
  }
});

test("agent event bridge enforces invocation access on subscribe", { timeout: 10000 }, async () => {
  const fixture = createBridgeFixture({
    invocation: { id: "AIC-PRIVATE", project_id: "PRJ-SECRET" },
    canAccessProject: async (_user, projectId) => projectId !== "PRJ-SECRET",
  });
  const { port } = await fixture.start();
  try {
    const client = connect(port);
    await client.opened;
    const sink = messageSink(client.socket);

    client.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "AIC-MISSING" }));
    assert.deepEqual(
      await sink.next((message) => message.type === "agent.error"),
      { type: "agent.error", code: "PERMISSION_DENIED", message: "AI capability invocation not found." },
    );

    client.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "AIC-PRIVATE" }));
    assert.deepEqual(
      await sink.next((message) => message.message === "You cannot access this AI capability invocation."),
      { type: "agent.error", code: "PERMISSION_DENIED", message: "You cannot access this AI capability invocation." },
    );

    client.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "" }));
    assert.deepEqual(
      await sink.next((message) => message.message === "A valid invocationId is required."),
      { type: "agent.error", code: "VALIDATION_FAILED", message: "A valid invocationId is required." },
    );

    client.socket.send("not-json");
    assert.deepEqual(
      await sink.next((message) => message.message === "Messages must be JSON objects." && message.code === "VALIDATION_FAILED"),
      { type: "agent.error", code: "VALIDATION_FAILED", message: "Messages must be JSON objects." },
    );

    client.socket.send(JSON.stringify({ type: "agent.dance" }));
    assert.deepEqual(
      await sink.next((message) => message.code === "AGENT_BRIDGE_UNKNOWN_MESSAGE"),
      { type: "agent.error", code: "AGENT_BRIDGE_UNKNOWN_MESSAGE", message: "Unsupported message type." },
    );

    // A rejected subscribe never registers, so matching events stay invisible.
    fixture.bus.publish({ event: { type: "turn/end" }, invocationId: "AIC-PRIVATE" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sink.received.some((message) => message.type === "agent.event"), false);
    assert.deepEqual(fixture.audits, [], "denied subscribes write no audit rows");

    client.socket.close();
  } finally {
    await fixture.stop();
  }
});

test("agent event bridge rejects unauthenticated or unauthorized connections", { timeout: 10000 }, async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const bus = createAgentEventBus();
  const bridge = createAgentEventBridge({
    WebSocketServer: require("ws").WebSocketServer,
    server,
    authenticateSocket: async () => null,
    hasPermission: () => true,
    canAccessProject: async () => true,
    capabilityRepository: { find: async () => ({ id: "AIC-1", project_id: "PRJ-1" }) },
    agentEventBus: bus,
    logger: { warn: () => {} },
  });
  try {
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/agent`);
    const closed = once(client, "close");
    // The upgrade completes before async socket auth resolves; the rejection is
    // the immediate 1008 close, exactly like the collaboration channel.
    const closeCode = await closed;
    assert.equal(closeCode, 1008);
    assert.equal(bridge.status().connections, 0);
    assert.equal(bridge.status().subscriptions, 0);
  } finally {
    await new Promise((resolve) => bridge.close(() => resolve()));
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("agent event bridge pushes agent.interaction only to the target user's subscribed connections", { timeout: 10000 }, async () => {
  const fixture = createBridgeFixture({
    invocation: { id: "AIC-INTER", project_id: "PRJ-1" },
  });
  const { port } = await fixture.start();
  try {
    const subscriber = connect(port);
    const bystander = connect(port);
    await subscriber.opened;
    await bystander.opened;
    const subscriberSink = messageSink(subscriber.socket);
    const bystanderSink = messageSink(bystander.socket);

    subscriber.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "AIC-INTER" }));
    await subscriberSink.next((message) => message.type === "agent.subscribed");

    const interaction = { interactionId: "AII-1", kind: "question", phase: "created", status: "pending" };

    // Wrong target user and non-subscribed invocations deliver nothing.
    assert.equal(fixture.bridge().pushInteraction("USR-OTHER", "AIC-INTER", interaction), 0);
    assert.equal(fixture.bridge().pushInteraction("USR-1", "AIC-UNSUBSCRIBED", interaction), 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(subscriberSink.received.length, 1, "only the subscribe ack arrived");
    assert.equal(bystanderSink.received.length, 0);

    // The target user's subscribed connection receives the push.
    assert.equal(fixture.bridge().pushInteraction("USR-1", "AIC-INTER", interaction), 1);
    const delivered = await subscriberSink.next((message) => message.type === "agent.interaction");
    assert.deepEqual(delivered, { interaction, invocationId: "AIC-INTER", type: "agent.interaction" });
    assert.equal(bystanderSink.received.length, 0, "connections of other users stay untouched");

    subscriber.socket.close();
    bystander.socket.close();
  } finally {
    await fixture.stop();
  }
});
