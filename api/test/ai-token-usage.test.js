const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createAccess } = require("../src/db/access");
const { createDatabaseBootstrap } = require("../src/db/bootstrap");
const { CORE_TABLES } = require("../src/db/migrationPreflight");
const { applyCompatibilityColumns, inspectSqliteSchema } = require("../src/db/sqliteSchema");
const { createAiCapabilityService } = require("../src/modules/ai/capabilityService");
const { createAiCapabilitiesRouter } = require("../src/modules/ai/capabilityRoutes");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");
const { createTokenUsageRepository, extractTokenUsage } = require("../src/modules/ai/tokenUsage");
const tokenUsageMigration = require("../migrations/20260814_25_ai_token_usage");

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function messageEvent(turn, step, usage) {
  return { data: { message: { role: "assistant" }, step, turn, usage }, seq: turn * 10 + step, time: 1_755_000_000_000, type: "assistant/message" };
}

function usageEvent(turn, step, usage) {
  return { data: { chunk: { type: "usage", usage }, step, turn }, type: "assistant/chunk" };
}

test("token usage extraction folds dsh session usage events without double counting", () => {
  const events = [
    { data: { turn: 1 }, type: "turn/start" },
    usageEvent(1, 1, { inputTokens: 100, outputTokens: 5 }),
    // Final assistant/message for the same turn/step replaces the chunk sample.
    messageEvent(1, 1, { inputTokens: 120, outputTokens: 30, cacheReadTokens: 40, cacheWriteTokens: 10 }),
    { data: { reason: { kind: "completed" }, turn: 1 }, type: "turn/end" },
    messageEvent(2, 1, { inputTokens: 200, outputTokens: 80 }),
  ];
  assert.deepEqual(extractTokenUsage(events), {
    promptTokens: 120 + 40 + 10 + 200,
    completionTokens: 30 + 80,
    totalTokens: 370 + 110,
  });
});

test("token usage extraction accumulates usage across multiple turns", () => {
  const events = [
    { data: { turn: 1, usage: { inputTokens: 50, outputTokens: 20 } }, type: "turn/end" },
    { data: { turn: 2, usage: { inputTokens: 30, outputTokens: 10 } }, type: "turn/end" },
    // A repeated report for the same turn replaces the earlier sample.
    { data: { turn: 2, usage: { inputTokens: 35, outputTokens: 12 } }, type: "turn/end" },
  ];
  assert.deepEqual(extractTokenUsage(events), {
    promptTokens: 50 + 35,
    completionTokens: 20 + 12,
    totalTokens: 85 + 32,
  });
});

test("token usage extraction defaults missing or malformed fields to zero without throwing", () => {
  assert.deepEqual(extractTokenUsage(null), ZERO_USAGE);
  assert.deepEqual(extractTokenUsage("events"), ZERO_USAGE);
  assert.deepEqual(extractTokenUsage([null, 42, "event", {}, { data: null, type: "assistant/message" }]), ZERO_USAGE);
  assert.deepEqual(extractTokenUsage([
    { data: { step: 1, turn: 1, usage: {} }, type: "assistant/message" },
    { data: { step: 2, turn: 1, usage: null }, type: "assistant/message" },
    { data: { step: 3, turn: 1, usage: { inputTokens: "many", outputTokens: Number.NaN } }, type: "assistant/message" },
    { data: { chunk: { text: "hello", type: "text" }, step: 4, turn: 1 }, type: "assistant/chunk" },
    { data: { reason: { kind: "completed" }, turn: 1 }, type: "turn/end" },
  ]), ZERO_USAGE);
});

test("token usage extraction clamps negative counts and accepts provider-style fields", () => {
  assert.deepEqual(extractTokenUsage([
    messageEvent(1, 1, { inputTokens: -5, outputTokens: 10 }),
  ]), { promptTokens: 0, completionTokens: 10, totalTokens: 10 });
  assert.deepEqual(extractTokenUsage([
    { data: { turn: 1, usage: { completion_tokens: 3, prompt_tokens: 7, total_tokens: 10 } }, type: "turn/end" },
  ]), { promptTokens: 7, completionTokens: 3, totalTokens: 10 });
  assert.deepEqual(extractTokenUsage([
    { detail: { usage: { inputTokens: 4, outputTokens: 6 } }, type: "harness.capability.completed" },
  ]), { promptTokens: 4, completionTokens: 6, totalTokens: 10 });
});

function createUsageDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-ai-token-usage-"));
  const db = new DatabaseSync(":memory:");
  const runtime = {
    dialect: "sqlite",
    connection: db,
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    close: () => db.close(),
  };
  const access = createAccess(runtime);
  const bootstrap = createDatabaseBootstrap({
    applyCompatibilityColumns,
    coreTables: CORE_TABLES,
    db,
    databaseRuntime: runtime,
    dialect: "sqlite",
    exec: access._sync.exec,
    fs,
    inspectSqliteSchema,
    migrationsDir: path.join(__dirname, "..", "migrations"),
    now: () => "2026-08-14T00:00:00.000Z",
    runSync: access._sync.run,
    seed: () => undefined,
    storageDir: path.join(directory, "storage"),
  });
  bootstrap.initDbSqlite();
  return {
    access,
    cleanup: () => {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
    db,
  };
}

test("ai_token_usage migration is accepted by the migration ledger and stays idempotent", (t) => {
  const { cleanup, db } = createUsageDatabase();
  t.after(cleanup);

  assert.equal(tokenUsageMigration.id, "20260814_25_ai_token_usage");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = @id").get({ id: tokenUsageMigration.id }).count,
    1,
  );
  const columns = db.prepare("PRAGMA table_info(ai_token_usage)").all().map((column) => column.name);
  assert.deepEqual(columns, [
    "id", "invocation_id", "job_id", "capability_id", "capability_version", "project_id", "actor_id",
    "model", "wire_api", "prompt_tokens", "completion_tokens", "total_tokens", "created_at",
  ]);
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ai_token_usage' AND name LIKE 'idx_ai_token_usage_%'",
  ).all().map((index) => index.name).sort();
  assert.deepEqual(indexes, ["idx_ai_token_usage_capability_created", "idx_ai_token_usage_project_created"]);

  db.prepare(`
    INSERT INTO ai_token_usage (id, invocation_id, capability_id, capability_version, project_id, actor_id, created_at)
    VALUES ('AITU-DEFAULTS', 'AIC-1', 'project-snapshot', '1.0.0', 'PRJ-1', 'USR-1', '2026-08-14T00:00:00.000Z')
  `).run();
  assert.deepEqual(
    { ...db.prepare("SELECT prompt_tokens, completion_tokens, total_tokens FROM ai_token_usage WHERE id = 'AITU-DEFAULTS'").get() },
    { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 },
  );

  tokenUsageMigration.up({ db });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_token_usage").get().count, 1);
});

function usageRow(id, invocationId, capabilityId, capabilityVersion, projectId, promptTokens, completionTokens, createdAt) {
  return {
    id,
    invocation_id: invocationId,
    job_id: null,
    capability_id: capabilityId,
    capability_version: capabilityVersion,
    project_id: projectId,
    actor_id: "USR-1",
    model: "company-model",
    wire_api: "chat_completions",
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    created_at: createdAt,
  };
}

