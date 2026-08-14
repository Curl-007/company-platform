const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { wrapRouterAsync } = require("../src/lib/asyncHandler");
const { createTestingRouter } = require("../src/modules/testing/routes");

async function withServer(repository, work) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-1", name: "Alice", role: "admin" };
    next();
  });
  app.use("/api", wrapRouterAsync(createTestingRouter({
    audit: async () => {},
    canAccessProject: async () => true,
    canWriteProject: async () => true,
    ensureRoleAllowed: () => null,
    fail: (res, status, errorCode, message, details) => res.status(status).json({ errorCode, message, details }),
    mapTestCase: (item) => item,
    mapTestRun: (item) => ({ id: item.id, result: item.result, testCaseId: item.test_case_id }),
    nextId: async () => "TR-1",
    now: () => "2026-08-14T00:00:00.000Z",
    ok: (data) => ({ data }),
    paginatedResponse: (items) => items,
    repository,
    requireAnyPermission: () => (_req, _res, next) => next(),
    syncTestCaseTask: async () => {},
    testCaseStatuses: ["active", "passed", "failed", "blocked"],
    transaction: async (operation) => operation(),
  })));
  app.use((error, _req, res, _next) => res.status(500).json({ errorCode: "INTERNAL_ERROR", message: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await work(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("testing routes retain the test-run HTTP contract through an injected repository", async () => {
  const calls = [];
  const testCase = {
    id: "TC-1",
    project_id: "PRJ-1",
    status: "active",
    passed_cases: 0,
    failed_cases: 0,
    blocked_cases: 0,
  };
  const repository = {
    findTestCase: async () => ({ ...testCase }),
    createTestRun: async (record) => calls.push(["createTestRun", record]),
    applyTestRunResult: async ({ id, result }) => {
      calls.push(["applyTestRunResult", { id, result }]);
      testCase.status = result;
      testCase.passed_cases += result === "passed" ? 1 : 0;
      return { changes: 1 };
    },
  };

  await withServer(repository, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/test-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseId: "TC-1", result: "passed", notes: "verified" }),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.deepEqual(body.data, { id: "TR-1", result: "passed", testCaseId: "TC-1" });
  });

  assert.equal(calls[0][0], "createTestRun");
  assert.equal(calls[0][1].notes, "verified");
  assert.deepEqual(calls[1], ["applyTestRunResult", { id: "TC-1", result: "passed" }]);
  assert.equal(testCase.passed_cases, 1);
});
