const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createHarnessProviderProxy } = require("../src/modules/ai/harnessProxy");
const { createHarnessRuntime } = require("../src/modules/ai/harnessRuntime");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createExecutionGateway } = require("../src/modules/ai/executionGateway");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");
const { hasPermission, publicUser } = require("../src/security/accessControl");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Smoke Provider did not expose a TCP port.");
  return { port: address.port, server };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

function localResolvedTarget(baseUrl) {
  const url = new URL(baseUrl);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  return {
    addresses: Object.freeze([{ address: "127.0.0.1", family: 4 }]),
    hostname: "127.0.0.1",
    lookup: null,
    url,
  };
}

function runtimeEnvironment(home) {
  const env = { HARNESS_HOME: home };
  for (const key of ["ComSpec", "LANG", "LC_ALL", "LC_CTYPE", "NODE_ENV", "PATHEXT", "PATH", "SystemRoot", "TEMP", "TMP", "TZ", "WINDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

test("Harness rc.6 composition sends chat completions through the local Provider proxy", { timeout: 30000 }, async () => {
  const providerKey = "smoke-real-provider-key";
  const upstreamRequests = [];
  const { port, server } = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    upstreamRequests.push({
      authorization: String(req.headers.authorization || ""),
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: req.method,
      url: req.url,
    });
    res.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: { content: "Harness composition smoke response" }, finish_reason: null, index: 0 }],
      created: 0,
      id: "chatcmpl-smoke",
      model: "smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`);
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
      created: 0,
      id: "chatcmpl-smoke",
      model: "smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-smoke-"));
  let childEnv;
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: runtimeEnvironment(home),
    importSdk: async () => {
      const sdk = await import("@deepseek-ai/dsh-sdk-client");
      class ObservedHarness extends sdk.DeepSeekHarness {
        constructor(options) {
          childEnv = options.launch.env;
          super(options);
        }
      }
      return { DeepSeekHarness: ObservedHarness };
    },
    logger: { warn: () => {} },
  });

  try {
    const text = await runtime.run({
      config: {
        apiKey: providerKey,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-model",
        wireApi: "chat_completions",
      },
      prompt: "Return the smoke response.",
      timeoutMs: 15000,
    });

    assert.equal(text, "Harness composition smoke response");
    assert.equal(upstreamRequests.length, 1);
    assert.deepEqual({ method: upstreamRequests[0].method, url: upstreamRequests[0].url }, {
      method: "POST",
      url: "/v1/chat/completions",
    });
    assert.equal(upstreamRequests[0].authorization, `Bearer ${providerKey}`);
    assert.equal(upstreamRequests[0].body.model, "smoke-model");
    assert.match(childEnv.DSH_API_KEY, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(childEnv.DSH_API_KEY, providerKey);
    assert.equal(upstreamRequests[0].authorization.includes(childEnv.DSH_API_KEY), false);
    assert.equal(JSON.stringify(upstreamRequests[0]).includes(childEnv.DSH_API_KEY), false);
    assert.equal(childEnv.DSH_SESSION_DB, path.join(home, "sessions.db"));

    // The resident composition persists sessions into the SQLite database (the
    // legacy JSONL root stays configured for rollback but stays unwritten).
    const sessionDbStat = await fs.stat(childEnv.DSH_SESSION_DB);
    assert.equal(sessionDbStat.isFile(), true);
    assert.equal(await fs.stat(path.join(home, "sessions")).then(() => true, () => false), false);
  } finally {
    await runtime.close();
    await closeServer(server);
    await fs.rm(home, { force: true, recursive: true });
  }
});

