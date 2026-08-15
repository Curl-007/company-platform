const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
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
