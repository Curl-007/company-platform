const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createAiAssistantAdminRouter } = require("../src/modules/ai/assistantAdminRoutes");

test("AI assistant admin routes require the admin surface and audit persisted changes", async () => {
  const audits = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-ADMIN", permissions: ["*"] };
    next();
  });
  const result = {
    before: { name: "Platform AI Assistant", systemPrompt: "old" },
    after: { name: "Delivery assistant", systemPrompt: "new", resolvedModel: "local-model" },
  };
  app.use("/api", createAiAssistantAdminRouter({
    audit: async (...args) => audits.push(args),
    fail: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
    ok: (data) => ({ data }),
    requirePermission: (permission) => {
      assert.equal(permission, "admin:*");
      return (_req, _res, next) => next();
    },
    service: {
      get: async () => result.before,
      update: async (body) => {
        assert.equal(body.name, "Delivery assistant");
        return result;
      },
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/ai-assistant`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Delivery assistant" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.name, "Delivery assistant");
    assert.equal(audits.length, 1);
    assert.equal(audits[0][1], "admin.ai_assistant_update");
    assert.equal(audits[0][3], "ai_assistant");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
