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
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
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
