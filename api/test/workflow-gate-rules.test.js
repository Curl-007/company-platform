const assert = require("node:assert/strict");
const test = require("node:test");
const {
  GATE_RULE_CATALOG,
  evaluateStageGate,
  normalizeStageRules,
  defaultRulesForStage,
} = require("../src/workflow/gateRules");
const { createProjectFlowService } = require("../src/modules/workflow/service");

test("gate rule catalog is non-empty and unique", () => {
  assert.ok(GATE_RULE_CATALOG.length >= 8);
  const ids = GATE_RULE_CATALOG.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("normalizeStageRules drops unknown ids and de-dupes", () => {
  const rules = normalizeStageRules([
    { id: "task_completion_ratio", op: "gte", threshold: 80 },
    { id: "task_completion_ratio", op: "gte", threshold: 0.9 },
    { id: "not_a_real_rule" },
  ]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, "task_completion_ratio");
  assert.equal(rules[0].threshold, 0.8);
});

test("evaluateStageGate uses configured threshold", () => {
  const gate = evaluateStageGate(
    {
      id: "development",
      label: "开发",
      rules: [
        { id: "task_completion_ratio", op: "gte", threshold: 0.5, required: true },
        { id: "no_blocked_tasks", required: true },
      ],
    },
    {
      taskCompletionRatio: 0.6,
      taskBlockedCount: 0,
      taskTotal: 10,
    },
  );
  assert.equal(gate.state, "passed");
  assert.equal(gate.checks.length, 2);
  assert.equal(gate.checks.every((item) => item.passed), true);
});

test("default rules exist for built-in stages", () => {
  assert.ok(defaultRulesForStage("requirement").length > 0);
  assert.ok(defaultRulesForStage("release").some((rule) => rule.id === "prior_stages_passed"));
});

test("evaluateProjectFlow applies custom stage rules from template", async () => {
  const service = createProjectFlowService({
    row: async (sql) => {
      if (sql.includes("FROM projects")) {
        return { id: "PRJ-1", name: "Demo", status: "active", health_score: 80, product_id: null, deleted_at: null };
      }
      if (sql.includes("FROM releases")) return null;
      return null;
    },
    rows: async (sql) => {
      if (sql.includes("FROM requirements")) return [{ status: "approved" }];
      if (sql.includes("FROM tasks")) {
        return [
          { status: "done", estimated_hours: 1, actual_hours: 1, remaining_hours: 0 },
          { status: "todo", estimated_hours: 1, actual_hours: 0, remaining_hours: 1 },
        ];
      }
      if (sql.includes("FROM defects")) return [];
      if (sql.includes("FROM test_cases")) return [];
      if (sql.includes("FROM documents")) return [];
      return [];
    },
    getProjectBinding: async () => ({ templateId: "WFT-1", templateVersion: "v1", source: "binding" }),
    getTemplate: async () => ({
      id: "WFT-1",
      name: "低门槛开发",
      version: "v1",
      mode: "configurable",
      stages: [
        {
          id: "development",
          label: "开发",
          rules: [{ id: "task_completion_ratio", op: "gte", threshold: 0.4, required: true }],
        },
        {
          id: "release",
          label: "发布",
          rules: [{ id: "prior_stages_passed", required: true }],
        },
      ],
    }),
  });

  const flow = await service.evaluateProjectFlow("PRJ-1");
  assert.equal(flow.gates[0].stage, "development");
  assert.equal(flow.gates[0].state, "passed");
  assert.equal(flow.gates[1].stage, "release");
  // prior passed, but no release record => blocked/in_progress depending required rules
  assert.ok(["blocked", "in_progress", "passed"].includes(flow.gates[1].state));
  assert.ok(flow.gates[0].checks.some((item) => item.ruleId === "task_completion_ratio"));
});
