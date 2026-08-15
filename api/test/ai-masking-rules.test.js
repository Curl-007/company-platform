const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const maskingMigration = require("../migrations/20260815_28_ai_masking_rules");
const {
  compileMatcher,
  createMaskingPolicy,
  createMaskingRuleCache,
  createMaskingRulesService,
} = require("../src/modules/ai/maskingRules");
const { createAiMaskingRouter } = require("../src/modules/ai/maskingRoutes");

const FIXED_NOW = "2026-08-15T00:00:00.000Z";

function createFakeRepository(seedRows = []) {
  const store = new Map();
  for (const row of seedRows) store.set(row.id, { ...row });
  const byCreation = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1);
  return {
    async findById(id) {
      const found = store.get(String(id || ""));
      return found ? { ...found } : undefined;
    },
    async findByName(name) {
      const found = [...store.values()].find((row) => row.name === name);
      return found ? { ...found } : undefined;
    },
    async list() {
      return [...store.values()].sort(byCreation).map((row) => ({ ...row }));
    },
    async listEnabled() {
      return (await this.list()).filter((row) => Number(row.enabled) === 1);
    },
    async create(record) {
      store.set(record.id, { ...record });
    },
    async update(id, fields) {
      const current = store.get(String(id || ""));
      if (!current) return false;
      store.set(id, {
        ...current,
        name: fields.name,
        mode: fields.mode,
        pattern: fields.pattern,
        replacement: fields.replacement,
        is_regex: fields.isRegex ? 1 : 0,
        case_sensitive: fields.caseSensitive ? 1 : 0,
        enabled: fields.enabled ? 1 : 0,
        updated_at: fields.updatedAt,
      });
      return true;
    },
    async remove(id) {
      return store.delete(String(id || ""));
    },
  };
}

function createService(repository, { cache = createMaskingRuleCache() } = {}) {
  let sequence = 0;
  return createMaskingRulesService({
    cache,
    logger: { warn: () => {} },
    nextId: async () => `MASK-TEST-${String(++sequence).padStart(3, "0")}`,
    now: () => FIXED_NOW,
    repository,
  });
}

function compiledRule(rule) {
  return { ...rule, matcher: compileMatcher(rule) };
}

test("masking service applies literal and regex replace rules in order", async () => {
  const service = createService(createFakeRepository());
  await service.create({ mode: "replace", name: "代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" });
  await service.create({ mode: "replace", name: "续接替换", pattern: "[已脱敏]尾巴", replacement: "[二次]" });
  await service.create({ mode: "replace", name: "正则邮箱", pattern: "[a-z]+@internal\\.local", isRegex: true, replacement: "[邮箱]" });

  const result = await service.applyToText("公司机密代号尾巴 与 公司机密代号 以及 user@internal.local");
  assert.deepEqual(result.violations, []);
  // Multi-rule order: the first rule's output feeds the second rule.
  assert.equal(result.text, "[二次] 与 [已脱敏] 以及 [邮箱]");
});

test("masking replace rules honor case sensitivity and literal replacement semantics", async () => {
  const service = createService(createFakeRepository());
  await service.create({
    caseSensitive: true,
    mode: "replace",
    name: "大小写敏感",
    pattern: "Secret",
    replacement: "*",
  });
  await service.create({
    caseSensitive: true,
    isRegex: true,
    mode: "replace",
    name: "正则美元符",
    pattern: "SKU-\\d+",
    replacement: "$&-KEPT",
  });

  const result = await service.applyToText("secret Secret SECRET sku-12 SKU-34");
  // caseSensitive literal/regex match exact casing only, and regex
  // replacements never interpret $& (callback substitution is literal).
  assert.equal(result.text, "secret * SECRET sku-12 $&-KEPT");
});

