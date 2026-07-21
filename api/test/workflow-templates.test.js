const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeTemplateBody,
  builtinTemplates,
  createWorkflowTemplateStore,
} = require("../src/workflow/templateStore");
const { createProjectFlowService } = require("../src/modules/workflow/service");

test("normalizeTemplateBody rejects empty stages", () => {
  assert.throws(() => normalizeTemplateBody({ name: "x", stages: [] }), /at least one stage/);
});

test("normalizeTemplateBody accepts custom stage catalog", () => {
  const body = normalizeTemplateBody({
    name: "轻量交付",
    stages: [
      { id: "initiation", label: "启动" },
      { id: "development", label: "开发" },
      { id: "release", label: "上线" },
    ],
  });
  assert.equal(body.stages.length, 3);
  assert.equal(body.stages[1].id, "development");
});

test("builtinTemplates still expose fixed delivery template", () => {
  const templates = builtinTemplates();
  assert.ok(templates.some((item) => item.id === "fixed-project-delivery-v1"));
  assert.equal(templates[0].builtin, true);
});

test("template store create/publish/bind against memory sqlite helpers", async () => {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      definition_json TEXT NOT NULL,
      created_by TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE project_workflow_bindings (
      project_id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      template_version TEXT NOT NULL,
      bound_by TEXT,
      bound_at TEXT NOT NULL
    );
  `);

  let nextIdSeq = 0;
  const store = createWorkflowTemplateStore({
    insert: async (table, data) => {
      const keys = Object.keys(data);
      db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((k) => `@${k}`).join(",")})`).run(data);
    },
    row: async (sql, params = {}) => db.prepare(sql).get(params),
    rows: async (sql, params = {}) => db.prepare(sql).all(params),
    run: async (sql, params = {}) => db.prepare(sql).run(params),
    json: (value) => JSON.stringify(value),
    parse: (value, fallback = null) => {
      try { return JSON.parse(value); } catch { return fallback; }
    },
    now: () => "2026-07-21T10:00:00.000Z",
    nextId: async () => {
      nextIdSeq += 1;
      return `WFT-TEST-${nextIdSeq}`;
    },
  });

  const draft = await store.createDraft({
    name: "自定义三阶段",
    stages: [
      { id: "initiation", label: "启动" },
      { id: "development", label: "开发" },
      { id: "release", label: "发布" },
    ],
  }, { id: "USR-ADMIN" });
  assert.equal(draft.status, "draft");
  assert.equal(draft.stages.length, 3);

  const published = await store.publishTemplate(draft.id);
  assert.equal(published.status, "published");
  assert.match(published.version, /^v/);

  const binding = await store.bindProjectTemplate("PRJ-1", published.id, { id: "USR-ADMIN" });
  assert.equal(binding.templateId, published.id);
  assert.equal(binding.source, "binding");

  const defaultBinding = await store.getProjectBinding("PRJ-NONE");
  assert.equal(defaultBinding.templateId, "fixed-project-delivery-v1");

  const cloned = await store.cloneAsDraft("fixed-project-delivery-v1", { id: "USR-ADMIN" }, {
    name: "内置模板副本",
  });
  assert.equal(cloned.status, "draft");
  assert.equal(cloned.name, "内置模板副本");
  assert.ok(cloned.stages.length >= 3);

  const updated = await store.updateDraft(cloned.id, {
    name: "内置模板副本-改",
    stages: [
      { id: "initiation", label: "启动" },
      { id: "release", label: "发布" },
    ],
  });
  assert.equal(updated.stages.length, 2);
  assert.equal(updated.stages[1].label, "发布");
});

test("evaluateProjectFlow includes workflow binding metadata and custom stage order", async () => {
  const service = createProjectFlowService({
    row: async (sql) => {
      if (sql.includes("FROM projects")) {
        return { id: "PRJ-1", name: "Demo", status: "active", health_score: 80, product_id: null, deleted_at: null };
      }
      if (sql.includes("FROM releases")) return null;
      return null;
    },
    rows: async (sql) => {
      if (sql.includes("FROM requirements")) return [{ status: "approved" }, { status: "draft" }];
      if (sql.includes("FROM tasks")) return [{ status: "done", estimated_hours: 1, actual_hours: 1, remaining_hours: 0 }];
      if (sql.includes("FROM defects")) return [];
      if (sql.includes("FROM test_cases")) return [];
      if (sql.includes("FROM documents")) return [{ type: "design", ai_status: "done" }];
      return [];
    },
    getProjectBinding: async () => ({
      templateId: "WFT-CUSTOM",
      templateVersion: "v1",
      source: "binding",
    }),
    getTemplate: async () => ({
      id: "WFT-CUSTOM",
      name: "自定义",
      version: "v1",
      mode: "configurable",
      stages: [
        { id: "development", label: "开发优先" },
        { id: "initiation", label: "再立项" },
        { id: "release", label: "发布" },
      ],
    }),
  });

  const flow = await service.evaluateProjectFlow("PRJ-1");
  assert.equal(flow.workflow.templateId, "WFT-CUSTOM");
  assert.equal(flow.workflow.mode, "configurable");
  assert.deepEqual(flow.gates.map((gate) => gate.stage), ["development", "initiation", "release"]);
  assert.equal(flow.gates[0].label, "开发优先");
});