test("token usage repository records metering rows and aggregates filtered summaries", async (t) => {
  const { access, cleanup } = createUsageDatabase();
  t.after(cleanup);
  const repository = createTokenUsageRepository({ insert: access.insert, rows: access.rows });

  await repository.record(usageRow("AITU-1", "AIC-1", "project-snapshot", "1.0.0", "PRJ-1", 100, 50, "2026-08-14T01:00:00.000Z"));
  await repository.record(usageRow("AITU-2", "AIC-2", "project-snapshot", "1.0.0", "PRJ-1", 200, 150, "2026-08-14T02:00:00.000Z"));
  await repository.record(usageRow("AITU-3", "AIC-3", "risk-digest", "1.1.0", "PRJ-2", 10, 5, "2026-08-15T03:00:00.000Z"));

  const all = await repository.summarize();
  assert.deepEqual(all.total, { completionTokens: 205, invocations: 3, promptTokens: 310, totalTokens: 515 });
  assert.deepEqual(all.byCapability.map(({ capabilityId, capabilityVersion }) => ({ capabilityId, capabilityVersion })), [
    { capabilityId: "project-snapshot", capabilityVersion: "1.0.0" },
    { capabilityId: "risk-digest", capabilityVersion: "1.1.0" },
  ]);
  assert.deepEqual(all.byCapability[0], {
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    completionTokens: 200,
    invocations: 2,
    promptTokens: 300,
    totalTokens: 500,
  });

  const scoped = await repository.summarize({ projectId: "PRJ-1" });
  assert.deepEqual(scoped.total, { completionTokens: 200, invocations: 2, promptTokens: 300, totalTokens: 500 });

  const windowed = await repository.summarize({ from: "2026-08-14T01:30:00.000Z", to: "2026-08-15T00:00:00.000Z" });
  assert.deepEqual(windowed.total, { completionTokens: 150, invocations: 1, promptTokens: 200, totalTokens: 350 });

  const byCapability = await repository.summarize({ capabilityId: "risk-digest" });
  assert.deepEqual(byCapability.total, { completionTokens: 5, invocations: 1, promptTokens: 10, totalTokens: 15 });

  // Default shape stays exactly { byCapability, total } (backward compatible).
  const plain = await repository.summarize({ projectId: "PRJ-1" });
  assert.equal("byDay" in plain, false);

  // Day aggregation keeps the original fields and adds byDay (date ASC).
  const daily = await repository.summarize({ groupBy: "day" });
  assert.deepEqual(daily.total, { completionTokens: 205, invocations: 3, promptTokens: 310, totalTokens: 515 });
  assert.equal(daily.byCapability.length, 2);
  assert.deepEqual(daily.byDay, [
    { date: "2026-08-14", completionTokens: 200, invocations: 2, promptTokens: 300, totalTokens: 500 },
    { date: "2026-08-15", completionTokens: 5, invocations: 1, promptTokens: 10, totalTokens: 15 },
  ]);

  const dailyWindowed = await repository.summarize({
    groupBy: "day",
    from: "2026-08-14T01:30:00.000Z",
    to: "2026-08-15T00:00:00.000Z",
  });
  assert.deepEqual(dailyWindowed.byDay, [
    { date: "2026-08-14", completionTokens: 150, invocations: 1, promptTokens: 200, totalTokens: 350 },
  ]);
});

function snapshotResult(events) {
  return {
    execution: { claims: { tokenId: "safe-token-id" } },
    events,
    result: {
      evidence: ["Project PRJ-1 is scoped to this invocation."],
      generatedBy: "harness",
      metrics: { tasks: 3 },
      modelFallback: false,
      project: { id: "PRJ-1", name: "Project one" },
      risks: [],
      summary: "Scoped summary",
    },
  };
}

function createUsageServiceFixture({ invokeAdapter, tokenUsageRepository }) {
  const records = new Map();
  const warnings = [];
  let timestamp = Date.parse("2026-08-14T00:00:00.000Z");
  const now = () => new Date(timestamp += 1_000).toISOString();
  const service = createAiCapabilityService({
    adapter: {
      invoke: invokeAdapter || (async ({ beginExecution }) => {
        await beginExecution();
        return snapshotResult([
          usageEvent(1, 1, { inputTokens: 120, outputTokens: 30, cacheReadTokens: 40 }),
          { data: { reason: { kind: "completed" }, turn: 1 }, type: "turn/end" },
        ]);
      }),
    },
    audit: async () => {},
    canAccessProject: async () => true,
    controlStore: { get: async () => ({ enabled: true }) },
    findProject: async (id) => (id === "PRJ-1" ? { id } : null),
    getAssistantSnapshot: async () => ({ available: true }),
    getProviderSnapshot: async () => ({
      configured: true,
      enabled: true,
      model: "company-model",
      provider: "deepseek",
      wireApi: "chat_completions",
    }),
    hasPermission: () => true,
    json: JSON.stringify,
    logger: { warn: (...args) => warnings.push(args) },
    now,
    parse: (value, fallback) => {
      try { return JSON.parse(value); } catch { return fallback; }
    },
    registry: createCapabilityRegistry(),
    repository: {
      create: async (record) => {
        records.set(record.id, { ...record });
        return records.get(record.id);
      },
      update: async (id, patch) => {
        const updated = { ...records.get(id), ...patch };
        records.set(id, updated);
        return updated;
      },
    },
    tokenService: createScopedExecutionTokenService({ secret: "usage-test-secret-at-least-16" }),
    tokenUsage: tokenUsageRepository,
  });
  return { records, service, warnings };
}

