const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startApi(databaseFile) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SEED_ADMIN_EMAIL: "",
      SEED_ADMIN_PASSWORD: "",
      SEED_PM_PASSWORD: "",
      SEED_DEV_PASSWORD: "",
      SEED_QA_PASSWORD: "",
      SEED_PDM_PASSWORD: "",
      PORT: String(port),
      DATABASE_FILE: databaseFile,
      JWT_SECRET: "strategy-management-test-secret",
      SEED_DEMO_DATA: "1",
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
    } catch { /* wait for startup */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {
    port,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    },
  };
}

async function request(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  return { response, body: await response.json() };
}

test("programs and portfolios persist goals, enforce link integrity, and record audit history", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-strategy-"));
  const api = await startApi(path.join(directory, "app.db"));
  t.after(() => api.stop());

  const login = await request(api.port, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "Admin@123" }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.user.capabilities.operations.includes("projects:manage"), true);
  const headers = { Authorization: `Bearer ${login.body.data.token}`, "Content-Type": "application/json" };

  const project = await request(api.port, "/api/projects", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Strategic delivery", owner: "系统管理员", objective: "Deliver a traceable service outcome" }),
  });
  assert.equal(project.response.status, 201);

  const program = await request(api.port, "/api/programs", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Service modernization", owner: "系统管理员", objective: "Modernize the customer service journey", projectIds: [project.body.data.id] }),
  });
  assert.equal(program.response.status, 201);
  assert.equal(program.body.data.objective, "Modernize the customer service journey");
  assert.deepEqual(program.body.data.projectIds, [project.body.data.id]);
  const programDetail = await request(api.port, `/api/programs/${program.body.data.id}`, { headers });
  assert.equal(programDetail.response.status, 200);
  assert.equal(programDetail.body.data.id, program.body.data.id);
  assert.deepEqual(programDetail.body.data.projectIds, [project.body.data.id]);
  const programProjects = await request(api.port, `/api/programs/${program.body.data.id}/projects`, { headers });
  assert.equal(programProjects.response.status, 200);
  assert.deepEqual(programProjects.body.data.map((item) => item.id), [project.body.data.id]);

  const linkedProject = await request(api.port, `/api/projects/${project.body.data.id}`, { headers });
  assert.equal(linkedProject.body.data.programId, program.body.data.id);
  const protectedProgramDelete = await request(api.port, `/api/programs/${program.body.data.id}`, { method: "DELETE", headers });
  assert.equal(protectedProgramDelete.response.status, 409);
  assert.equal(protectedProgramDelete.body.errorCode, "PROGRAM_HAS_PROJECTS");

  const product = await request(api.port, "/api/products", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Service suite", owner: "系统管理员" }),
  });
  assert.equal(product.response.status, 201);
  const portfolio = await request(api.port, "/api/portfolios", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "Customer experience", owner: "系统管理员", objective: "Improve self-service adoption", productIds: [product.body.data.id],
      roadmap: [{ title: "Self-service", version: "2.0", quarter: "2026 Q3", status: "development" }],
    }),
  });
  assert.equal(portfolio.response.status, 201);
  assert.equal(portfolio.body.data.objective, "Improve self-service adoption");
  assert.deepEqual(portfolio.body.data.productIds, [product.body.data.id]);

  const goal = await request(api.port, "/api/strategic-goals", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "Customer self-service", owner: "系统管理员", objective: "Increase successful self-service delivery", periodStart: "2026-07-01", periodEnd: "2026-12-31",
      successMetrics: ["Self-service journey is released", "Release gates have evidence"], programIds: [program.body.data.id], portfolioIds: [portfolio.body.data.id],
    }),
  });
  assert.equal(goal.response.status, 201);
  assert.deepEqual(goal.body.data.programIds, [program.body.data.id]);
  assert.deepEqual(goal.body.data.portfolioIds, [portfolio.body.data.id]);
  assert.deepEqual(goal.body.data.successMetrics, ["Self-service journey is released", "Release gates have evidence"]);

  const invalidGoalTransition = await request(api.port, `/api/strategic-goals/${goal.body.data.id}`, {
    method: "PATCH", headers, body: JSON.stringify({ status: "achieved" }),
  });
  assert.equal(invalidGoalTransition.response.status, 409);
  assert.equal(invalidGoalTransition.body.errorCode, "STATE_TRANSITION_NOT_ALLOWED");
  const activeGoal = await request(api.port, `/api/strategic-goals/${goal.body.data.id}`, {
    method: "PATCH", headers, body: JSON.stringify({ status: "active" }),
  });
  assert.equal(activeGoal.response.status, 200);
  assert.equal(activeGoal.body.data.status, "active");

  const invalidPortfolio = await request(api.port, "/api/portfolios", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Invalid", owner: "系统管理员", objective: "Must fail", productIds: ["PROD-MISSING"] }),
  });
  assert.equal(invalidPortfolio.response.status, 400);
  assert.equal(invalidPortfolio.body.errorCode, "VALIDATION_FAILED");

  const audit = await request(api.port, "/api/audit-logs?resourceType=program", { headers });
  assert.equal(audit.response.status, 200);
  assert.equal(audit.body.data.some((entry) => entry.action === "program.create" && entry.resourceId === program.body.data.id), true);
  const goalAudit = await request(api.port, "/api/audit-logs?resourceType=strategic_goal", { headers });
  assert.equal(goalAudit.response.status, 200);
  assert.equal(goalAudit.body.data.some((entry) => entry.action === "strategic_goal.create" && entry.resourceId === goal.body.data.id), true);
});
