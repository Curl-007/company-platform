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
    env: { ...process.env, NODE_ENV: "test", SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "", SEED_PM_PASSWORD: "", SEED_DEV_PASSWORD: "", SEED_QA_PASSWORD: "", SEED_PDM_PASSWORD: "", PORT: String(port), DATABASE_FILE: databaseFile, JWT_SECRET: "organization-management-test-secret", SEED_DEMO_DATA: "1" },
    stdio: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
    } catch { /* wait for startup */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { port, async stop() { if (child.exitCode === null) { const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited; } } };
}

async function request(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  return { response, body: await response.json() };
}

test("organization units persist member ownership, enforce authorization, protect deletion, and audit changes", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-organization-"));
  const api = await startApi(path.join(directory, "app.db"));
  t.after(() => api.stop());
  const adminLogin = await request(api.port, "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "Admin@123" }),
  });
  assert.equal(adminLogin.response.status, 200);
  const headers = { Authorization: `Bearer ${adminLogin.body.data.token}`, "Content-Type": "application/json" };

  const initialDepartments = await request(api.port, "/api/org/departments", { headers });
  assert.equal(initialDepartments.response.status, 200);
  assert.equal(initialDepartments.body.data.some((item) => item.name === "平台管理" && item.memberCount > 0), true);
  assert.equal(initialDepartments.body.data.some((item) => item.name === "研发部" && item.memberCount > 0), true);

  const people = await request(api.port, "/api/org/people", { headers });
  assert.equal(people.response.status, 200);
  assert.equal(people.body.data.some((person) => person.email === "admin@example.com"), true);
  assert.equal(Object.hasOwn(people.body.data[0], "password_hash"), false);
  assert.equal(Object.hasOwn(people.body.data[0], "password"), false);

  const createdDepartment = await request(api.port, "/api/org/departments", {
    method: "POST", headers, body: JSON.stringify({ name: "Platform Engineering", responsibilities: "Maintain shared delivery capabilities" }),
  });
  assert.equal(createdDepartment.response.status, 201);
  const departmentId = createdDepartment.body.data.id;

  const createdUser = await request(api.port, "/api/users", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Organization Test Developer", email: "organization-test@example.com", password: "TestPassword@123", role: "dev", departmentId }),
  });
  assert.equal(createdUser.response.status, 201);
  assert.equal(createdUser.body.data.department, "Platform Engineering");

  const developerLogin = await request(api.port, "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "organization-test@example.com", password: "TestPassword@123" }),
  });
  const developerHeaders = { Authorization: `Bearer ${developerLogin.body.data.token}`, "Content-Type": "application/json" };
  const unauthorizedCreate = await request(api.port, "/api/org/departments", {
    method: "POST", headers: developerHeaders, body: JSON.stringify({ name: "Not allowed" }),
  });
  assert.equal(unauthorizedCreate.response.status, 403);

  const renamedDepartment = await request(api.port, `/api/org/departments/${departmentId}`, {
    method: "PATCH", headers, body: JSON.stringify({ name: "Delivery Platform" }),
  });
  assert.equal(renamedDepartment.response.status, 200);
  const updatedUser = await request(api.port, `/api/users/${createdUser.body.data.id}`, { headers });
  assert.equal(updatedUser.body.data.department, "Delivery Platform");

  const protectedDelete = await request(api.port, `/api/org/departments/${departmentId}`, { method: "DELETE", headers });
  assert.equal(protectedDelete.response.status, 409);
  assert.equal(protectedDelete.body.errorCode, "ORG_UNIT_IN_USE");

  const clearMembership = await request(api.port, `/api/users/${createdUser.body.data.id}`, {
    method: "PATCH", headers, body: JSON.stringify({ departmentId: "" }),
  });
  assert.equal(clearMembership.response.status, 200);
  assert.equal(clearMembership.body.data.department, "");
  const deletedDepartment = await request(api.port, `/api/org/departments/${departmentId}`, { method: "DELETE", headers });
  assert.equal(deletedDepartment.response.status, 200);

  const audit = await request(api.port, "/api/audit-logs?resourceType=org_unit", { headers });
  assert.equal(audit.response.status, 200);
  assert.equal(audit.body.data.some((entry) => entry.action === "org_unit.create" && entry.resourceId === departmentId), true);
  assert.equal(audit.body.data.some((entry) => entry.action === "org_unit.delete" && entry.resourceId === departmentId), true);
  assert.equal(Object.hasOwn(audit.body.data[0], "before_json"), false);
  assert.equal(Object.hasOwn(audit.body.data[0], "ip"), false);
});
