const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const test = require("node:test");
const { WebSocket } = require("ws");
const { createAgentEventBus } = require("../src/modules/ai/agentEventBus");
const { createAgentEventBridge } = require("../src/modules/ai/agentEventBridge");
const { createAiCapabilitiesRouter } = require("../src/modules/ai/capabilityRoutes");
const {
  UI_DIRECTIVE_KINDS,
  assertUiDirective,
  parseUiDirective,
} = require("../src/modules/ai/uiDirectives");

// ---------------------------------------------------------------------------
// Shared whitelist validator (gateway, REST route, dsh tool)
// ---------------------------------------------------------------------------

test("ui directive whitelist accepts every frozen kind and normalizes values", () => {
  assert.deepEqual(UI_DIRECTIVE_KINDS, [
    "theme", "fontSize", "fontFamily", "density", "accentColor",
    "contentPadding", "reduceMotion", "navigate", "openAiSidebar",
    "layout", "surfaceStyle", "viewUpsert", "viewRemove", "viewOpen",
  ]);
  assert.deepEqual(assertUiDirective({ kind: "theme", mode: "dark" }), { kind: "theme", mode: "dark" });
  assert.deepEqual(assertUiDirective({ kind: "theme", mode: "light" }), { kind: "theme", mode: "light" });
  assert.deepEqual(assertUiDirective({ kind: "fontSize", value: 15 }), { kind: "fontSize", value: 15 });
  assert.deepEqual(assertUiDirective({ kind: "fontFamily", value: "puhui" }), { kind: "fontFamily", value: "puhui" });
  assert.deepEqual(assertUiDirective({ kind: "density", value: "compact" }), { kind: "density", value: "compact" });
  assert.deepEqual(assertUiDirective({ kind: "accentColor", value: "#1A2B3C" }), { kind: "accentColor", value: "#1a2b3c" });
  assert.deepEqual(assertUiDirective({ kind: "contentPadding", value: 0 }), { kind: "contentPadding", value: 0 });
  assert.deepEqual(assertUiDirective({ kind: "contentPadding", value: 240 }), { kind: "contentPadding", value: 240 });
  assert.deepEqual(assertUiDirective({ kind: "reduceMotion", value: true }), { kind: "reduceMotion", value: true });
  assert.deepEqual(assertUiDirective({ kind: "navigate", page: "  projects  " }), { kind: "navigate", page: "projects" });
  assert.deepEqual(
    assertUiDirective({ kind: "navigate", page: "projects", focus: "  PRJ-001  ", href: "https://example.com" }),
    { kind: "navigate", page: "projects", focus: "PRJ-001" },
  );
  assert.deepEqual(assertUiDirective({ kind: "navigate", page: "dsh-ui" }), { kind: "navigate", page: "dsh-ui" });
  assert.deepEqual(assertUiDirective({ kind: "openAiSidebar", open: false }), { kind: "openAiSidebar", open: false });
  assert.deepEqual(
    assertUiDirective({ kind: "layout", surface: "projects.detail", order: ["hero", "workspace"] }),
    { kind: "layout", surface: "projects.detail", order: ["hero", "workspace"] },
  );
  assert.deepEqual(
    assertUiDirective({ kind: "layout", surface: "mywork.task-detail", order: ["status-history", "header"] }),
    { kind: "layout", surface: "mywork.task-detail", order: ["status-history", "header"] },
  );
  assert.deepEqual(
    assertUiDirective({
      kind: "surfaceStyle",
      surface: "projects.detail",
      style: { variant: "contrast", columns: 2, gap: 16, css: "display:none" },
    }),
    {
      kind: "surfaceStyle",
      surface: "projects.detail",
      style: { variant: "contrast", columns: 2, gap: 16 },
    },
  );
  assert.deepEqual(
    assertUiDirective({
      kind: "surfaceStyle",
      surface: "dashboard",
      style: { variant: "quiet", columns: 1, gap: 20 },
    }),
    {
      kind: "surfaceStyle",
      surface: "dashboard",
      style: { variant: "quiet", columns: 1, gap: 20 },
    },
  );
  assert.deepEqual(
    assertUiDirective({
      kind: "viewUpsert",
      view: {
        id: "risk-room",
        title: "风险驾驶舱",
        blocks: [
          { id: "high-risk", type: "stat", label: "高风险", value: 3, tone: "negative" },
          { id: "projects", type: "links", items: [{ label: "查看项目", page: "projects" }] },
          { id: "workspace", type: "links", items: [{ label: "智能界面", page: "dsh-ui" }] },
        ],
        html: "<script>alert(1)</script>",
      },
    }),
    {
      kind: "viewUpsert",
      view: {
        id: "risk-room",
        title: "风险驾驶舱",
        surface: "dsh-view:risk-room",
        blocks: [
          { id: "high-risk", type: "stat", label: "高风险", value: 3, tone: "negative" },
          { id: "projects", type: "links", items: [{ label: "查看项目", page: "projects" }] },
          { id: "workspace", type: "links", items: [{ label: "智能界面", page: "dsh-ui" }] },
        ],
      },
    },
  );
  assert.deepEqual(assertUiDirective({ kind: "viewRemove", viewId: "risk-room" }), { kind: "viewRemove", viewId: "risk-room" });
  assert.deepEqual(assertUiDirective({ kind: "viewOpen", viewId: "risk-room" }), { kind: "viewOpen", viewId: "risk-room" });
  // Unknown extra fields are dropped, never forwarded.
  assert.deepEqual(
    assertUiDirective({ kind: "theme", mode: "light", projectId: "PRJ-1", evil: true }),
    { kind: "theme", mode: "light" },
  );
});

