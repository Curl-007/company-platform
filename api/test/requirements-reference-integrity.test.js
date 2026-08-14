const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const { createRequirementsRouter } = require("../src/modules/requirements/routes");

function requirementRow({
  id = "REQ-1",
  productId = "PROD-visible",
  portfolioId = "PORT-visible",
  version = 1,
} = {}) {
  return {
    id,
    title: "Existing requirement",
    description: "",
    status: "draft",
    priority: "medium",
    project_id: "PRJ-visible",
    product_id: productId,
    portfolio_id: portfolioId,
    parent_id: null,
    owner: "Owner",
    assignee: null,
    assignee_role: null,
    assignment_status: "unassigned",
    completion: 0,
    acceptance_criteria: "[]",
    linked_tasks: "[]",
    version,
  };
}

async function createHarness() {
  const requirements = new Map([["REQ-1", requirementRow()]]);
  const products = new Map([
    ["PROD-visible", { id: "PROD-visible" }],
    ["PROD-other-visible", { id: "PROD-other-visible" }],
    ["PROD-hidden", { id: "PROD-hidden" }],
  ]);
  const portfolios = new Map([
    ["PORT-visible", { id: "PORT-visible", product_ids: JSON.stringify(["PROD-visible"]) }],
    ["PORT-hidden", { id: "PORT-hidden", product_ids: JSON.stringify(["PROD-hidden"]) }],
    ["PORT-mismatch", { id: "PORT-mismatch", product_ids: JSON.stringify(["PROD-other-visible"]) }],
  ]);
  const projectIdsByProduct = new Map([
    ["PROD-visible", [{ id: "PRJ-visible" }]],
    ["PROD-other-visible", [{ id: "PRJ-visible" }]],
    ["PROD-hidden", [{ id: "PRJ-hidden" }]],
  ]);
  let nextRequirement = 2;

  const repository = {
    async createRequirement(requirement) {
      requirements.set(requirement.id, requirement);
    },
    async findPortfolio(id) {
      return portfolios.get(id) || null;
    },
    async findProduct(id) {
      return products.get(id) || null;
    },
    async findRequirement(id) {
      return requirements.get(id) || null;
    },
    async findRequirementVersion(id) {
      const requirement = requirements.get(id);
      return requirement ? { version: requirement.version } : null;
    },
    async listActiveProjectIdsByProduct(id) {
      return projectIdsByProduct.get(id) || [];
    },
    async updateRequirement(next) {
      const current = requirements.get(next.id);
      if (!current || current.version !== next.expectedVersion) return { changes: 0 };
      requirements.set(next.id, {
        ...current,
        title: next.title,
        description: next.description,
        priority: next.priority,
        acceptance_criteria: next.acceptanceCriteria,
        product_id: next.productId,
        portfolio_id: next.portfolioId,
        parent_id: next.parentId,
        assignee: next.assignee,
        assignee_role: next.assigneeRole,
        assignment_status: next.assignmentStatus,
        completion: next.completion,
        version: current.version + 1,
      });
      return { changes: 1 };
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "USR-custom",
      name: "Custom requirement manager",
      role: "dev",
      permissions: ["requirement:*"],
    };
    next();
  });
  app.use(createRequirementsRouter({
    audit: async () => {},
    beginIdempotentRequest: async () => ({ abort: async () => {}, commit: async () => {} }),
    canAccessProject: async (_user, projectId) => projectId === "PRJ-visible",
    canOperateRequirement: async (_user, requirement) => requirement.project_id === "PRJ-visible",
    canWriteProject: async (_user, projectId) => projectId === "PRJ-visible",
    fail: (res, status, errorCode, message, details) => res.status(status).json({ errorCode, message, ...(details ? { details } : {}) }),
    json: JSON.stringify,
    mapRequirement: (row) => ({
      id: row.id,
      title: row.title,
      projectId: row.project_id,
      productId: row.product_id,
      portfolioId: row.portfolio_id,
      version: row.version,
    }),
    mergeRequirementLinkedTask: async () => {},
    nextId: async () => `REQ-${nextRequirement++}`,
    now: () => "2026-08-14T00:00:00.000Z",
    ok: (data) => ({ data }),
    paginatedResponse: (items) => items,
    releaseReadyRequirementStatuses: new Set(),
    repository,
    requirementPriorities: ["low", "medium", "high"],
    requirementScore: async () => null,
    requirementStatuses: ["draft"],
    requirePermission: (permission) => (req, res, next) => {
      if (req.user.permissions.includes(permission)) return next();
      return res.status(403).json({ errorCode: "PERMISSION_DENIED" });
    },
    statusHistory: { record: async () => {} },
    syncRequirementTask: async () => null,
    transaction: async (work) => await work(),
  }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    requirements,
    async request(path, body, method = "POST") {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { response, body: await response.json() };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("requirements reject malformed, missing, hidden, and inconsistent product portfolio references", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const base = { title: "Linked requirement", projectId: "PRJ-visible" };
  const malformed = await harness.request("/requirements", { ...base, productId: {} });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.body.errorCode, "VALIDATION_FAILED");

  const missingProduct = await harness.request("/requirements", { ...base, productId: "PROD-missing" });
  assert.equal(missingProduct.response.status, 404);
  assert.equal(missingProduct.body.errorCode, "RESOURCE_NOT_FOUND");
  assert.equal(missingProduct.body.message, "Product not found.");

  const missingPortfolio = await harness.request("/requirements", { ...base, portfolioId: "PORT-missing" });
  assert.equal(missingPortfolio.response.status, 404);
  assert.equal(missingPortfolio.body.errorCode, "RESOURCE_NOT_FOUND");
  assert.equal(missingPortfolio.body.message, "Portfolio not found.");

  const hiddenProduct = await harness.request("/requirements", { ...base, productId: "PROD-hidden" });
  assert.equal(hiddenProduct.response.status, 403);
  assert.equal(hiddenProduct.body.errorCode, "PERMISSION_DENIED");

  const hiddenPortfolio = await harness.request("/requirements", { ...base, portfolioId: "PORT-hidden" });
  assert.equal(hiddenPortfolio.response.status, 403);
  assert.equal(hiddenPortfolio.body.errorCode, "PERMISSION_DENIED");

  const mismatch = await harness.request("/requirements", {
    ...base,
    productId: "PROD-visible",
    portfolioId: "PORT-mismatch",
  });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.errorCode, "PRODUCT_PORTFOLIO_MISMATCH");

  const created = await harness.request("/requirements", {
    ...base,
    productId: "PROD-visible",
    portfolioId: "PORT-visible",
  });
  assert.equal(created.response.status, 201);
  assert.deepEqual(created.body.data, {
    id: "REQ-2",
    title: "Linked requirement",
    projectId: "PRJ-visible",
    productId: "PROD-visible",
    portfolioId: "PORT-visible",
    version: 1,
  });
});

test("requirements validate effective links during updates and persist valid link changes", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const updated = await harness.request("/requirements/REQ-1", {
    version: 1,
    productId: "PROD-other-visible",
    portfolioId: "PORT-mismatch",
  }, "PATCH");
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.data.productId, "PROD-other-visible");
  assert.equal(updated.body.data.portfolioId, "PORT-mismatch");
  assert.equal(updated.body.data.version, 2);

  const missingPortfolio = await harness.request("/requirements/REQ-1", {
    version: 2,
    portfolioId: "PORT-missing",
  }, "PATCH");
  assert.equal(missingPortfolio.response.status, 404);
  assert.equal(missingPortfolio.body.errorCode, "RESOURCE_NOT_FOUND");
  assert.equal(harness.requirements.get("REQ-1").portfolio_id, "PORT-mismatch");
});
