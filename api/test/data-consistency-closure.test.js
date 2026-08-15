const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
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
      JWT_SECRET: "data-consistency-closure-secret",
      SEED_DEMO_DATA: "1",
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) {
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
    } catch { /* wait for startup */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error("API did not start within 10 seconds.");
}

async function request(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  return { response, body: await response.json() };
}

test("P1 data relationships reject inconsistent writes and expose deletion dependencies", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-data-consistency-"));
  const databaseFile = path.join(directory, "app.db");
  const api = await startApi(databaseFile);
  t.after(async () => {
    await api.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const login = await request(api.port, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "Admin@123" }),
  });
  assert.equal(login.response.status, 200);
  const headers = {
    Authorization: `Bearer ${login.body.data.token}`,
    "Content-Type": "application/json",
  };

  const productA = await request(api.port, "/api/products", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Product A", owner: "系统管理员" }),
  });
  const productB = await request(api.port, "/api/products", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Product B", owner: "系统管理员" }),
  });
  assert.equal(productA.response.status, 201);
  assert.equal(productB.response.status, 201);

  const project = await request(api.port, "/api/projects", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "Consistency project",
      owner: "系统管理员",
      objective: "Keep delivery relationships consistent",
      productId: productA.body.data.id,
    }),
  });
  assert.equal(project.response.status, 201);

  const firstProgram = await request(api.port, "/api/programs", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "First program",
      owner: "系统管理员",
      objective: "Initial grouping",
      projectIds: [project.body.data.id],
    }),
  });
  assert.equal(firstProgram.response.status, 201);
  const afterFirstBinding = await request(api.port, `/api/projects/${project.body.data.id}`, { headers });
  assert.equal(afterFirstBinding.body.data.version, project.body.data.version + 1);

  const secondProgram = await request(api.port, "/api/programs", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "Second program",
      owner: "系统管理员",
      objective: "Replacement grouping",
      projectIds: [project.body.data.id],
    }),
  });
  assert.equal(secondProgram.response.status, 201);
  const afterRebinding = await request(api.port, `/api/projects/${project.body.data.id}`, { headers });
  assert.equal(afterRebinding.body.data.programId, secondProgram.body.data.id);
  assert.equal(afterRebinding.body.data.version, afterFirstBinding.body.data.version + 1);
  const refreshedOldProgram = await request(api.port, `/api/programs/${firstProgram.body.data.id}`, { headers });
  assert.deepEqual(refreshedOldProgram.body.data.projectIds, []);

  const flowProject = await request(api.port, "/api/projects", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Lightweight flow", owner: "系统管理员", processMode: "scrum" }),
  });
  const bindLightweight = await request(api.port, `/api/projects/${flowProject.body.data.id}/workflow-binding`, {
    method: "PUT", headers,
    body: JSON.stringify({ templateId: "lightweight-delivery-v1" }),
  });
  assert.equal(bindLightweight.response.status, 200);
  const incompatibleMode = await request(api.port, `/api/projects/${flowProject.body.data.id}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ version: flowProject.body.data.version, processMode: "waterfall" }),
  });
  assert.equal(incompatibleMode.response.status, 409);
  assert.equal(incompatibleMode.body.errorCode, "WORKFLOW_TEMPLATE_PROCESS_MODE_INCOMPATIBLE");

  const waterfallProject = await request(api.port, "/api/projects", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Waterfall flow", owner: "系统管理员", processMode: "waterfall" }),
  });
  const incompatibleBinding = await request(api.port, `/api/projects/${waterfallProject.body.data.id}/workflow-binding`, {
    method: "PUT", headers,
    body: JSON.stringify({ templateId: "lightweight-delivery-v1" }),
  });
  assert.equal(incompatibleBinding.response.status, 409);
  assert.equal(incompatibleBinding.body.errorCode, "WORKFLOW_TEMPLATE_PROCESS_MODE_INCOMPATIBLE");

  const build = await request(api.port, "/api/builds", {
    method: "POST", headers,
    body: JSON.stringify({ projectId: project.body.data.id, name: "Build A", version: "1.0.0" }),
  });
  assert.equal(build.response.status, 201);
  const mismatchedRelease = await request(api.port, "/api/releases", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Wrong product", buildId: build.body.data.id, productId: productB.body.data.id }),
  });
  assert.equal(mismatchedRelease.response.status, 400);
  assert.equal(mismatchedRelease.body.errorCode, "RELEASE_BUILD_PRODUCT_MISMATCH");
  const release = await request(api.port, "/api/releases", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Derived product", buildId: build.body.data.id }),
  });
  assert.equal(release.response.status, 201);
  assert.equal(release.body.data.productId, productA.body.data.id);

  const protectedBuildDelete = await request(api.port, `/api/builds/${build.body.data.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(protectedBuildDelete.response.status, 409);
  assert.equal(protectedBuildDelete.body.errorCode, "BUILD_HAS_DEPENDENCIES");
  assert.equal(protectedBuildDelete.body.details.dependencies.releases.count, 1);
  assert.deepEqual(protectedBuildDelete.body.details.dependencies.releases.sampleIds, [release.body.data.id]);
  assert.equal(protectedBuildDelete.body.details.dependencies.defects.count, 0);
  assert.equal(protectedBuildDelete.body.details.dependencies.tasks.count, 0);

  const requirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "data-consistency-requirement" },
    body: JSON.stringify({
      title: "Product requirement",
      projectId: project.body.data.id,
      productId: productA.body.data.id,
      owner: "系统管理员",
    }),
  });
  assert.equal(requirement.response.status, 201);
  const portfolio = await request(api.port, "/api/portfolios", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "Product portfolio",
      owner: "系统管理员",
      objective: "Keep product linkage",
      productIds: [productA.body.data.id],
    }),
  });
  assert.equal(portfolio.response.status, 201);
  const protectedProductDelete = await request(api.port, `/api/products/${productA.body.data.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(protectedProductDelete.response.status, 409);
  assert.equal(protectedProductDelete.body.errorCode, "PRODUCT_HAS_DEPENDENCIES");
  assert.ok(protectedProductDelete.body.details.dependencies.projects.count >= 1);
  assert.equal(protectedProductDelete.body.details.dependencies.requirements.count, 1);
  assert.equal(protectedProductDelete.body.details.dependencies.releases.count, 1);
  assert.equal(protectedProductDelete.body.details.dependencies.portfolios.count, 1);

  const testCase = await request(api.port, "/api/test-cases", {
    method: "POST", headers,
    body: JSON.stringify({ title: "Transactional test", projectId: project.body.data.id }),
  });
  assert.equal(testCase.response.status, 201);
  const taskProtectedDelete = await request(api.port, `/api/test-cases/${testCase.body.data.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(taskProtectedDelete.response.status, 409);
  assert.equal(taskProtectedDelete.body.errorCode, "TEST_CASE_HAS_DEPENDENCIES");
  assert.equal(taskProtectedDelete.body.details.dependencies.tasks.count, 1);
  assert.equal(taskProtectedDelete.body.details.dependencies.testRuns.count, 0);

  const testRun = await request(api.port, "/api/test-runs", {
    method: "POST", headers,
    body: JSON.stringify({ testCaseId: testCase.body.data.id, result: "passed" }),
  });
  assert.equal(testRun.response.status, 201);
  const fullyProtectedDelete = await request(api.port, `/api/test-cases/${testCase.body.data.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(fullyProtectedDelete.response.status, 409);
  assert.equal(fullyProtectedDelete.body.details.dependencies.tasks.count, 1);
  assert.equal(fullyProtectedDelete.body.details.dependencies.testRuns.count, 1);

  const archivedProject = await request(api.port, "/api/projects", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Archived program reference", owner: "系统管理员" }),
  });
  const archivedProgram = await request(api.port, "/api/programs", {
    method: "POST", headers,
    body: JSON.stringify({
      name: "Archived reference program",
      owner: "系统管理员",
      objective: "Retain soft-delete references",
      projectIds: [archivedProject.body.data.id],
    }),
  });
  assert.equal(archivedProgram.response.status, 201);
  const softDelete = await request(api.port, `/api/projects/${archivedProject.body.data.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(softDelete.response.status, 200);
  const protectedProgramDelete = await request(api.port, `/api/programs/${archivedProgram.body.data.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(protectedProgramDelete.response.status, 409);
  assert.equal(protectedProgramDelete.body.errorCode, "PROGRAM_HAS_PROJECTS");
  assert.equal(protectedProgramDelete.body.details.dependencies.projects.count, 1);
  assert.deepEqual(protectedProgramDelete.body.details.dependencies.projects.sampleIds, [archivedProject.body.data.id]);

  const db = new DatabaseSync(databaseFile, { readOnly: true });
  const persistedTestCase = db.prepare("SELECT id FROM test_cases WHERE id = ?").get(testCase.body.data.id);
  const persistedTask = db.prepare("SELECT id FROM tasks WHERE source_type = 'test_case' AND source_id = ?").get(testCase.body.data.id);
  db.close();
  assert.equal(persistedTestCase.id, testCase.body.data.id);
  assert.ok(persistedTask.id);
});