test("ui directive whitelist rejects unknown kinds and out-of-range values", () => {
  const rejects = [
    null,
    "theme",
    [],
    {},
    { kind: "shell" },
    { kind: "theme" },
    { kind: "theme", mode: "blue" },
    { kind: "fontSize", value: 12 },
    { kind: "fontSize", value: 19 },
    { kind: "fontSize", value: 14.5 },
    { kind: "fontSize", value: "15" },
    { kind: "fontFamily", value: "comic-sans" },
    { kind: "density", value: "cozy" },
    { kind: "accentColor", value: "1a2b3c" },
    { kind: "accentColor", value: "#1A2B3C7" },
    { kind: "accentColor", value: 123 },
    { kind: "contentPadding", value: -1 },
    { kind: "contentPadding", value: 241 },
    { kind: "reduceMotion", value: "true" },
    { kind: "navigate", page: "   " },
    { kind: "navigate", page: "x".repeat(65) },
    { kind: "navigate", page: "definitely-not-a-page" },
    { kind: "navigate", page: "projects", focus: "../../settings" },
    { kind: "navigate", page: "projects", focus: "https://example.com" },
    { kind: "navigate", page: "projects", focus: "x".repeat(129) },
    { kind: "navigate" },
    { kind: "openAiSidebar", open: "yes" },
    { kind: "layout", surface: "Project Detail", order: ["overview"] },
    { kind: "layout", surface: "project-detail", order: ["same", "same"] },
    { kind: "layout", surface: "dashboard", order: ["summary"] },
    { kind: "layout", surface: "projects.detail", order: ["not-registered"] },
    { kind: "surfaceStyle", surface: "project-detail", style: { columns: 5 } },
    { kind: "surfaceStyle", surface: "project-detail", style: { variant: "neon" } },
    { kind: "viewUpsert", view: { id: "bad-view", title: "Bad", blocks: [{ id: "code", type: "html", html: "<b>x</b>" }] } },
    { kind: "viewUpsert", view: { id: "bad-view", title: "Bad", blocks: [{ id: "links", type: "links", items: [{ label: "External", page: "https://example.com" }] }] } },
    { kind: "viewRemove", viewId: "../bad" },
  ];
  for (const payload of rejects) {
    assert.throws(() => assertUiDirective(payload), { code: "AI_UI_DIRECTIVE_INVALID", status: 400 });
    assert.equal(parseUiDirective(payload), null);
  }
});

// ---------------------------------------------------------------------------
// REST POST /api/ai/ui-directives
// ---------------------------------------------------------------------------

