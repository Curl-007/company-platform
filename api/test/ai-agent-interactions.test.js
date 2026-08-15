const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { hasPermission, publicUser } = require("../src/security/accessControl");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createExecutionGateway } = require("../src/modules/ai/executionGateway");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");
const { createAgentInteractionService } = require("../src/modules/ai/agentInteractionsService");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");

const SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, status TEXT DEFAULT 'active', permissions TEXT
  );
  CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, owner TEXT, status TEXT DEFAULT 'in_progress', deleted_at TEXT);
  CREATE TABLE ai_capability_invocations (
    id TEXT PRIMARY KEY, capability_id TEXT, capability_version TEXT, status TEXT,
    actor_id TEXT, project_id TEXT, created_at TEXT
  );
  CREATE TABLE ai_interactions (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
    invocation_id TEXT NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, responded_at TEXT, responded_by TEXT, response TEXT
  );
  CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT, resource_type TEXT,
    resource_id TEXT, before_json TEXT, after_json TEXT, ip TEXT, scope_type TEXT DEFAULT 'global',
    project_id TEXT, subject_user_id TEXT, created_at TEXT
  );
`;

function nowIso() {
  return new Date().toISOString();
}

function createFixture({ allowProject = true, timeoutMs = 30 * 60 * 1000, waitPollMs = 25 * 1000 } = {}) {
  const dbRuntime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  dbRuntime.exec(SCHEMA);
  const access = createSqliteAccess(dbRuntime);
  const json = (value, fallback = null) => (value === undefined ? fallback : JSON.stringify(value));
  const seed = async () => {
    await access.insert("users", { id: "USR-1", name: "Initiator", email: "i@example.com", role: "pm", status: "active", permissions: json(["ai:*"]) });
    await access.insert("users", { id: "USR-2", name: "Project Peer", email: "p@example.com", role: "pm", status: "active", permissions: json(["ai:*"]) });
    await access.insert("users", { id: "USR-3", name: "Outsider", email: "o@example.com", role: "guest", status: "active", permissions: json([]) });
    await access.insert("projects", { id: "PRJ-1", name: "Apollo", owner: "USR-1", status: "in_progress", deleted_at: null });
    await access.insert("ai_capability_invocations", {
      id: "AIC-1", capability_id: "project-snapshot", capability_version: "1.0.0", status: "running",
      actor_id: "USR-1", project_id: "PRJ-1", created_at: nowIso(),
    });
  };
  const audits = [];
  const notifications = [];
  const tokenService = createScopedExecutionTokenService({ secret: "interaction-test-secret-16" });
  const service = createAgentInteractionService({
    audit: async (actor, action, resourceType, resourceId, before, after, ip, scope) => {
      audits.push({ actor, action, after, ip, resourceId, resourceType, scope });
    },
    canAccessProject: async (user, projectId) => allowProject && user.id !== "USR-3" && projectId === "PRJ-1",
    findInvocation: async (id) => (id === "AIC-1" ? { id, project_id: "PRJ-1" } : null),
    hasPermission,
    insert: access.insert,
    json,
    now: () => nowIso(),
    notifyInteraction: (userId, invocationId, interaction) => notifications.push({ interaction, invocationId, userId }),
    publicUser,
    row: access.row,
    rows: access.rows,
    run: access.run,
    timeoutMs,
    tokenService,
    waitPollMs,
  });
  const gateway = createExecutionGateway({
    audit: async () => {},
    canAccessProject: async () => allowProject,
    controlStore: { get: async () => ({ enabled: true }) },
    hasPermission,
    insert: access.insert,
    interactionHandler: service.loopbackHandler,
    json,
    nextId: async (prefix) => `${prefix}-FIXTURE`,
    now: () => nowIso(),
    publicUser,
    registry: createCapabilityRegistry(),
    row: access.row,
    rows: access.rows,
    tokenService,
  });
  const issue = (overrides = {}) => tokenService.issue({
    actorId: "USR-1",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-1",
    projectId: "PRJ-1",
    ...overrides,
  });
  const users = {
    initiator: { id: "USR-1", name: "Initiator", role: "pm", permissions: ["ai:*"] },
    peer: { id: "USR-2", name: "Project Peer", role: "pm", permissions: ["ai:*"] },
    outsider: { id: "USR-3", name: "Outsider", role: "guest", permissions: [] },
  };
  return { access, audits, gateway, issue, notifications, seed, service, tokenService, users };
}

const QUESTION_BODY = {
  kind: "question",
  payload: {
    questions: [
      {
        id: "q1",
        question: "Which delivery template applies?",
        options: [{ label: "Fixed delivery" }, { label: "Lightweight" }],
      },
    ],
  },
};

const APPROVAL_BODY = {
  kind: "approval",
  payload: { toolName: "requirement_create", reason: "Create a draft requirement" },
};

async function createLoopbackInteraction(baseUrl, token, body) {
  const response = await fetch(`${baseUrl}/v1/interaction`, {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  });
  return { payload: await response.json().catch(() => null), status: response.status };
}

async function waitForInteraction(baseUrl, interactionId, waitToken) {
  return fetch(`${baseUrl}/v1/interaction/${interactionId}/wait`, {
    headers: { "x-wait-token": waitToken },
    method: "GET",
  });
}

test("interaction lifecycle: loopback create -> long-poll wake on respond -> answered payload", { timeout: 15000 }, async () => {
  const fixture = createFixture();
  await fixture.seed();
  const baseUrl = await fixture.gateway.start();
  try {
    const created = await createLoopbackInteraction(baseUrl, fixture.issue().token, QUESTION_BODY);
    assert.equal(created.status, 200);
    const handle = created.payload.data;
    assert.match(handle.interactionId, /^AII-/);
    assert.equal(typeof handle.waitToken, "string");
    assert.equal(typeof handle.waitMs, "number");

    // Creation audits and pushes before any answer exists.
    assert.equal(fixture.audits.some((entry) => entry.action === "ai.interaction_created" && entry.resourceId === handle.interactionId), true);
    assert.equal(fixture.notifications.length, 1);
    assert.equal(fixture.notifications[0].userId, "USR-1");
    assert.equal(fixture.notifications[0].invocationId, "AIC-1");

    // The pending row is visible to the initiator through the service list.
    const pending = await fixture.service.listForUser(fixture.users.initiator, { status: "pending" });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].payload.questions[0].id, "q1");

    const waitTask = waitForInteraction(baseUrl, handle.interactionId, handle.waitToken).then((response) => response.json());
    await new Promise((resolve) => setImmediate(resolve));
    const answered = await fixture.service.respond({
      body: { answer: { answers: [{ id: "q1", selected: ["Lightweight"] }] } },
      id: handle.interactionId,
      ip: "127.0.0.1",
      user: fixture.users.initiator,
    });
    assert.equal(answered.status, "answered");
    assert.deepEqual(answered.response.answers, [{ id: "q1", selected: ["Lightweight"] }]);

    const waitPayload = await waitTask;
    assert.deepEqual(waitPayload.data, {
      response: { answers: [{ id: "q1", selected: ["Lightweight"] }] },
      status: "answered",
    });
    assert.equal(fixture.audits.some((entry) => entry.action === "ai.interaction_responded"), true);

    // A re-poll after settlement is idempotent and replays the final answer.
    const replay = await waitForInteraction(baseUrl, handle.interactionId, handle.waitToken);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).data.status, "answered");
  } finally {
    await fixture.gateway.close();
  }
});

test("approval interactions store the decision and cancel by the initiator resolves cancelled", { timeout: 15000 }, async () => {
  const fixture = createFixture();
  await fixture.seed();
  const baseUrl = await fixture.gateway.start();
  try {
    const created = await createLoopbackInteraction(baseUrl, fixture.issue().token, APPROVAL_BODY);
    assert.equal(created.status, 200);
    const handle = created.payload.data;

    const waitTask = waitForInteraction(baseUrl, handle.interactionId, handle.waitToken).then((response) => response.json());
    await new Promise((resolve) => setImmediate(resolve));
    const cancelled = await fixture.service.cancel({ id: handle.interactionId, ip: "127.0.0.1", user: fixture.users.initiator });
    assert.equal(cancelled.status, "cancelled");
    assert.equal((await waitTask).data.status, "cancelled");
    assert.equal(fixture.audits.some((entry) => entry.action === "ai.interaction_cancelled"), true);

    // A settled interaction rejects further answers.
    await assert.rejects(
      () => fixture.service.respond({
        body: { decision: "approve" },
        id: handle.interactionId,
        ip: "127.0.0.1",
        user: fixture.users.initiator,
      }),
      { code: "AI_INTERACTION_ALREADY_SETTLED", status: 409 },
    );

    // A fresh approval round-trips the decision payload.
    const second = await createLoopbackInteraction(baseUrl, fixture.issue().token, APPROVAL_BODY);
    const secondHandle = second.payload.data;
    const approved = await fixture.service.respond({
      body: { decision: "approve" },
      id: secondHandle.interactionId,
      ip: "127.0.0.1",
      user: fixture.users.peer,
    });
    assert.equal(approved.status, "answered");
    assert.deepEqual(approved.response, { decision: "approve" });
    const finalWait = await waitForInteraction(baseUrl, secondHandle.interactionId, secondHandle.waitToken);
    assert.deepEqual((await finalWait.json()).data, { response: { decision: "approve" }, status: "answered" });
  } finally {
    await fixture.gateway.close();
  }
});

test("expired pending interactions are swept to timed_out and wake the long poll", { timeout: 15000 }, async () => {
  const fixture = createFixture({ timeoutMs: 60, waitPollMs: 10_000 });
  await fixture.seed();
  const baseUrl = await fixture.gateway.start();
  try {
    const created = await createLoopbackInteraction(baseUrl, fixture.issue().token, QUESTION_BODY);
    const handle = created.payload.data;
    await new Promise((resolve) => setTimeout(resolve, 80));

    const waitTask = waitForInteraction(baseUrl, handle.interactionId, handle.waitToken).then((response) => response.json());
    const swept = await fixture.service.sweepTimeouts();
    assert.equal(swept, 1);
    assert.equal((await waitTask).data.status, "timed_out");
    assert.equal(fixture.audits.some((entry) => entry.action === "ai.interaction_timed_out"), true);

    const pendingAfter = await fixture.service.listForUser(fixture.users.initiator, { status: "pending" });
    assert.equal(pendingAfter.length, 0);
    const timedOut = await fixture.service.listForUser(fixture.users.initiator, { status: "timed_out" });
    assert.equal(timedOut.length, 1);
  } finally {
    await fixture.gateway.close();
  }
});

test("empty long polls return continue so the child reconnects", { timeout: 15000 }, async () => {
  const fixture = createFixture({ waitPollMs: 80 });
  await fixture.seed();
  const baseUrl = await fixture.gateway.start();
  try {
    const created = await createLoopbackInteraction(baseUrl, fixture.issue().token, QUESTION_BODY);
    const handle = created.payload.data;
    const started = Date.now();
    const response = await waitForInteraction(baseUrl, handle.interactionId, handle.waitToken);
    const payload = await response.json();
    assert.equal(payload.data.status, "continue");
    assert.ok(Date.now() - started >= 70, "the poll held open for the configured window");
  } finally {
    await fixture.gateway.close();
  }
});

test("loopback routes fail closed: bad creation token, bad wait token, unknown routes", { timeout: 15000 }, async () => {
  const fixture = createFixture();
  await fixture.seed();
  const baseUrl = await fixture.gateway.start();
  try {
    const anonymous = await createLoopbackInteraction(baseUrl, "not-a-token", QUESTION_BODY);
    assert.equal(anonymous.status, 401);

    // A dedicated 20ms-TTL token service proves creation fails closed once
    // the scoped execution token is past its short lifetime. The token is
    // issued and expired BEFORE the request is sent.
    const shortLived = createScopedExecutionTokenService({ secret: "interaction-test-secret-16", ttlMs: 20 });
    const expiredToken = shortLived.issue({
      actorId: "USR-1",
      capabilityId: "project-snapshot",
      capabilityVersion: "1.0.0",
      invocationId: "AIC-1",
      projectId: "PRJ-1",
    }).token;
    await new Promise((resolve) => setTimeout(resolve, 40));
    const expiredResponse = await createLoopbackInteraction(baseUrl, expiredToken, QUESTION_BODY);
    assert.equal(expiredResponse.status, 401);
    assert.equal(expiredResponse.payload.error.code, "AI_CAPABILITY_TOKEN_EXPIRED");

    const created = await createLoopbackInteraction(baseUrl, fixture.issue().token, QUESTION_BODY);
    const handle = created.payload.data;
    const badWait = await waitForInteraction(baseUrl, handle.interactionId, "forged-wait-token");
    assert.equal(badWait.status, 401);
    const missing = await fetch(`${baseUrl}/v1/interaction/AII-unknown/wait`, { headers: { "x-wait-token": "x" } });
    assert.equal(missing.status, 401);

    const unknownMethod = await fetch(`${baseUrl}/v1/interaction`, { method: "DELETE" });
    assert.equal(unknownMethod.status, 404);
    // Non-interaction routes keep the gateway's own 404 contract.
    const untouched = await fetch(`${baseUrl}/v1/anything-else`, { method: "POST" });
    assert.equal(untouched.status, 404);
    assert.equal((await untouched.json()).error.code, "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN");

    // Scope mismatch: a token scoped to another invocation cannot ask.
    const scoped = await createLoopbackInteraction(baseUrl, fixture.issue({ invocationId: "AIC-2" }).token, QUESTION_BODY);
    assert.equal(scoped.status, 403);
  } finally {
    await fixture.gateway.close();
  }
});

test("platform access control: outsiders are denied, project peers may answer, only initiators cancel", { timeout: 15000 }, async () => {
  const fixture = createFixture();
  await fixture.seed();
  const baseUrl = await fixture.gateway.start();
  try {
    const created = await createLoopbackInteraction(baseUrl, fixture.issue().token, QUESTION_BODY);
    const handle = created.payload.data;

    await assert.rejects(
      () => fixture.service.respond({
        body: { answer: { answers: [{ id: "q1", selected: ["Fixed delivery"] }] } },
        id: handle.interactionId,
        ip: "127.0.0.1",
        user: fixture.users.outsider,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
    await assert.rejects(
      () => fixture.service.cancel({ id: handle.interactionId, ip: "127.0.0.1", user: fixture.users.peer }),
      { code: "PERMISSION_DENIED", status: 403 },
    );

    // Visibility: the outsider never sees the pending interaction.
    const outsiderList = await fixture.service.listForUser(fixture.users.outsider, { status: "pending" });
    assert.equal(outsiderList.length, 0);

    // A project peer with ai:* may answer on behalf of the initiator.
    const answered = await fixture.service.respond({
      body: { answer: { answers: [{ id: "q1", selected: ["Fixed delivery"] }] } },
      id: handle.interactionId,
      ip: "127.0.0.1",
      user: fixture.users.peer,
    });
    assert.equal(answered.status, "answered");
    assert.equal(answered.respondedBy, "USR-2");

    // Invalid answers never reach the runtime.
    const second = await createLoopbackInteraction(baseUrl, fixture.issue().token, QUESTION_BODY);
    await assert.rejects(
      () => fixture.service.respond({
        body: { answer: { answers: [{ id: "q1", selected: ["Not offered"] }] } },
        id: second.payload.data.interactionId,
        ip: "127.0.0.1",
        user: fixture.users.initiator,
      }),
      { code: "VALIDATION_FAILED", status: 400 },
    );
  } finally {
    await fixture.gateway.close();
  }
});

test("platform REST routes list, respond, and cancel pending interactions", { timeout: 15000 }, async () => {
  const fixture = createFixture();
  await fixture.seed();
  const express = require("express");
  const http = require("node:http");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = fixture.users.initiator;
    req.ip = "127.0.0.1";
    next();
  });
  app.use("/api", require("../src/modules/ai/agentInteractionsRoutes").createAgentInteractionsRouter({
    fail: (res, status, code, message) => { res.status(status).json({ error: { code, message } }); },
    ok: (data) => ({ data }),
    requirePermission: () => (_req, _res, next) => next(),
    service: fixture.service,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const created = await createLoopbackInteraction(await fixture.gateway.start(), fixture.issue().token, APPROVAL_BODY);
    const id = created.payload.data.interactionId;

    const listed = await fetch(`${base}/ai/interactions?status=pending`);
    assert.equal(listed.status, 200);
    const listPayload = await listed.json();
    assert.equal(listPayload.data.items.length, 1);
    assert.equal(listPayload.data.items[0].interactionId, id);

    const invalid = await fetch(`${base}/ai/interactions/${id}/respond`, {
      body: JSON.stringify({ decision: "maybe" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(invalid.status, 400);

    const responded = await fetch(`${base}/ai/interactions/${id}/respond`, {
      body: JSON.stringify({ decision: "reject" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(responded.status, 200);
    assert.equal((await responded.json()).data.status, "answered");

    const settled = await fetch(`${base}/ai/interactions/${id}/cancel`, { method: "POST" });
    assert.equal(settled.status, 409);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    await fixture.gateway.close();
  }
});

// ---------------------------------------------------------------------------
// Bridge plugin unit tests: the child-side seam mapping against a stubbed
// interaction channel (fail-closed question errors, approval outcome map).
// ---------------------------------------------------------------------------

test("company-ask-bridge maps the loopback protocol onto the interaction seams", { timeout: 15000 }, async () => {
  const plugin = await import("../config/harness/company-ask-bridge.mjs");
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.DSH_EXECUTION_TOKEN;
  const originalUrl = process.env.DSH_EXECUTION_GATEWAY_URL;
  process.env.DSH_EXECUTION_TOKEN = "bridge-test-token";
  process.env.DSH_EXECUTION_GATEWAY_URL = "http://127.0.0.1:9";

  const calls = [];
  const stubFetch = (script) => async (input, init) => {
    calls.push({ init, url: String(input) });
    const step = script.shift();
    if (!step) throw new Error("channel exhausted");
    if (step === "network") throw new Error("ECONNREFUSED");
    return new Response(JSON.stringify(step), { headers: { "content-type": "application/json" }, status: 200 });
  };
  const questionRequest = {
    questions: [{ id: "q1", question: "Template?", options: [{ label: "Fixed" }, { label: "Light" }] }],
    signal: new AbortController().signal,
  };

  try {
    // 1. Answered question returns the structured answers.
    globalThis.fetch = stubFetch([
      { data: { interactionId: "AII-1", waitMs: 25, waitToken: "wait-1" } },
      { data: { status: "continue" } },
      { data: { status: "answered", response: { answers: [{ id: "q1", selected: ["Light"] }] } } },
    ]);
    const providers = {};
    const listeners = {};
    plugin.apply({
      on: (event, listener) => { listeners[event] = listener; },
      userQuestions: { registerProvider: (provider) => { providers.ask = provider.ask; } },
    });
    assert.equal(typeof providers.ask, "function");
    assert.equal(typeof listeners["approval/request"], "function");
    const answer = await providers.ask(questionRequest);
    assert.deepEqual(answer, { answers: [{ id: "q1", selected: ["Light"] }] });
    assert.equal(calls[0].init.headers.Authorization, "Bearer bridge-test-token");
    assert.deepEqual(JSON.parse(calls[0].init.body), { kind: "question", payload: questionRequest.payload ?? {
      questions: [{ id: "q1", options: [{ label: "Fixed" }, { label: "Light" }], question: "Template?" }],
    } });
    assert.equal(calls[1].init.headers["x-wait-token"], "wait-1");

    // 2. Cancelled question fails closed with a thrown error.
    globalThis.fetch = stubFetch([
      { data: { interactionId: "AII-2", waitMs: 25, waitToken: "wait-2" } },
      { data: { status: "cancelled" } },
    ]);
    await assert.rejects(() => providers.ask(questionRequest), { code: "AI_INTERACTION_CANCELLED" });

    // 3. Unreachable channel fails the question closed (raw network error).
    globalThis.fetch = stubFetch(["network"]);
    await assert.rejects(() => providers.ask(questionRequest), /ECONNREFUSED/);

    // 4. Approval mapping: approve / reject / cancelled / unavailable.
    const approvalRequest = { callId: "call-1", reason: "Create a draft", signal: new AbortController().signal, toolName: "requirement_create" };
    globalThis.fetch = stubFetch([
      { data: { interactionId: "AII-3", waitMs: 25, waitToken: "wait-3" } },
      { data: { status: "answered", response: { decision: "approve" } } },
    ]);
    assert.equal(await listeners["approval/request"](approvalRequest, () => "unreachable-next"), "allowed-once");
    globalThis.fetch = stubFetch([
      { data: { interactionId: "AII-4", waitMs: 25, waitToken: "wait-4" } },
      { data: { status: "answered", response: { decision: "reject" } } },
    ]);
    assert.equal(await listeners["approval/request"](approvalRequest, () => "unreachable-next"), "rejected");
    globalThis.fetch = stubFetch([
      { data: { interactionId: "AII-5", waitMs: 25, waitToken: "wait-5" } },
      { data: { status: "timed_out" } },
    ]);
    assert.equal(await listeners["approval/request"](approvalRequest, () => "unreachable-next"), "cancelled");
    globalThis.fetch = stubFetch(["network"]);
    assert.equal(await listeners["approval/request"](approvalRequest, () => "unreachable-next"), "unavailable");
    assert.deepEqual(JSON.parse(calls.at(-1).init.body), {
      kind: "approval",
      payload: { callId: "call-1", reason: "Create a draft", toolName: "requirement_create" },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.DSH_EXECUTION_TOKEN;
    else process.env.DSH_EXECUTION_TOKEN = originalToken;
    if (originalUrl === undefined) delete process.env.DSH_EXECUTION_GATEWAY_URL;
    else process.env.DSH_EXECUTION_GATEWAY_URL = originalUrl;
  }
});