test("masking service reports block-rule violations without rewriting text", async () => {
  const service = createService(createFakeRepository());
  const apiKeyRule = await service.create({
    isRegex: true,
    mode: "block",
    name: "API 密钥防泄",
    pattern: "sk-[A-Za-z0-9_-]{20,}",
  });
  await service.create({ mode: "replace", name: "代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" });

  const result = await service.applyToText("密钥 sk-abcdefghijklmnopqrst 附带 公司机密代号");
  assert.deepEqual(result.violations, [{
    mode: "block",
    name: "API 密钥防泄",
    pattern: "sk-[A-Za-z0-9_-]{20,}",
    ruleId: apiKeyRule.id,
  }]);
  // Block rules never rewrite; replace rules still apply.
  assert.equal(result.text, "密钥 sk-abcdefghijklmnopqrst 附带 [已脱敏]");

  const clean = await service.applyToText("nothing sensitive here");
  assert.deepEqual(clean, { text: "nothing sensitive here", violations: [] });
});

test("masking policy exposes inspectText and maskText independently", () => {
  const policy = createMaskingPolicy([
    compiledRule({ id: "MASK-B", caseSensitive: false, isRegex: true, mode: "block", name: "JWT 令牌防泄", pattern: "eyJ[A-Za-z0-9_-]{20,}\\.", replacement: "" }),
    compiledRule({ id: "MASK-R", caseSensitive: false, isRegex: false, mode: "replace", name: "代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" }),
  ]);
  assert.deepEqual(policy.inspectText("token eyJabcdefghijklmnopqrstuvwxyz. sig"), [{
    mode: "block",
    name: "JWT 令牌防泄",
    pattern: "eyJ[A-Za-z0-9_-]{20,}\\.",
    ruleId: "MASK-B",
  }]);
  assert.deepEqual(policy.inspectText("公司机密代号"), []);
  assert.equal(policy.maskText("公司机密代号 + eyJabcdefghijklmnopqrstuvwxyz."), "[已脱敏] + eyJabcdefghijklmnopqrstuvwxyz.");
});

test("masking service rejects invalid regex, bad modes, long patterns, and duplicate names", async () => {
  const service = createService(createFakeRepository());
  await assert.rejects(
    () => service.create({ isRegex: true, mode: "replace", name: "坏正则", pattern: "sk-[unclosed" }),
    (error) => error.status === 400 && error.code === "VALIDATION_FAILED",
  );
  await assert.rejects(
    () => service.create({ mode: "redact", name: "坏模式", pattern: "x" }),
    /mode must be one of/,
  );
  await assert.rejects(
    () => service.create({ mode: "replace", name: "空模式", pattern: "   " }),
    /pattern is required/,
  );
  await assert.rejects(
    () => service.create({ mode: "replace", name: "超长", pattern: "a".repeat(513) }),
    /at most 512/,
  );
  await assert.rejects(
    () => service.create({ mode: "replace", name: "超长替换", pattern: "x", replacement: "b".repeat(513) }),
    /at most 512/,
  );
  const created = await service.create({ mode: "replace", name: "唯一名", pattern: "x" });
  await assert.rejects(
    () => service.create({ mode: "replace", name: "唯一名", pattern: "y" }),
    /already exists/,
  );
  const second = await service.create({ mode: "replace", name: "第二规则", pattern: "y" });
  // Update must validate the merged result, not just the patch.
  await assert.rejects(
    () => service.update(created.id, { pattern: "sk-[unclosed", isRegex: true }),
    (error) => error.status === 400,
  );
  // Renaming to another rule's name is a conflict; renaming to itself is not.
  await assert.rejects(
    () => service.update(second.id, { name: "唯一名" }),
    /already exists/,
  );
  await service.update(second.id, { name: "第二规则" });
  assert.equal((await service.list()).length, 2);
});