test("Harness rc.6 composition sends Responses API requests through the local Provider proxy", { timeout: 30000 }, async () => {
  const providerKey = "smoke-responses-provider-key";
  const upstreamRequests = [];
  const responseText = "Harness Responses composition smoke response";
  const outputItem = {
    content: [{ annotations: [], text: responseText, type: "output_text" }],
    id: "msg-smoke-response",
    role: "assistant",
    status: "completed",
    type: "message",
  };
  const terminalResponse = {
    id: "resp-smoke",
    output: [outputItem],
    status: "completed",
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 8,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 20,
    },
  };
  const { port, server } = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    upstreamRequests.push({
      authorization: String(req.headers.authorization || ""),
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: req.method,
      url: req.url,
    });
    res.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    for (const event of [
      { response: { id: terminalResponse.id }, type: "response.created" },
      { item: { ...outputItem, content: [], status: "in_progress" }, output_index: 0, type: "response.output_item.added" },
      { content_index: 0, delta: responseText, output_index: 0, type: "response.output_text.delta" },
      { item: outputItem, output_index: 0, type: "response.output_item.done" },
      { response: terminalResponse, type: "response.completed" },
    ]) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-responses-smoke-"));
  let childEnv;
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: runtimeEnvironment(home),
    importSdk: async () => {
      const sdk = await import("@deepseek-ai/dsh-sdk-client");
      class ObservedHarness extends sdk.DeepSeekHarness {
        constructor(options) {
          childEnv = options.launch.env;
          super(options);
        }
      }
      return { DeepSeekHarness: ObservedHarness };
    },
    logger: { warn: () => {} },
  });

  try {
    const text = await runtime.run({
      config: {
        apiKey: providerKey,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-responses-model",
        wireApi: "responses",
      },
      prompt: "Return the Responses smoke response.",
      timeoutMs: 15000,
    });

    assert.equal(text, responseText);
    assert.equal(upstreamRequests.length, 1);
    assert.deepEqual({ method: upstreamRequests[0].method, url: upstreamRequests[0].url }, {
      method: "POST",
      url: "/v1/responses",
    });
    assert.equal(upstreamRequests[0].authorization, `Bearer ${providerKey}`);
    assert.equal(upstreamRequests[0].body.model, "smoke-responses-model");
    assert.equal(upstreamRequests[0].body.store, false);
    assert.equal(childEnv.DSH_API_KEY === providerKey, false);
    assert.equal(upstreamRequests[0].authorization.includes(childEnv.DSH_API_KEY), false);
    assert.equal(JSON.stringify(upstreamRequests[0]).includes(childEnv.DSH_API_KEY), false);
  } finally {
    await runtime.close();
    await closeServer(server);
    await fs.rm(home, { force: true, recursive: true });
  }
});

test("Harness company-draft composition loads, registers the skill tool, and catalogs the company skills", { timeout: 30000 }, async () => {
  const providerKey = "smoke-draft-provider-key";
  const upstreamRequests = [];
  const { port, server } = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    upstreamRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: { content: "Harness draft composition smoke response" }, finish_reason: null, index: 0 }],
      created: 0,
      id: "chatcmpl-smoke",
      model: "smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`);
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
      created: 0,
      id: "chatcmpl-smoke",
      model: "smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-draft-"));
  let childEnv;
  let launchArgs;
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: runtimeEnvironment(home),
    importSdk: async () => {
      const sdk = await import("@deepseek-ai/dsh-sdk-client");
      class ObservedHarness extends sdk.DeepSeekHarness {
        constructor(options) {
          childEnv = options.launch.env;
          launchArgs = options.launch.args;
          super(options);
        }
      }
      return { DeepSeekHarness: ObservedHarness };
    },
    logger: { warn: () => {} },
  });

  try {
    const text = await runtime.run({
      compositionKey: "company-draft-v1",
      config: {
        apiKey: providerKey,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-model",
        wireApi: "chat_completions",
      },
      prompt: "Return the draft smoke response.",
      timeoutMs: 15000,
    });

    assert.equal(text, "Harness draft composition smoke response");
    assert.equal(upstreamRequests.length, 1);
    assert.equal(childEnv.DSH_RUNTIME_COMPOSITION, "company-draft-v1");
    assert.ok(launchArgs[launchArgs.length - 1].endsWith(path.join("compositions", "company-draft-v1.yml")),
      "the launcher receives the draft composition file");
    assert.equal(childEnv.DSH_SKILL_ROOT, path.resolve(__dirname, "..", "config", "harness", "skills"));

    // The draft composition keeps the model-facing skill surface: the `skill`
    // tool is registered and the durable catalog lists every company skill.
    const tools = (upstreamRequests[0].tools || []).map((tool) => tool.function?.name || tool.name);
    assert.equal(tools.includes("skill"), true);
    const requestText = JSON.stringify(upstreamRequests[0]);
    assert.equal(requestText.includes("<available_skills>"), true);
    for (const skillName of ["fixed-delivery-checklist", "lightweight-delivery-gate", "defect-root-cause"]) {
      assert.equal(requestText.includes(skillName), true, `skill ${skillName} must be cataloged`);
    }
  } finally {
    await runtime.close();
    await closeServer(server);
    await fs.rm(home, { force: true, recursive: true });
  }
});