test("AI capability invocation completion records extracted token usage", async () => {
  const recorded = [];
  const { service } = createUsageServiceFixture({
    tokenUsageRepository: { record: async (row) => recorded.push(row) },
  });

  const invocation = await service.invoke({
    actor: { id: "USR-1", permissions: ["ai:*"] },
    capabilityId: "project-snapshot",
    input: { projectId: "PRJ-1" },
    ip: "127.0.0.1",
  });

  assert.equal(invocation.status, "completed");
  assert.equal(recorded.length, 1);
  const usage = recorded[0];
  assert.equal(usage.invocation_id, invocation.invocationId);
  assert.equal(usage.capability_id, "project-snapshot");
  assert.equal(usage.capability_version, "1.0.0");
  assert.equal(usage.project_id, "PRJ-1");
  assert.equal(usage.actor_id, "USR-1");
  assert.equal(usage.model, "company-model");
  assert.equal(usage.wire_api, "chat_completions");
  assert.deepEqual(
    [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens],
    [160, 30, 190],
  );
});

test("AI capability invocation stays completed when the token usage write fails", async () => {
  const { service, warnings } = createUsageServiceFixture({
    tokenUsageRepository: {
      record: async () => {
        const error = new Error("usage store unavailable");
        error.code = "USAGE_WRITE_FAILED";
        throw error;
      },
    },
  });

  const invocation = await service.invoke({
    actor: { id: "USR-1", permissions: ["ai:*"] },
    capabilityId: "project-snapshot",
    input: { projectId: "PRJ-1" },
    ip: "127.0.0.1",
  });

  assert.equal(invocation.status, "completed");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "AI capability token usage write failed:");
  assert.equal(warnings[0][1], "USAGE_WRITE_FAILED");
});