test("masking service CRUD roundtrip maps snake_case storage to camelCase API fields", async () => {
  const service = createService(createFakeRepository());
  const created = await service.create({
    caseSensitive: true,
    mode: "block",
    name: "往返规则",
    pattern: "INTERNAL-[A-Z]+",
    replacement: "ignored-for-block",
  });
  assert.match(created.id, /^MASK-TEST-/);
  assert.equal(created.isRegex, false);
  assert.equal(created.caseSensitive, true);
  assert.equal(created.enabled, true);
  assert.equal(created.replacement, "");
  assert.equal(created.createdAt, FIXED_NOW);
  assert.deepEqual(Object.keys(created).sort(), [
    "caseSensitive", "createdAt", "enabled", "id", "isRegex", "mode", "name", "pattern", "replacement", "updatedAt",
  ]);

  const { after } = await service.update(created.id, { enabled: false, pattern: "INTERNAL-[A-Z0-9]+" });
  assert.equal(after.enabled, false);
  assert.equal(after.pattern, "INTERNAL-[A-Z0-9]+");
  assert.equal(after.caseSensitive, true);
  assert.equal(after.name, "往返规则");
  assert.equal(after.updatedAt, FIXED_NOW);

  assert.equal((await service.get(created.id)).name, "往返规则");
  await assert.rejects(() => service.get("MASK-MISSING"), (error) => error.status === 404);
  await assert.rejects(() => service.update("MASK-MISSING", { name: "x" }), (error) => error.status === 404);
  await assert.rejects(() => service.remove("MASK-MISSING"), (error) => error.status === 404);

  const removed = await service.remove(created.id);
  assert.equal(removed.id, created.id);
  assert.deepEqual(await service.list(), []);
});

test("masking rule cache serves a snapshot and CRUD writes invalidate it process-wide", async () => {
  const sharedCache = createMaskingRuleCache();
  const repository = createFakeRepository();
  const adminService = createService(repository, { cache: sharedCache });
  const proxyService = createService(repository, { cache: sharedCache });

  await adminService.create({ mode: "replace", name: "规则一", pattern: "甲", replacement: "一" });
  const policy = await proxyService.loadPolicy();
  assert.equal(policy.maskText("甲乙"), "一乙");

  // A raw repository write bypasses invalidation: the snapshot must not change.
  await repository.create({
    id: "MASK-RAW",
    name: "规则二",
    mode: "replace",
    pattern: "乙",
    replacement: "二",
    is_regex: 0,
    case_sensitive: 0,
    enabled: 1,
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
  });
  assert.equal((await proxyService.loadPolicy()).maskText("甲乙"), "一乙");

  // Any service CRUD write invalidates the shared cache for every reader.
  await adminService.update("MASK-RAW", { enabled: true });
  assert.equal((await proxyService.loadPolicy()).maskText("甲乙"), "一二");
});

test("ai_masking_rules migration creates the table and idempotently seeds the three defaults", () => {
  const db = new DatabaseSync(":memory:");
  try {
    maskingMigration.up({ db, now: () => FIXED_NOW });
    maskingMigration.up({ db, now: () => FIXED_NOW });
    const rows = db.prepare("SELECT id, name, mode, pattern, replacement, is_regex, case_sensitive, enabled FROM ai_masking_rules ORDER BY id").all();
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => row.name), ["API 密钥防泄", "JWT 令牌防泄", "示例:代号替换"]);
    assert.deepEqual(rows.map((row) => row.mode), ["block", "block", "replace"]);
    assert.deepEqual(rows.map((row) => Number(row.enabled)), [1, 1, 0]);
    assert.equal(rows[2].replacement, "[已脱敏]");
    assert.equal(Number(rows[2].is_regex), 0);

    const columns = db.prepare("PRAGMA table_info(ai_masking_rules)").all().map((column) => column.name);
    assert.deepEqual(columns, [
      "id", "name", "mode", "pattern", "replacement", "is_regex", "case_sensitive", "enabled", "created_at", "updated_at",
    ]);
    assert.throws(
      () => db.prepare("INSERT INTO ai_masking_rules (id, name, mode, pattern, created_at, updated_at) VALUES ('X', 'API 密钥防泄', 'block', 'p', 't', 't')").run(),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
  }
});

