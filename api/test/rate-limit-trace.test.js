const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, output) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {
      // The test process has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API did not become healthy. Output:\n${output()}`);
}

test("each rate-limited authentication response receives a distinct trace ID", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-rate-limit-"));
  const port = await getFreePort();
  let output = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_FILE: path.join(directory, "app.db"),
      JWT_SECRET: "rate-limit-test-secret-at-least-16-characters",
      AI_CONFIG_ENCRYPTION_KEY: "rate-limit-ai-encryption-key-16",
      NODE_ENV: "production",
      PORT: String(port),
      SEED_DEMO_DATA: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await waitForHealth(port, () => output);
  const responses = [];
  for (let attempt = 0; attempt < 22; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "missing@example.com", password: "invalid" }),
    });
    responses.push({ status: response.status, body: await response.json() });
  }

  const limited = responses.filter((response) => response.status === 429);
  assert.equal(limited.length, 2);
  assert.deepEqual(limited.map((response) => response.body.errorCode), ["RATE_LIMITED", "RATE_LIMITED"]);
  assert.match(limited[0].body.traceId, /^[0-9a-f-]{36}$/i);
  assert.match(limited[1].body.traceId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(limited[0].body.traceId, limited[1].body.traceId);
});

test("global rate limiting rejects a request before malformed JSON is parsed", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-pre-body-rate-limit-"));
  const port = await getFreePort();
  let output = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      API_RATE_LIMIT_MAX: "1",
      DATABASE_FILE: path.join(directory, "app.db"),
      JWT_SECRET: "pre-body-rate-limit-secret-at-least-16-chars",
      AI_CONFIG_ENCRYPTION_KEY: "pre-body-rate-limit-ai-key-at-least-16",
      NODE_ENV: "production",
      PORT: String(port),
      SEED_DEMO_DATA: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  // The readiness request consumes the deliberately tiny one-request window.
  await waitForHealth(port, () => output);
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: "{ malformed",
  });
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.errorCode, "RATE_LIMITED");
  assert.match(body.traceId, /^[0-9a-f-]{36}$/i);
  assert.match(response.headers.get("content-type") || "", /application\/json/i);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
});
