const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");

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

async function startApi(databaseFile) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      AI_CONFIG_ENCRYPTION_KEY: "integration-encryption-secret",
      AI_ENABLED: "false",
      DATABASE_FILE: databaseFile,
      JWT_SECRET: "capability-integration-jwt-secret",
      NODE_ENV: "test",
      PORT: String(port),
      SEED_DEMO_DATA: "1",
      // Neutralize any api/.env seed credentials the dev dotenv loader would
      // inject into the child; this suite authenticates with fixed demo
      // passwords and must not depend on the host environment.
      SEED_ADMIN_EMAIL: "",
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

test("AI capability API invokes the scoped fallback, records audit evidence, and honors the kill switch", { timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-ai-capability-"));
  const databaseFile = path.join(directory, "app.db");
  const api = await startApi(databaseFile);
  t.after(async () => {
    await api.stop();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  const login = await request(api.port, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "Admin@123" }),
  });
  assert.equal(login.response.status, 200);
  const headers = {
    authorization: `Bearer ${login.body.data.token}`,
    "content-type": "application/json",
  };

  const project = await request(api.port, "/api/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Capability project", objective: "Verify the scoped project snapshot", owner: "System Admin" }),
  });
  assert.equal(project.response.status, 201);
  const projectId = project.body.data.id;

  const listed = await request(api.port, "/api/ai/capabilities", { headers });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data[0].id, "project-snapshot");
  assert.equal(listed.body.data[0].risk, "read_only");

  const invoked = await request(api.port, "/api/ai/capabilities/project-snapshot/invocations", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "capability-invocation-retry-001" },
    body: JSON.stringify({ projectId }),
  });
  assert.equal(invoked.response.status, 200);
  assert.equal(invoked.body.data.status, "completed");
  assert.equal(invoked.body.data.result.project.id, projectId);
  assert.equal(invoked.body.data.result.generatedBy, "platform_snapshot");

  const replayed = await request(api.port, "/api/ai/capabilities/project-snapshot/invocations", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "capability-invocation-retry-001" },
    body: JSON.stringify({ projectId }),
  });
  assert.equal(replayed.response.status, 200);
  assert.deepEqual(replayed.body, invoked.body, "a retry replays the cached invocation instead of running it again");

  const disabled = await request(api.port, "/api/admin/ai-capabilities/project-snapshot", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ enabled: false, reason: "integration-test-kill-switch" }),
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.body.data.control.enabled, false);

  const denied = await request(api.port, "/api/ai/capabilities/project-snapshot/invocations", {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId }),
  });
  assert.equal(denied.response.status, 503, JSON.stringify(denied.body));
  assert.equal(denied.body.errorCode, "AI_CAPABILITY_DISABLED");

  const db = new DatabaseSync(databaseFile);
  try {
    const completed = db.prepare("SELECT status, execution_snapshot FROM ai_capability_invocations WHERE status = 'completed'").get();
    assert.equal(completed.status, "completed");
    assert.doesNotMatch(completed.execution_snapshot, /cgw1\./);
    const actions = db.prepare("SELECT action FROM audit_logs WHERE resource_type = 'ai_capability_invocation' ORDER BY created_at").all().map((row) => row.action);
    assert.deepEqual(actions, ["ai.capability_invocation_started", "ai.capability_invocation_completed", "ai.capability_invocation_denied"]);
  } finally {
    db.close();
  }
});
