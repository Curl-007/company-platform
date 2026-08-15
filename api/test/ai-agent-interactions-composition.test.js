// Bonus Sprint 5.1 composition round-trip: a REAL dsh child runtime loads the
// interaction plugins from cordis.yml, the scripted model calls
// ask_user_question, the child bridges the question onto the loopback
// interaction channel, and a platform respond() wakes the long poll so the
// model resumes with the human answer in its tool result.

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
const { createAgentInteractionService } = require("../src/modules/ai/agentInteractionsService");
const { hasPermission, publicUser } = require("../src/security/accessControl");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");

function nowIso() {
  return new Date().toISOString();
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

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Composition upstream did not expose a TCP port.");
  return { port: address.port, server };
}

// Explicit test environment for the spawned child: NODE_ENV pinned, all
// SEED_* keys cleared (repo convention for spawn-based tests).
function childEnvironment(home) {
  const env = { HARNESS_HOME: home, NODE_ENV: "test" };
  for (const key of ["ComSpec", "LANG", "LC_ALL", "LC_CTYPE", "NODE_ENV", "PATHEXT", "PATH", "SystemRoot", "TEMP", "TMP", "TZ", "WINDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.NODE_ENV = "test";
  for (const key of Object.keys(env)) {
    if (key.startsWith("SEED_")) delete env[key];
  }
  return env;
}

test("Harness composition round-trips ask_user_question through the platform interaction bridge", { timeout: 60000 }, async () => {
  const dbRuntime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  dbRuntime.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, status TEXT DEFAULT 'active', permissions TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, owner TEXT, status TEXT DEFAULT 'in_progress', deleted_at TEXT);
    CREATE TABLE ai_capability_invocations (id TEXT PRIMARY KEY, capability_id TEXT, capability_version TEXT, status TEXT, actor_id TEXT, project_id TEXT, created_at TEXT);
    CREATE TABLE ai_interactions (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
      invocation_id TEXT NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, responded_at TEXT, responded_by TEXT, response TEXT
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
  await access.insert("ai_capability_invocations", {
    id: "AIC-COMP-1", capability_id: "project-snapshot", capability_version: "1.0.0",
    status: "running", actor_id: "USR-COMP", project_id: "PRJ-1", created_at: nowIso(),
  });
  const tokenService = createScopedExecutionTokenService({ secret: "composition-interaction-secret" });
  const audits = [];
  const notifications = [];
  const interactionService = createAgentInteractionService({
    audit: async (actor, action, resourceType, resourceId) => {
      audits.push({ action, resourceId, resourceType });
    },
    canAccessProject: async (_user, projectId) => projectId === "PRJ-1",
    findInvocation: async (id) => (id === "AIC-COMP-1" ? { id, project_id: "PRJ-1" } : null),
    hasPermission,
    insert: access.insert,
    json,
    now: () => nowIso(),
    notifyInteraction: (userId, invocationId, interaction) => notifications.push({ interaction, userId }),
    publicUser,
    row: access.row,
    rows: access.rows,
    run: access.run,
    tokenService,
  });
  const gateway = createExecutionGateway({
    audit: async () => {},
    canAccessProject: async (_user, projectId) => projectId === "PRJ-1",
    controlStore: { get: async () => ({ enabled: true }) },
    hasPermission,
    insert: access.insert,
    interactionHandler: interactionService.loopbackHandler,
    json,
    nextId: async (prefix) => `${prefix}-COMP`,
    now: () => nowIso(),
    publicUser,
    registry: createCapabilityRegistry(),
    row: access.row,
    rows: access.rows,
    tokenService,
  });
  const gatewayBaseUrl = await gateway.start();
  const executionToken = tokenService.issue({
    actorId: "USR-COMP",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-COMP-1",
    projectId: "PRJ-1",
  }).token;

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
    const chunkJson = (payload) => `data: ${JSON.stringify({ created: 0, id: "chatcmpl-smoke", model: "smoke-model", object: "chat.completion.chunk", ...payload })}\n\n`;
    if (upstreamRequests.length === 1) {
      // First turn: the scripted model asks the user a question.
      res.write(chunkJson({
        choices: [{
          delta: { tool_calls: [{ index: 0, id: "call-ask-1", type: "function", function: { name: "ask_user_question", arguments: "" } }] },
          finish_reason: null,
          index: 0,
        }],
      }));
      res.write(chunkJson({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: {
                arguments: JSON.stringify({
                  questions: [{
                    id: "template",
                    question: "Which delivery template should the summary use?",
                    header: "Template",
                    options: [{ label: "Fixed delivery" }, { label: "Lightweight" }],
                  }],
                }),
              },
            }],
          },
          finish_reason: null,
          index: 0,
        }],
      }));
      res.write(chunkJson({ choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }] }));
    } else {
      // Later turns: the human answer is in the conversation; finish.
      res.write(chunkJson({
        choices: [{ delta: { content: "The user chose the Lightweight template." }, finish_reason: null, index: 0 }],
      }));
      res.write(chunkJson({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }));
    }
    res.end("data: [DONE]\n\n");
  });

  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-ask-"));
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: childEnvironment(home),
    logger: { warn: () => {} },
  });

  // While the child waits for the human, the platform user answers through
  // the same service the REST routes use.
  const responder = (async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const pending = await interactionService.listForUser({ id: "USR-COMP", permissions: ["*"] }, { status: "pending" });
      if (pending.length > 0) {
        return interactionService.respond({
          body: { answer: { answers: [{ id: "template", selected: ["Lightweight"] }] } },
          id: pending[0].interactionId,
          ip: "127.0.0.1",
          user: { id: "USR-COMP", name: "Composition Tester", permissions: ["*"] },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("The pending interaction never reached the platform.");
  })();

  try {
    const text = await runtime.run({
      config: {
        apiKey: "smoke-ask-provider-key",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-model",
        wireApi: "chat_completions",
      },
      execution: {
        capabilityId: "project-snapshot",
        capabilityVersion: "1.0.0",
        gatewayBaseUrl,
        projectId: "PRJ-1",
        token: executionToken,
      },
      prompt: "Ask the user which delivery template to use with ask_user_question, then summarize the choice.",
      timeoutMs: 45_000,
    });

    assert.equal(text, "The user chose the Lightweight template.");
    const answered = await responder;
    assert.equal(answered.status, "answered");
    assert.deepEqual(answered.response.answers, [{ id: "template", selected: ["Lightweight"] }]);

    // The model-facing tool list of turn one contains the ask tool, and the
    // second model request carries the human's tool result verbatim.
    const toolNames = (upstreamRequests[0].tools || []).map((tool) => tool.function?.name || tool.name);
    assert.equal(toolNames.includes("ask_user_question"), true);
    assert.equal(JSON.stringify(upstreamRequests[1]).includes("Lightweight"), true);

    // Full audit + push trail for the round trip.
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ["ai.interaction_created", "ai.interaction_responded"],
    );
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].userId, "USR-COMP");
  } finally {
    await runtime.close();
    await new Promise((resolve) => server.close(() => resolve()));
    await gateway.close();
    await fs.rm(home, { force: true, recursive: true });
  }
});