function createRouteApp({ permissions = ["ai:*"], pushUiDirective } = {}) {
  const app = express();
  const audits = [];
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-1", permissions };
    req.ip = "127.0.0.1";
    next();
  });
  const ok = (data) => ({ data });
  const fail = (res, status, errorCode, message) => res.status(status).json({ errorCode, message });
  app.use("/api", createAiCapabilitiesRouter({
    audit: async (...args) => audits.push(args),
    fail,
    ok,
    pushUiDirective,
    requirePermission: (permission) => (req, res, next) => {
      if (!(req.user?.permissions || []).includes(permission)) {
        return fail(res, 403, "PERMISSION_DENIED", "Forbidden.");
      }
      return next();
    },
    repository: { find: async () => null, list: async () => ({ items: [], total: 0 }) },
    service: { listForUser: async () => [] },
  }));
  // Minimal stand-in for the platform's JSON error handler.
  app.use((error, _req, res, _next) => {
    res.status(Number(error?.status) || 500).json({ errorCode: error?.code || "INTERNAL_ERROR", message: error?.message || "failed" });
  });
  return { app, audits };
}

async function startApp(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}/api`, server };
}

test("POST /api/ai/ui-directives validates, pushes to the caller's clients, and audits", async () => {
  const pushes = [];
  let sinkCall = 0;
  const { app, audits } = createRouteApp({
    pushUiDirective: (userId, directive) => {
      pushes.push({ directive, userId });
      sinkCall += 1;
      return sinkCall === 1 ? 2 : 0;
    },
  });
  const { baseUrl, server } = await startApp(app);
  try {
    const response = await fetch(`${baseUrl}/ai/ui-directives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directive: { kind: "fontSize", value: 16 } }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { delivered: 2 } });
    assert.deepEqual(pushes, [{ directive: { kind: "fontSize", value: 16 }, userId: "USR-1" }]);
    assert.equal(audits.length, 1);
    assert.equal(audits[0][1], "ai.ui_directive.emit");
    assert.equal(audits[0][2], "ai_ui_directive");
    assert.deepEqual(audits[0][5], { delivered: 2, kind: "fontSize" });

    // Zero connected clients is a success, not an error.
    const zero = await fetch(`${baseUrl}/ai/ui-directives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directive: { kind: "openAiSidebar", open: true } }),
    });
    assert.equal(zero.status, 200);
    assert.deepEqual(await zero.json(), { data: { delivered: 0 } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/ai/ui-directives rejects invalid directives and users without ai:*", async () => {
  const { app } = createRouteApp({ pushUiDirective: () => 1 });
  const { baseUrl, server } = await startApp(app);
  try {
    const invalid = await fetch(`${baseUrl}/ai/ui-directives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directive: { kind: "shell", command: "rm -rf" } }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).errorCode, "AI_UI_DIRECTIVE_INVALID");

    const missing = await fetch(`${baseUrl}/ai/ui-directives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const { app: deniedApp, audits } = createRouteApp({ permissions: ["project:read"], pushUiDirective: () => 1 });
  const denied = await startApp(deniedApp);
  try {
    const response = await fetch(`${denied.baseUrl}/ai/ui-directives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directive: { kind: "theme", mode: "dark" } }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).errorCode, "PERMISSION_DENIED");
    assert.deepEqual(audits, []);
  } finally {
    await new Promise((resolve) => denied.server.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// /ws/agent ui channel: subscribeUi, pushUiDirective, pushInteraction mirror
// ---------------------------------------------------------------------------

function once(emitter, eventName) {
  return new Promise((resolve, reject) => {
    emitter.once(eventName, resolve);
    emitter.once("error", reject);
  });
}

function messageSink(socket) {
  const received = [];
  socket.on("message", (raw) => {
    try {
      received.push(JSON.parse(raw.toString()));
    } catch {
      // Non-JSON frames are ignored by the assertions below.
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

function createBridgeFixture({ user = { id: "USR-1", permissions: ["ai:*"] }, invocation } = {}) {
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
        canAccessProject: async () => true,
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

test("agent event bridge ui channel: subscribeUi audit, targeted pushUiDirective, unsubscribeUi", { timeout: 10000 }, async () => {
  const fixture = createBridgeFixture();
  const { port } = await fixture.start();
  try {
    const mine = connect(port);
    const otherUserSocket = connect(port);
    await mine.opened;
    await otherUserSocket.opened;
    const mineSink = messageSink(mine.socket);

    // Before subscribing, directives reach nobody.
    assert.equal(fixture.bridge().pushUiDirective("USR-1", { kind: "theme", mode: "dark" }), 0);

    mine.socket.send(JSON.stringify({ type: "agent.subscribeUi" }));
    assert.deepEqual(
      await mineSink.next((message) => message.type === "agent.subscribedUi"),
      { type: "agent.subscribedUi" },
    );
    assert.deepEqual(
      fixture.audits.map((entry) => [entry[1], entry[5]]),
      [["ai.agent_ui_stream", { operation: "subscribe" }]],
    );

    // Delivery is user-addressed: only the subscribing user's connection sees
    // the directive, and the returned count reflects delivered connections.
    assert.equal(fixture.bridge().pushUiDirective("USR-1", { kind: "navigate", page: "projects" }), 1);
    assert.deepEqual(
      await mineSink.next((message) => message.type === "agent.ui"),
      { type: "agent.ui", directive: { kind: "navigate", page: "projects" } },
    );
    assert.equal(fixture.bridge().pushUiDirective("USR-OTHER", { kind: "theme", mode: "light" }), 0);

    // Unsubscribing stops delivery and is audited like the invocation stream.
    mine.socket.send(JSON.stringify({ type: "agent.unsubscribeUi" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(fixture.bridge().pushUiDirective("USR-1", { kind: "theme", mode: "dark" }), 0);
    assert.deepEqual(
      fixture.audits.map((entry) => [entry[1], entry[5]]),
      [
        ["ai.agent_ui_stream", { operation: "subscribe" }],
        ["ai.agent_ui_stream", { operation: "unsubscribe" }],
      ],
    );

    mine.socket.close();
    otherUserSocket.socket.close();
  } finally {
    await fixture.stop();
  }
});

test("agent event bridge mirrors agent.interaction to ui subscribers exactly once", { timeout: 10000 }, async () => {
  const fixture = createBridgeFixture({ invocation: { id: "AIC-INTER", project_id: "PRJ-1" } });
  const { port } = await fixture.start();
  try {
    const invocationSubscriber = connect(port);
    const uiOnlySubscriber = connect(port);
    const bothSubscriber = connect(port);
    await invocationSubscriber.opened;
    await uiOnlySubscriber.opened;
    await bothSubscriber.opened;
    const invocationSink = messageSink(invocationSubscriber.socket);
    const uiOnlySink = messageSink(uiOnlySubscriber.socket);
    const bothSink = messageSink(bothSubscriber.socket);

    invocationSubscriber.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "AIC-INTER" }));
    await invocationSink.next((message) => message.type === "agent.subscribed");
    uiOnlySubscriber.socket.send(JSON.stringify({ type: "agent.subscribeUi" }));
    await uiOnlySink.next((message) => message.type === "agent.subscribedUi");
    bothSubscriber.socket.send(JSON.stringify({ type: "agent.subscribe", invocationId: "AIC-INTER" }));
    await bothSink.next((message) => message.type === "agent.subscribed");
    bothSubscriber.socket.send(JSON.stringify({ type: "agent.subscribeUi" }));
    await bothSink.next((message) => message.type === "agent.subscribedUi");

    const interaction = { interactionId: "AII-1", kind: "question", phase: "created", status: "pending" };
    // Invocation subscriber + both ui subscribers of the target user (the
    // dual-subscribed connection still receives exactly one frame).
    assert.equal(fixture.bridge().pushInteraction("USR-1", "AIC-INTER", interaction), 3);

    const expected = { interaction, invocationId: "AIC-INTER", type: "agent.interaction" };
    assert.deepEqual(await invocationSink.next((message) => message.type === "agent.interaction"), expected);
    assert.deepEqual(await uiOnlySink.next((message) => message.type === "agent.interaction"), expected);
    assert.deepEqual(await bothSink.next((message) => message.type === "agent.interaction"), expected);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(invocationSink.received.filter((message) => message.type === "agent.interaction").length, 1);
    assert.equal(uiOnlySink.received.filter((message) => message.type === "agent.interaction").length, 1);
    assert.equal(bothSink.received.filter((message) => message.type === "agent.interaction").length, 1);

    // Another user's ui subscriber still sees nothing.
    assert.equal(fixture.bridge().pushInteraction("USR-OTHER", "AIC-INTER", interaction), 0);

    invocationSubscriber.socket.close();
    uiOnlySubscriber.socket.close();
    bothSubscriber.socket.close();
  } finally {
    await fixture.stop();
  }
});
