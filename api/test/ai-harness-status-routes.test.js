const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const bcrypt = require("bcryptjs");

const apiRoot = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

// Seed passwords are passed as empty strings so api/.env (or the parent shell)
// can never replace the demo credentials this test logs in with.
async function startApi(databaseFile) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      AI_CONFIG_ENCRYPTION_KEY: "harness-status-routes-encryption-secret",
      AI_ENABLED: "false",
      DATABASE_FILE: databaseFile,
      JWT_SECRET: "harness-status-routes-jwt-secret",
      NODE_ENV: "test",
      PORT: String(port),
      SEED_DEMO_DATA: "0",
      SEED_ADMIN_PASSWORD: "",
      SEED_PM_PASSWORD: "",
      SEED_DEV_PASSWORD: "",
      SEED_QA_PASSWORD: "",
      SEED_PDM_PASSWORD: "",
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
    } catch { /* wait for the child */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (child.exitCode !== null) throw new Error(`API exited before becoming ready (${child.exitCode}).`);
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
  return { body: await response.json(), response };
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("harness status and invocation queries enforce auth, project scope, and snapshot hygiene", { timeout: 60000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-harness-status-"));
  const databaseFile = path.join(directory, "app.db");
  const api = await startApi(databaseFile);
  t.after(async () => {
    await api.stop();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  // Unauthenticated access is rejected before any permission check.
  const anonymous = await request(api.port, "/api/ai/harness/status");
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.body.errorCode, "UNAUTHENTICATED");

  const login = async (email, password) => {
    const response = await request(api.port, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.response.status, 200, JSON.stringify(response.body));
    return authHeaders(response.body.data.token);
  };
  const admin = await login("admin@example.com", "Admin@123");
  const developer = await login("dev@example.com", "Dev@12345");

  // Harness status: composition, runtime idle state, and metering availability.
  const status = await request(api.port, "/api/ai/harness/status", { headers: admin });
  assert.equal(status.response.status, 200, JSON.stringify(status.body));
  const statusData = status.body.data;
  assert.equal(statusData.composition.id, "company-runtime-v1");
  assert.equal(statusData.composition.sdkVersion, require("@deepseek-ai/dsh-sdk-client/package.json").version);
  const byPluginId = new Map(statusData.composition.plugins.map((plugin) => [plugin.id, plugin]));
  assert.equal(byPluginId.get("sdk-jsonrpc-server").kind, "builtin");
  assert.equal(byPluginId.get("sdk-jsonrpc-server").name, "@deepseek-ai/dsh-sdk-jsonrpc-server");
  assert.equal(byPluginId.get("sessions").kind, "builtin");
  assert.equal(byPluginId.get("sessions").name, "@deepseek-ai/dsh-session-persistence-sqlite");
  assert.equal(byPluginId.get("company-agent-spine").kind, "company");
  assert.equal(byPluginId.get("company-agent-spine").name, "./company-agent-spine.mjs");
  assert.equal(statusData.composition.plugins.every((plugin) => plugin.kind === "builtin" || plugin.kind === "company"), true);
  assert.equal(statusData.runtime.active, false);
  assert.equal(statusData.runtime.activeCalls, 0);
  assert.equal(statusData.runtime.closed, false);
  assert.equal(statusData.runtime.maxRunsPerRuntime, 0);
  assert.equal(statusData.runtime.idleTtlMs, 0);
  assert.equal(statusData.runtime.totalCalls, 0);
  assert.equal(statusData.runtime.totalRuns, 0);
  assert.equal(statusData.runtime.queued, 0);
  assert.deepEqual(statusData.runtime.proxy, { activeRoutes: 0, started: false });
  assert.equal(statusData.tokenUsageService, true);

  const developerStatus = await request(api.port, "/api/ai/harness/status", { headers: developer });
  assert.equal(developerStatus.response.status, 403);
  assert.equal(developerStatus.body.errorCode, "PERMISSION_DENIED");

  // One real (fallback-adapter) invocation to anchor list and detail queries.
  const project = await request(api.port, "/api/projects", {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ name: "Harness status project", objective: "Verify invocation queries", owner: "System Admin" }),
  });
  assert.equal(project.response.status, 201, JSON.stringify(project.body));
  const projectId = project.body.data.id;

  const invoked = await request(api.port, "/api/ai/capabilities/project-snapshot/invocations", {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ projectId }),
  });
  assert.equal(invoked.response.status, 200, JSON.stringify(invoked.body));
  assert.equal(invoked.body.data.status, "completed");
  const invocationId = invoked.body.data.invocationId;

  // Role without ai:* cannot list invocations even for its own scope.
  const developerList = await request(api.port, "/api/ai/capabilities/invocations", { headers: developer });
  assert.equal(developerList.response.status, 403);
  assert.equal(developerList.body.errorCode, "PERMISSION_DENIED");

  // Invalid limit values are rejected; the valid boundary is applied.
  for (const invalidLimit of ["abc", "0", "-3", "1.5"]) {
    const invalid = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}&limit=${invalidLimit}`, { headers: admin });
    assert.equal(invalid.response.status, 400, JSON.stringify(invalid.body));
    assert.equal(invalid.body.errorCode, "VALIDATION_FAILED");
  }

  // Add fixed-timestamp rows: one with rc.6 usage events, one with corrupt JSON.
  const db = new DatabaseSync(databaseFile);
  db.exec("PRAGMA busy_timeout = 5000");
  const insertInvocation = db.prepare(`
    INSERT INTO ai_capability_invocations (
      id, capability_id, capability_version, status, actor_id, project_id,
      assistant_snapshot, provider_snapshot, manifest_snapshot, policy_snapshot,
      input_snapshot, execution_snapshot, result_snapshot, harness_events,
      error_code, error_message, created_at, started_at, completed_at, updated_at
    ) VALUES (
      @id, @capabilityId, @capabilityVersion, @status, @actorId, @projectId,
      '{}', '{}', '{}', '{}', '{}', '{}', @resultSnapshot, @harnessEvents,
      NULL, NULL, @createdAt, @createdAt, @createdAt, @createdAt
    )
  `);
  insertInvocation.run({
    id: "AIC-TEST-USAGE",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    status: "completed",
    actorId: "USR-ADMIN",
    projectId,
    resultSnapshot: null,
    harnessEvents: JSON.stringify([
      { type: "assistant/message", seq: 2, time: "2026-08-14T00:00:00.000Z", data: { usage: { inputTokens: 10, outputTokens: 4 } } },
      { type: "turn/end", seq: 3, time: "2026-08-14T00:00:01.000Z", data: { reason: { kind: "completed" } } },
    ]),
    createdAt: "2000-01-01T00:00:00.000Z",
  });
  insertInvocation.run({
    id: "AIC-TEST-CORRUPT",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    status: "completed",
    actorId: "USR-ADMIN",
    projectId,
    resultSnapshot: "not-json{",
    harnessEvents: "not-json{",
    createdAt: "2999-01-01T00:00:00.000Z",
  });

  // Listing: summary shape, filters, ordering, and totals.
  const listed = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}`, { headers: admin });
  assert.equal(listed.response.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.data.total, 3);
  assert.deepEqual(Object.keys(listed.body.data.items[0]), [
    "id", "capabilityId", "capabilityVersion", "status", "projectId", "actorId", "errorCode", "createdAt", "startedAt", "completedAt",
  ]);
  assert.equal(listed.body.data.items[0].id, "AIC-TEST-CORRUPT");
  assert.equal(listed.body.data.items[0].capabilityId, "project-snapshot");
  assert.equal(listed.body.data.items[0].projectId, projectId);

  const limited = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}&limit=1`, { headers: admin });
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.data.total, 3);
  assert.equal(limited.body.data.items.length, 1);
  assert.equal(limited.body.data.items[0].id, "AIC-TEST-CORRUPT");

  const overLimit = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}&limit=500`, { headers: admin });
  assert.equal(overLimit.response.status, 200);
  assert.equal(overLimit.body.data.items.length, 3);

  const statusFiltered = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}&status=failed`, { headers: admin });
  assert.equal(statusFiltered.response.status, 200);
  assert.equal(statusFiltered.body.data.total, 0);
  assert.deepEqual(statusFiltered.body.data.items, []);

  const adminWide = await request(api.port, "/api/ai/capabilities/invocations", { headers: admin });
  assert.equal(adminWide.response.status, 200);
  assert.equal(adminWide.body.data.total, 3);

  // Detail: events, token usage extraction, snapshot hygiene, corrupt-JSON defense.
  const detail = await request(api.port, `/api/ai/capabilities/invocations/${invocationId}`, { headers: admin });
  assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
  const detailData = detail.body.data;
  assert.equal(detailData.id, invocationId);
  assert.equal(detailData.status, "completed");
  assert.equal(Array.isArray(detailData.events), true);
  assert.equal(detailData.events.length > 0, true);
  assert.deepEqual(detailData.tokenUsage, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  assert.equal(detailData.result.generatedBy, "platform_snapshot");
  for (const leaked of ["executionSnapshot", "assistantSnapshot", "providerSnapshot", "policySnapshot", "inputSnapshot", "manifestSnapshot"]) {
    assert.equal(leaked in detailData, false, `detail must not expose ${leaked}`);
  }
  assert.equal(JSON.stringify(detail.body).includes("execution_snapshot"), false);

  const usageDetail = await request(api.port, "/api/ai/capabilities/invocations/AIC-TEST-USAGE", { headers: admin });
  assert.equal(usageDetail.response.status, 200);
  assert.deepEqual(usageDetail.body.data.tokenUsage, { promptTokens: 10, completionTokens: 4, totalTokens: 14 });
  assert.equal(usageDetail.body.data.events[0].type, "assistant/message");

  const corruptDetail = await request(api.port, "/api/ai/capabilities/invocations/AIC-TEST-CORRUPT", { headers: admin });
  assert.equal(corruptDetail.response.status, 200);
  assert.deepEqual(corruptDetail.body.data.events, []);
  assert.equal(corruptDetail.body.data.result, null);
  assert.deepEqual(corruptDetail.body.data.tokenUsage, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });

  const missing = await request(api.port, "/api/ai/capabilities/invocations/AIC-DOES-NOT-EXIST", { headers: admin });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.errorCode, "RESOURCE_NOT_FOUND");

  // A non-admin caller with ai:* is confined to its accessible projects.
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, permissions, created_at, status)
    VALUES (@id, @name, @email, @passwordHash, @role, @permissions, @createdAt, 'active')
  `).run({
    id: "USR-SCOPED",
    name: "范围外用户",
    email: "scoped@example.com",
    passwordHash: bcrypt.hashSync("Scoped@12345", 10),
    role: "dev",
    permissions: JSON.stringify(["ai:*"]),
    createdAt: new Date().toISOString(),
  });
  const scoped = await login("scoped@example.com", "Scoped@12345");

  const scopedProject = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}`, { headers: scoped });
  assert.equal(scopedProject.response.status, 403, JSON.stringify(scopedProject.body));
  assert.equal(scopedProject.body.errorCode, "PERMISSION_DENIED");

  const scopedDetail = await request(api.port, `/api/ai/capabilities/invocations/${invocationId}`, { headers: scoped });
  assert.equal(scopedDetail.response.status, 403);
  assert.equal(scopedDetail.body.errorCode, "PERMISSION_DENIED");

  const scopedEmptyScope = await request(api.port, "/api/ai/capabilities/invocations", { headers: scoped });
  assert.equal(scopedEmptyScope.response.status, 200);
  assert.deepEqual(scopedEmptyScope.body.data, { items: [], total: 0 });

  // Project membership widens the caller's scope to that project only.
  db.prepare(`
    INSERT INTO project_members (id, project_id, user_id, user_name, role, source, created_at)
    VALUES (@id, @projectId, @userId, @userName, @role, 'manual', @createdAt)
  `).run({
    id: "MEM-SCOPED-1",
    projectId,
    userId: "USR-SCOPED",
    userName: "范围外用户",
    role: "member",
    createdAt: new Date().toISOString(),
  });

  const scopedAfterMembership = await request(api.port, `/api/ai/capabilities/invocations?projectId=${projectId}`, { headers: scoped });
  assert.equal(scopedAfterMembership.response.status, 200, JSON.stringify(scopedAfterMembership.body));
  assert.equal(scopedAfterMembership.body.data.total, 3);
  assert.equal(scopedAfterMembership.body.data.items.every((item) => item.projectId === projectId), true);

  const scopedWide = await request(api.port, "/api/ai/capabilities/invocations", { headers: scoped });
  assert.equal(scopedWide.response.status, 200);
  assert.equal(scopedWide.body.data.total, 3);

  const scopedDetailAfterMembership = await request(api.port, `/api/ai/capabilities/invocations/${invocationId}`, { headers: scoped });
  assert.equal(scopedDetailAfterMembership.response.status, 200);
  assert.equal(scopedDetailAfterMembership.body.data.id, invocationId);

  db.close();
});