// Real composition round-trip for a Sprint 4.1 domain capability: the model
// (scripted upstream) calls requirements_list, the Harness child forwards the
// call through the scoped loopback execution gateway, and the gateway answers
// from a real in-memory repository before the model summarizes the result.
test("Harness composition round-trips requirements_list through the scoped execution gateway", { timeout: 30000 }, async () => {
  const providerKey = "smoke-domain-provider-key";
  const dbRuntime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  dbRuntime.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, status TEXT DEFAULT 'active', permissions TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, owner TEXT, status TEXT DEFAULT 'in_progress', deleted_at TEXT);
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY, title TEXT, description TEXT DEFAULT '', status TEXT, priority TEXT,
      project_id TEXT, product_id TEXT, portfolio_id TEXT, parent_id TEXT, owner TEXT, assignee TEXT,
      assignee_role TEXT, assignment_status TEXT DEFAULT 'unassigned', completion INTEGER DEFAULT 0,
      linked_tasks TEXT DEFAULT '[]', acceptance_criteria TEXT DEFAULT '[]', version INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, status_text TEXT, project_id TEXT, owner TEXT,
      description TEXT DEFAULT '', due_date TEXT, requirement_id TEXT, progress INTEGER DEFAULT 0,
      blocker TEXT, type TEXT, parent_id TEXT, wbs_code TEXT, kanban_column TEXT,
      sort_order INTEGER DEFAULT 0, estimated_hours REAL DEFAULT 0, actual_hours REAL DEFAULT 0,
      remaining_hours REAL DEFAULT 0, version INTEGER DEFAULT 1, sprint_id TEXT, assignee_id TEXT,
      assignee_role TEXT, dependency_ids TEXT DEFAULT '[]', build_id TEXT, source_type TEXT, source_id TEXT
    );
    CREATE TABLE defects (
      id TEXT PRIMARY KEY, title TEXT, severity TEXT, status TEXT, project_id TEXT,
      requirement_id TEXT, assignee TEXT, assignee_role TEXT, reporter TEXT,
      description TEXT DEFAULT '', version INTEGER DEFAULT 1
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT, resource_type TEXT,
      resource_id TEXT, before_json TEXT, after_json TEXT, ip TEXT, scope_type TEXT DEFAULT 'global',
      project_id TEXT, subject_user_id TEXT, created_at TEXT
    );
  `);
  const access = createSqliteAccess(dbRuntime);
  const json = (value, fallback = null) => (value === undefined ? fallback : JSON.stringify(value));
  await access.insert("users", {
    id: "USR-COMP", name: "Composition Tester", email: "composition@example.com",
    role: "admin", status: "active", permissions: json(["*"]),
  });
  await access.insert("projects", { id: "PRJ-1", name: "Apollo", owner: "USR-COMP", status: "in_progress", deleted_at: null });
  await access.insert("requirements", {
    id: "REQ-1", title: "Login with company SSO", description: "Employees sign in through SSO.",
    status: "draft", priority: "high", project_id: "PRJ-1", product_id: null, portfolio_id: null,
    parent_id: null, owner: "Product Office", assignee: null, assignee_role: null,
    assignment_status: "unassigned", completion: 0, linked_tasks: "[]", acceptance_criteria: "[]",
    version: 1, deleted_at: null,
  });
  const tokenService = createScopedExecutionTokenService({ secret: "composition-gateway-secret-16" });
  let requirementQueries = 0;
  const gateway = createExecutionGateway({
    audit: async () => {},
    canAccessProject: async (_user, projectId) => projectId === "PRJ-1",
    controlStore: { get: async () => ({ enabled: true }) },
    hasPermission,
    insert: access.insert,
    json,
    nextId: async (prefix) => `${prefix}-COMP`,
    publicUser,
    registry: createCapabilityRegistry(),
    row: access.row,
    rows: async (sql, params) => {
      if (sql.includes("FROM requirements")) requirementQueries += 1;
      return access.rows(sql, params);
    },
    tokenService,
    transaction: access.transaction,
  });
  const gatewayBaseUrl = await gateway.start();
  const executionToken = tokenService.issue({
    actorId: "USR-COMP",
    capabilityId: "requirements-list",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-COMP-1",
    projectId: "PRJ-1",
  }).token;

  const upstreamRequests = [];
  const { port, server } = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    upstreamRequests.push(body);
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    const chunkJson = (payload) => `data: ${JSON.stringify({ created: 0, id: "chatcmpl-smoke", model: "smoke-model", object: "chat.completion.chunk", ...payload })}\n\n`;
    if (upstreamRequests.length === 1) {
      // First turn: the scripted model requests the requirements_list tool.
      res.write(chunkJson({
        choices: [{
          delta: { tool_calls: [{ index: 0, id: "call-requirements-1", type: "function", function: { name: "requirements_list", arguments: "" } }] },
          finish_reason: null,
          index: 0,
        }],
      }));
      res.write(chunkJson({
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ projectId: "PRJ-1" }) } }] },
          finish_reason: null,
          index: 0,
        }],
      }));
      res.write(chunkJson({ choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }] }));
    } else {
      // Second turn: the tool result is in the conversation; finish with text.
      res.write(chunkJson({
        choices: [{ delta: { content: "One high-priority requirement was found." }, finish_reason: null, index: 0 }],
      }));
      res.write(chunkJson({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }));
    }
    res.end("data: [DONE]\n\n");
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-domain-"));
  let childEnv;
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: runtimeEnvironment(home),
    importSdk: async () => {
      const sdk = await import("@deepseek-ai/dsh-sdk-client");
      class ObservedHarness extends sdk.DeepSeekHarness {
        constructor(options) {
          childEnv = options.launch.env;
          super(options);
        }
      }
      return { DeepSeekHarness: ObservedHarness };
    },
    logger: { warn: () => {} },
  });

  try {
    const text = await runtime.run({
      config: {
        apiKey: providerKey,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-model",
        wireApi: "chat_completions",
      },
      execution: {
        capabilityId: "requirements-list",
        capabilityVersion: "1.0.0",
        gatewayBaseUrl,
        projectId: "PRJ-1",
        token: executionToken,
      },
      prompt: "List the requirements of the authorized project with the requirements_list tool, then summarize them.",
      timeoutMs: 25000,
    });

    assert.equal(text, "One high-priority requirement was found.");
    assert.equal(upstreamRequests.length, 2);
    const toolNames = (upstreamRequests[0].tools || []).map((tool) => tool.function?.name || tool.name);
    assert.equal(toolNames.includes("requirements_list"), true);
    // The tool result of turn one reached the second model request verbatim.
    const secondTurn = JSON.stringify(upstreamRequests[1]);
    assert.equal(secondTurn.includes("Login with company SSO"), true);
    assert.equal(requirementQueries, 1);
    assert.equal(childEnv.DSH_EXECUTION_CAPABILITY_ID, "requirements-list");
    assert.equal(childEnv.DSH_EXECUTION_TOKEN, executionToken);
    // The single-use token was consumed exactly once by the runtime tool call.
    const replay = await fetch(`${gatewayBaseUrl}/v1/execution`, {
      method: "POST",
      headers: { authorization: `Bearer ${executionToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" }),
    });
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error.code, "AI_CAPABILITY_TOKEN_REPLAYED");
  } finally {
    await runtime.close();
    await closeServer(server);
    await gateway.close();
    await fs.rm(home, { force: true, recursive: true });
  }
});
