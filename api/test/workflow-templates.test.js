const assert = require("node:assert/strict");
const test = require("node:test");
const {
  builtinTemplates,
  BUILTIN_ID,
  LIGHTWEIGHT_ID,
  createWorkflowTemplateStore,
} = require("../src/workflow/templateStore");
const { createProjectFlowService } = require("../src/modules/workflow/service");

test("builtin templates expose fixed and lightweight options only", () => {
  const templates = builtinTemplates();
  assert.equal(templates.length, 2);
  assert.deepEqual(templates.map((item) => item.id).sort(), [BUILTIN_ID, LIGHTWEIGHT_ID].sort());
  assert.ok(templates.every((item) => item.builtin && item.status === "published"));
});

test("template store only allows binding the two builtin templates", async () => {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE project_workflow_bindings (
      project_id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      template_version TEXT NOT NULL,
      bound_by TEXT,
      bound_at TEXT NOT NULL
    );
  `);
  const store = createWorkflowTemplateStore({
    insert: async (table, data) => {
      const keys = Object.keys(data);
      db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((k) => `@${k}`).join(",")})`).run(data);
    },
    row: async (sql, params = {}) => db.prepare(sql).get(params),
    rows: async (sql, params = {}) => db.prepare(sql).all(params),
    run: async (sql, params = {}) => db.prepare(sql).run(params),
    json: (value) => JSON.stringify(value),
    parse: (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } },
    now: () => "2026-07-21T10:00:00.000Z",
    nextId: async () => "WFT-X",
  });

  const list = await store.listTemplates();
  assert.equal(list.length, 2);

  await assert.rejects(() => store.createDraft({ name: "x", stages: [{ id: "a", label: "A" }] }, { id: "U1" }), /两个内置模板|VALIDATION_FAILED|关闭/);
  await assert.rejects(() => store.bindProjectTemplate("PRJ-1", "WFT-CUSTOM", { id: "U1" }), /固定交付|轻量交付|VALIDATION_FAILED/);

  const binding = await store.bindProjectTemplate("PRJ-1", LIGHTWEIGHT_ID, { id: "U1" });
  assert.equal(binding.templateId, LIGHTWEIGHT_ID);
  const got = await store.getProjectBinding("PRJ-1");
  assert.equal(got.templateId, LIGHTWEIGHT_ID);
});

test("evaluateProjectFlow uses lightweight stage order when bound", async () => {
  const service = createProjectFlowService({
    row: async (sql) => {
      if (sql.includes("FROM projects")) return { id: "PRJ-1", name: "Demo", status: "active", health_score: 80, product_id: null, deleted_at: null };
      if (sql.includes("FROM releases")) return null;
      return null;
    },
    rows: async (sql) => {
      if (sql.includes("FROM requirements")) return [];
      if (sql.includes("FROM tasks")) return [{ status: "done", estimated_hours: 1, actual_hours: 1, remaining_hours: 0 }];
      if (sql.includes("FROM defects")) return [];
      if (sql.includes("FROM test_cases")) return [];
      if (sql.includes("FROM documents")) return [];
      return [];
    },
    getProjectBinding: async () => ({ templateId: LIGHTWEIGHT_ID, templateVersion: "2026-07-21", source: "binding" }),
    getTemplate: async (id) => builtinTemplates().find((item) => item.id === id),
  });
  const flow = await service.evaluateProjectFlow("PRJ-1");
  assert.deepEqual(flow.gates.map((g) => g.stage), ["initiation", "development", "testing", "release"]);
  assert.equal(flow.workflow.templateId, LIGHTWEIGHT_ID);
});