function createMaskingApp({ isAdmin, service }) {
  const app = express();
  app.use(express.json());
  const auditCalls = [];
  app.use((req, _res, next) => {
    req.user = { id: isAdmin ? "USR-ADMIN" : "USR-PM", isAdmin };
    req.ip = "127.0.0.1";
    next();
  });
  const fail = (res, status, errorCode, message) => res.status(status).json({ errorCode, message });
  app.use("/api", createAiMaskingRouter({
    audit: async (actor, action, resourceType, resourceId, before, after) => {
      auditCalls.push({ action, after, before, resourceId, resourceType });
    },
    fail,
    ok: (data) => ({ data }),
    requirePermission: () => (req, res, next) => (req.user?.isAdmin ? next() : fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。")),
    service,
  }));
  return { app, auditCalls };
}

async function withServer(app, work) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("AI masking routes are admin-only and audit every write", async () => {
  const service = createService(createFakeRepository());
  await service.create({ isRegex: true, mode: "block", name: "API 密钥防泄", pattern: "sk-[A-Za-z0-9_-]{20,}" });

  await withServer(createMaskingApp({ isAdmin: false, service }).app, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/ai/masking/rules`);
    assert.equal(denied.status, 403);
    const deniedWrite = await fetch(`${baseUrl}/api/ai/masking/rules`, {
      body: JSON.stringify({ mode: "block", name: "x", pattern: "y" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(deniedWrite.status, 403);
  });

  const { app, auditCalls } = createMaskingApp({ isAdmin: true, service });
  await withServer(app, async (baseUrl) => {
    const listed = await (await fetch(`${baseUrl}/api/ai/masking/rules`)).json();
    assert.equal(listed.data.items.length, 1);
    assert.equal(listed.data.items[0].name, "API 密钥防泄");
    assert.equal(listed.data.items[0].isRegex, true);

    const createdResponse = await fetch(`${baseUrl}/api/ai/masking/rules`, {
      body: JSON.stringify({ mode: "replace", name: "代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(createdResponse.status, 200);
    const created = (await createdResponse.json()).data.item;
    assert.equal(created.name, "代号替换");

    const tested = await (await fetch(`${baseUrl}/api/ai/masking/test`, {
      body: JSON.stringify({ text: "密钥 sk-abcdefghijklmnopqrst 与 公司机密代号" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })).json();
    // Block rules only report violations; the replace rule still rewrites.
    assert.equal(tested.data.masked, "密钥 sk-abcdefghijklmnopqrst 与 [已脱敏]");
    assert.deepEqual(tested.data.violations.map((violation) => violation.name), ["API 密钥防泄"]);

    const patchedResponse = await fetch(`${baseUrl}/api/ai/masking/rules/${created.id}`, {
      body: JSON.stringify({ enabled: false }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    assert.equal(patchedResponse.status, 200);
    assert.equal((await patchedResponse.json()).data.item.enabled, false);

    const invalid = await fetch(`${baseUrl}/api/ai/masking/rules`, {
      body: JSON.stringify({ mode: "replace", name: "坏", pattern: "x[", isRegex: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).errorCode, "VALIDATION_FAILED");

    const deleted = await fetch(`${baseUrl}/api/ai/masking/rules/${created.id}`, { method: "DELETE" });
    assert.deepEqual((await deleted.json()).data, { ok: true });
    assert.equal((await fetch(`${baseUrl}/api/ai/masking/rules`)).status, 200);

    assert.deepEqual(auditCalls.map((entry) => entry.action), [
      "ai.masking_rule.create",
      "ai.masking_rule.update",
      "ai.masking_rule.delete",
    ]);
    assert.equal(auditCalls[0].resourceType, "ai_masking_rule");
    assert.equal(auditCalls[0].after.name, "代号替换");
    assert.equal(auditCalls[2].before.id, created.id);
    assert.equal(auditCalls[2].after, null);
  });
});
