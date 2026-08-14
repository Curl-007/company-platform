const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createAiInteractionsRouter } = require("../src/modules/ai/interactionsRoutes");

test("AI summary route uses stable fresh cache keys and project-id scoped data", async () => {
  const calls = [];
  const sqlCalls = [];
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: "U-1", name: "Alice", role: "dev", permissions: ["ai:*"] };
    next();
  });
  app.use("/api", createAiInteractionsRouter({
    createAiSummary: async (_scope, _metrics, options) => {
      calls.push(options);
      return { title: "t", summary: "s", risks: [], recommendations: [], generatedBy: "test", modelUsed: "test" };
    },
    ok: (data) => ({ data }),
    publicAiAssistantConfig: async () => ({
      name: "Platform AI Assistant",
      enabled: true,
      providerId: null,
      model: "",
      resolvedProviderId: "AIP-1",
      resolvedModel: "assistant-model",
      systemPromptConfigured: true,
      temperature: 0.25,
      maxTokens: 1800,
    }),
    publicAiProviderConfig: async () => ({ configured: false, enabled: true, providers: [] }),
    requirePermission: () => (_req, _res, next) => next(),
    resolveAccessScope: async () => ({ projectIds: ["PRJ-1"] }),
    row: async (sql, params) => {
      sqlCalls.push({ sql, params });
      return { c: 1 };
    },
    rows: async (sql, params) => {
      sqlCalls.push({ sql, params });
      if (sql.includes("FROM ai_jobs")) {
        return [
          { job_id: "JOB-1", scene: "document_analysis", status: "done", progress: 100, project_id: "PRJ-1" },
          { job_id: "JOB-2", scene: "document_analysis", status: "done", progress: 100, project_id: "PRJ-2" },
        ];
      }
      return [];
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/ai/summary?fresh=1`;
    const first = await fetch(url);
    const second = await fetch(url);
    const firstPayload = await first.json();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstPayload.data.aiAssistant.resolvedModel, "assistant-model");
    assert.equal(Object.hasOwn(firstPayload.data.aiAssistant, "systemPrompt"), false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].skipCache, true);
    assert.equal(calls[0].cacheKey, calls[1].cacheKey);
    assert.deepEqual(calls[0].accessScope, { projectIds: ["PRJ-1"] });
    const jobQuery = sqlCalls.find((item) => item.sql.includes("FROM ai_jobs"));
    const logQuery = sqlCalls.find((item) => item.sql.includes("FROM work_logs"));
    assert.match(jobQuery.sql, /project_id/);
    assert.equal(jobQuery.params.projectId0, "PRJ-1");
    assert.match(logQuery.sql, /WHERE project_id IN/);
    assert.doesNotMatch(logQuery.sql, /WHERE project IN/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("AI chat ignores a caller-supplied model and reports the resolved platform assistant", async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "U-1", name: "Alice", role: "dev", permissions: ["ai:*"] };
    next();
  });
  app.use("/api", createAiInteractionsRouter({
    audit: async () => {},
    buildAiChatContext: async () => ({ projects: [] }),
    buildAiChatPrompt: async () => "auditable chat prompt",
    callRealModel: async (...args) => {
      calls.push(args);
      return "Assistant reply";
    },
    fail: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
    localAiChatReply: async () => "Local reply",
    normalizeAttachments: () => [],
    normalizeMessages: (messages) => messages || [],
    now: () => "2026-08-14T00:00:00.000Z",
    ok: (data) => ({ data }),
    publicAiAssistantConfig: async () => ({
      name: "Delivery assistant",
      enabled: true,
      providerId: "AIP-2",
      model: "",
      resolvedProviderId: "AIP-2",
      resolvedModel: "assistant-model",
      temperature: 0.4,
      maxTokens: 1600,
      systemPromptConfigured: true,
    }),
    publicAiProviderConfig: async () => ({ provider: "openai-compatible", model: "active-model" }),
    requirePermission: () => (_req, _res, next) => next(),
    resolveAccessScope: async () => ({ projectIds: [] }),
    row: async () => null,
    rows: async () => [],
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What is at risk?" }], model: "untrusted-model" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].model, undefined);
    assert.equal(payload.data.modelUsed, "assistant-model");
    assert.equal(payload.data.aiAssistant.resolvedProviderId, "AIP-2");
    assert.equal(Object.hasOwn(payload.data.aiAssistant, "systemPrompt"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
