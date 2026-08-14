const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createAiProviderAdminRouter } = require("../src/modules/ai/providerAdminRoutes");

test("AI Provider admin routes test an unsaved draft through Harness and select a saved Provider for discovery", async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-ADMIN", permissions: ["*"] };
    next();
  });
  app.use("/api", createAiProviderAdminRouter({
    audit: async () => {},
    callModelWithConfig: async (...args) => {
      calls.push(args);
      return "connection successful";
    },
    callRealModel: () => assert.fail("draft tests must not use the active Provider"),
    fail: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
    ok: (data) => ({ data }),
    publicConfig: async (config) => ({
      id: config.id,
      model: config.model,
      configured: Boolean(config.baseUrl && config.model),
      apiKeyMasked: config.apiKey ? "configured" : "",
    }),
    requirePermission: () => (_req, _res, next) => next(),
    service: {
      get: async () => ({}),
      listModels: async (id) => ({ id }),
      prepareTest: async (body) => ({
        id: body.id || "AIP-DRAFT",
        baseUrl: body.baseUrl,
        model: body.model,
        enabled: true,
        apiKey: body.apiKey || "",
      }),
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const testResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/ai-provider/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        createNew: true,
        baseUrl: "http://192.168.3.18:8000/v1",
        model: "grok-4.6",
      }),
    });
    const testPayload = await testResponse.json();
    assert.equal(testResponse.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].baseUrl, "http://192.168.3.18:8000/v1");
    assert.equal(calls[0][0].apiKey, "");
    assert.equal(testPayload.data.provider.apiKeyMasked, "");

    const modelsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/ai-provider/models?id=AIP-SECONDARY`);
    const modelsPayload = await modelsResponse.json();
    assert.equal(modelsResponse.status, 200);
    assert.equal(modelsPayload.data.id, "AIP-SECONDARY");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
