const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAiCapabilitiesRouter } = require("../src/modules/ai/capabilityRoutes");

test("AI capability routes expose authorized discovery, scoped invocation, and admin control contracts", async () => {
  const permissions = [];
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-ADMIN", permissions: ["*"] };
    next();
  });
  app.use("/api", createAiCapabilitiesRouter({
    ok: (data) => ({ data }),
    requirePermission: (permission) => {
      permissions.push(permission);
      return (_req, _res, next) => next();
    },
    service: {
      getAdmin: async (id) => ({ control: { enabled: true, id }, enabled: true, id }),
      invoke: async (input) => {
        calls.push(input);
        return {
          capability: { id: input.capabilityId, version: "1.0.0" },
          invocationId: "AIC-1",
          projectId: input.input.projectId,
          status: "completed",
        };
      },
      listForUser: async (user) => [{ enabled: true, id: "project-snapshot", requestedBy: user.id }],
      updateControl: async (input) => {
        calls.push(input);
        return { control: { enabled: input.input.enabled, id: input.id }, enabled: input.input.enabled, id: input.id };
      },
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const capabilities = await fetch(`${baseUrl}/ai/capabilities`);
    assert.equal(capabilities.status, 200);
    assert.equal((await capabilities.json()).data[0].id, "project-snapshot");

    const invocation = await fetch(`${baseUrl}/ai/capabilities/project-snapshot/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    assert.equal(invocation.status, 200);
    assert.equal((await invocation.json()).data.projectId, "PRJ-1");
    assert.equal(calls[0].actor.id, "USR-ADMIN");
    assert.equal(calls[0].capabilityId, "project-snapshot");

    const admin = await fetch(`${baseUrl}/admin/ai-capabilities/project-snapshot`);
    assert.equal(admin.status, 200);
    assert.equal((await admin.json()).data.control.id, "project-snapshot");

    const updated = await fetch(`${baseUrl}/admin/ai-capabilities/project-snapshot`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false, reason: "maintenance" }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.enabled, false);
    assert.equal(calls[1].input.enabled, false);
    assert.deepEqual(permissions, ["ai:*", "ai:*", "ai:*", "ai:*", "ai:*", "ai:*", "ai:*", "ai:*", "admin:*", "admin:*"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("AI capability invocation returns the idempotency replay or in-progress response without starting a second run", async () => {
  let invokeCount = 0;
  const commits = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-ADMIN", permissions: ["*"] };
    next();
  });
  app.use("/api", createAiCapabilitiesRouter({
    beginIdempotentRequest: async (req, res, operation) => {
      const key = req.get("Idempotency-Key");
      if (key === "in-progress") {
        res.status(409).json({ errorCode: "IDEMPOTENCY_IN_PROGRESS", message: "Still processing" });
        return null;
      }
      if (key === "replay") {
        res.status(200).json({ data: { invocationId: "AIC-CACHED", status: "queued" } });
        return null;
      }
      return {
        abort: async () => {},
        commit: async (status, response) => commits.push({ operation, response, status }),
      };
    },
    ok: (data) => ({ data }),
    requirePermission: () => (_req, _res, next) => next(),
    service: {
      invoke: async () => {
        invokeCount += 1;
        return { invocationId: "AIC-LIVE", status: "queued" };
      },
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const live = await fetch(`${baseUrl}/ai/capabilities/project-snapshot/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "live" },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    assert.equal(live.status, 200);
    assert.equal(invokeCount, 1);
    assert.deepEqual(commits, [{
      operation: "ai.capability.invoke",
      response: { data: { invocationId: "AIC-LIVE", status: "queued" } },
      status: 200,
    }]);

    const pending = await fetch(`${baseUrl}/ai/capabilities/project-snapshot/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "in-progress" },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    assert.equal(pending.status, 409);
    assert.equal((await pending.json()).errorCode, "IDEMPOTENCY_IN_PROGRESS");

    const replay = await fetch(`${baseUrl}/ai/capabilities/project-snapshot/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "replay" },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { data: { invocationId: "AIC-CACHED", status: "queued" } });
    assert.equal(invokeCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("browser screenshot artifacts are limited to the invoking actor or admins", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-shots-"));
  fs.writeFileSync(path.join(dir, "AIC-SHOT.png"), "fake-png-bytes");
  const invocations = {
    "AIC-SHOT": { id: "AIC-SHOT", project_id: "PRJ-1", actor_id: "USR-ACTOR" },
  };
  let currentUser = { id: "USR-VIEWER", role: "pm", permissions: ["ai:*", "project:*"] };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    next();
  });
  app.use("/api", createAiCapabilitiesRouter({
    browserScreenshotDir: dir,
    canAccessProject: async () => true,
    fail: (res, status, errorCode, message) => res.status(status).json({ errorCode, message }),
    fsImpl: fs,
    hasPermission: (user, permission) => Array.isArray(user?.permissions)
      && (user.permissions.includes(permission) || user.permissions.includes("*")),
    ok: (data) => ({ data }),
    requirePermission: () => (_req, _res, next) => next(),
    repository: { find: async (id) => invocations[id] || null },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    // A different ai:* project member cannot read the actor's screenshot.
    const forbidden = await fetch(`${baseUrl}/ai/browser/screenshots/AIC-SHOT`);
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).errorCode, "PERMISSION_DENIED");

    currentUser = { id: "USR-ACTOR", role: "pm", permissions: ["ai:*", "project:*"] };
    const own = await fetch(`${baseUrl}/ai/browser/screenshots/AIC-SHOT`);
    assert.equal(own.status, 200);
    assert.equal(await own.text(), "fake-png-bytes");

    currentUser = { id: "USR-ADMIN", role: "admin", permissions: ["*"] };
    const admin = await fetch(`${baseUrl}/ai/browser/screenshots/AIC-SHOT`);
    assert.equal(admin.status, 200);

    currentUser = { id: "USR-VIEWER", role: "pm", permissions: ["ai:*", "project:*"] };
    const missing = await fetch(`${baseUrl}/ai/browser/screenshots/AIC-MISSING`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
