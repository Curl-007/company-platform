const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { wrapRouterAsync } = require("../src/lib/asyncHandler");
const { createDefectsRouter } = require("../src/modules/defects/routes");

async function withServer(repository, work) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: "USR-1", name: "Alice", role: "admin", permissions: ["*"] };
    next();
  });
  app.use("/api", wrapRouterAsync(createDefectsRouter({
    audit: async () => {},
    canAccessProject: async (_user, projectId) => projectId === "PRJ-1",
    canWriteProject: async () => true,
    defectSeverities: ["low", "medium", "high", "critical"],
    defectStatuses: ["new", "confirmed", "in_fix", "resolved", "closed"],
    fail: (res, status, errorCode, message, details) => res.status(status).json({ errorCode, message, details }),
    mapDefect: (item) => ({
      id: item.id,
      projectId: item.project_id,
      title: item.title,
      version: Number(item.version) > 0 ? Number(item.version) : 1,
    }),
    nextId: async () => "BUG-NEW",
    ok: (data) => ({ data }),
    paginatedResponse: (items) => items,
    requireAnyPermission: () => (_req, _res, next) => next(),
    repository,
    syncDefectTask: async () => {},
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

test("GET /api/defects/:id returns a scoped defect with its optimistic-lock version", async () => {
  const defects = new Map([
    ["BUG-1", { id: "BUG-1", project_id: "PRJ-1", title: "Visible defect", version: 7 }],
    ["BUG-2", { id: "BUG-2", project_id: "PRJ-2", title: "Foreign defect", version: 3 }],
  ]);
  const repository = { findDefect: async (id) => defects.get(id) };

  await withServer(repository, async (port) => {
    const visible = await fetch(`http://127.0.0.1:${port}/api/defects/BUG-1`);
    const visibleBody = await visible.json();
    assert.equal(visible.status, 200);
    assert.equal(visibleBody.data.id, "BUG-1");
    assert.equal(visibleBody.data.version, 7);

    const foreign = await fetch(`http://127.0.0.1:${port}/api/defects/BUG-2`);
    const foreignBody = await foreign.json();
    assert.equal(foreign.status, 403);
    assert.equal(foreignBody.errorCode, "PERMISSION_DENIED");

    const missing = await fetch(`http://127.0.0.1:${port}/api/defects/BUG-MISSING`);
    const missingBody = await missing.json();
    assert.equal(missing.status, 404);
    assert.equal(missingBody.errorCode, "RESOURCE_NOT_FOUND");
  });
});