async function withUsageServer({ canAccessProject = async () => true } = {}, work) {
  const { access, cleanup } = createUsageDatabase();
  const repository = createTokenUsageRepository({ insert: access.insert, rows: access.rows });
  const permissions = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-1", permissions: ["*"] };
    next();
  });
  app.use("/api", createAiCapabilitiesRouter({
    canAccessProject,
    fail: (res, status, errorCode, message) => res.status(status).json({ errorCode, message }),
    ok: (data) => ({ data }),
    requirePermission: (permission) => (_req, _res, next) => {
      permissions.push(permission);
      next();
    },
    service: { listForUser: async () => [] },
    tokenUsage: repository,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await work(`http://127.0.0.1:${server.address().port}/api`, permissions, repository);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    cleanup();
  }
}

async function seedUsage(repository) {
  await repository.record(usageRow("AITU-1", "AIC-1", "project-snapshot", "1.0.0", "PRJ-1", 100, 50, "2026-08-14T01:00:00.000Z"));
  await repository.record(usageRow("AITU-2", "AIC-2", "project-snapshot", "1.0.0", "PRJ-1", 200, 150, "2026-08-14T02:00:00.000Z"));
  await repository.record(usageRow("AITU-3", "AIC-3", "risk-digest", "1.1.0", "PRJ-2", 10, 5, "2026-08-15T03:00:00.000Z"));
}

test("AI usage summary API aggregates per capability with filters and permission scoping", async () => {
  await withUsageServer({}, async (baseUrl, permissions, repository) => {
    await seedUsage(repository);

    const all = await fetch(`${baseUrl}/ai/usage/summary`);
    assert.equal(all.status, 200);
    const allBody = await all.json();
    assert.deepEqual(allBody.data.total, { completionTokens: 205, invocations: 3, promptTokens: 310, totalTokens: 515 });
    assert.equal(allBody.data.byCapability.length, 2);
    assert.deepEqual(permissions, ["ai:*"]);

    const scoped = await fetch(`${baseUrl}/ai/usage/summary?projectId=PRJ-1`);
    assert.equal(scoped.status, 200);
    const scopedBody = await scoped.json();
    assert.deepEqual(scopedBody.data.total, { completionTokens: 200, invocations: 2, promptTokens: 300, totalTokens: 500 });
    assert.ok(scopedBody.data.byCapability.every((group) => group.capabilityId === "project-snapshot"));

    const windowed = await fetch(`${baseUrl}/ai/usage/summary?from=2026-08-14T01:30:00.000Z&to=2026-08-15T00:00:00.000Z`);
    assert.equal(windowed.status, 200);
    assert.deepEqual((await windowed.json()).data.total, { completionTokens: 150, invocations: 1, promptTokens: 200, totalTokens: 350 });

    const byCapability = await fetch(`${baseUrl}/ai/usage/summary?capabilityId=risk-digest`);
    assert.equal(byCapability.status, 200);
    assert.deepEqual((await byCapability.json()).data.total, { completionTokens: 5, invocations: 1, promptTokens: 10, totalTokens: 15 });

    const invalid = await fetch(`${baseUrl}/ai/usage/summary?from=not-a-timestamp`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).errorCode, "VALIDATION_FAILED");

    // groupBy=day adds byDay next to the original fields; the default keeps
    // the legacy shape; anything else is a 400.
    const daily = await fetch(`${baseUrl}/ai/usage/summary?groupBy=day`);
    assert.equal(daily.status, 200);
    const dailyBody = await daily.json();
    assert.deepEqual(dailyBody.data.total, { completionTokens: 205, invocations: 3, promptTokens: 310, totalTokens: 515 });
    assert.equal(dailyBody.data.byCapability.length, 2);
    assert.deepEqual(dailyBody.data.byDay, [
      { date: "2026-08-14", completionTokens: 200, invocations: 2, promptTokens: 300, totalTokens: 500 },
      { date: "2026-08-15", completionTokens: 5, invocations: 1, promptTokens: 10, totalTokens: 15 },
    ]);

    const dailyScoped = await fetch(`${baseUrl}/ai/usage/summary?groupBy=day&projectId=PRJ-1`);
    assert.deepEqual((await dailyScoped.json()).data.byDay, [
      { date: "2026-08-14", completionTokens: 200, invocations: 2, promptTokens: 300, totalTokens: 500 },
    ]);

    const defaultGrouping = await fetch(`${baseUrl}/ai/usage/summary?groupBy=capability`);
    assert.equal("byDay" in (await defaultGrouping.json()).data, false);

    const badGrouping = await fetch(`${baseUrl}/ai/usage/summary?groupBy=hour`);
    assert.equal(badGrouping.status, 400);
    assert.equal((await badGrouping.json()).errorCode, "VALIDATION_FAILED");
  });
});

test("AI usage summary API enforces project access before reporting usage", async () => {
  const projectChecks = [];
  await withUsageServer(
    {
      canAccessProject: async (user, projectId) => {
        projectChecks.push({ projectId, userId: user.id });
        return projectId === "PRJ-1";
      },
    },
    async (baseUrl, _permissions, repository) => {
      await seedUsage(repository);

      const allowed = await fetch(`${baseUrl}/ai/usage/summary?projectId=PRJ-1`);
      assert.equal(allowed.status, 200);
      assert.deepEqual((await allowed.json()).data.total, { completionTokens: 200, invocations: 2, promptTokens: 300, totalTokens: 500 });

      const denied = await fetch(`${baseUrl}/ai/usage/summary?projectId=PRJ-2`);
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).errorCode, "PERMISSION_DENIED");
      assert.deepEqual(projectChecks, [
        { projectId: "PRJ-1", userId: "USR-1" },
        { projectId: "PRJ-2", userId: "USR-1" },
      ]);
    },
  );
});
