const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const { createWorkflowRepository } = require("../src/modules/workflow/repository");
const { createWorkflowRouter } = require("../src/modules/workflow/routes");
const { createProjectFlowService } = require("../src/modules/workflow/service");

test("workflow service uses the feature repository for every database read", async () => {
  const calls = [];
  const repository = createWorkflowRepository({
    row: async (sql, params) => {
      calls.push({ type: "row", sql, params });
      if (sql.includes("FROM projects")) {
        return { id: "PRJ-1", name: "Demo", status: "active", health_score: 80, product_id: null };
      }
      return null;
    },
    rows: async (sql, params) => {
      calls.push({ type: "rows", sql, params });
      if (sql.includes("FROM tasks")) return [{ status: "done", estimated_hours: 1, actual_hours: 1, remaining_hours: 0 }];
      return [];
    },
  });
  const service = createProjectFlowService({
    repository,
    getProjectBinding: async () => ({ templateId: "fixed-project-delivery-v1", templateVersion: "2026-07-15", source: "default" }),
    getTemplate: async () => null,
  });

  const flow = await service.evaluateProjectFlow("PRJ-1");
  assert.equal(flow.projectId, "PRJ-1");
  assert.equal(flow.counts.tasks, 1);
  assert.equal(calls.filter((call) => call.type === "rows").length, 5);
  assert.match(calls.at(-1).sql, /FROM releases/);
});

test("workflow routes adapt the existing project repository behind the local boundary", async (t) => {
  const calls = [];
  const projectRepository = {
    async findProjectId(id) {
      calls.push({ method: "findProjectId", id });
      return id === "PRJ-1" ? { id } : null;
    },
    async listProjectFlowSummaries() {
      calls.push({ method: "listProjectFlowSummaries" });
      return [{ id: "PRJ-1", name: "Demo", status: "active", health_score: 80 }];
    },
  };
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: "USR-1" };
    next();
  });
  app.use(createWorkflowRouter({
    audit: async () => {},
    canAccessProject: async () => true,
    canManageProject: async () => true,
    evaluateProjectFlow: async () => ({ gates: [{ stage: "release", state: "passed", label: "Release" }] }),
    fail: (res, status, errorCode, message) => res.status(status).json({ errorCode, message }),
    ok: (data) => ({ data }),
    repository: projectRepository,
    templateStore: {},
    workflowTemplates: () => [],
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/flow/overview`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].projectId, "PRJ-1");
  assert.deepEqual(calls, [{ method: "listProjectFlowSummaries" }]);
});
