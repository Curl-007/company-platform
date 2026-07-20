const assert = require("node:assert/strict");
const test = require("node:test");
const { publicWorkflowTemplates } = require("../src/workflow/templates");

test("workflow template catalog exposes fixed delivery template as stable copies", () => {
  const templates = publicWorkflowTemplates();
  assert.equal(templates.length, 1);
  const [template] = templates;
  assert.equal(template.id, "fixed-project-delivery-v1");
  assert.equal(template.mode, "fixed");
  assert.deepEqual(template.stages.map((stage) => stage.id), [
    "initiation",
    "requirement",
    "design",
    "development",
    "testing",
    "acceptance",
    "release",
  ]);
  assert.deepEqual(template.resources.find((item) => item.resource === "task").transitions.todo, ["in_progress", "cancelled"]);
  assert.ok(template.guardrails.some((item) => item.includes("不用于个人绩效")));
  assert.ok(template.guardrails.some((item) => item.includes("不包含请假")));

  template.stages[0].evidence.push("mutated");
  template.resources[0].transitions.planning.push("mutated");
  const next = publicWorkflowTemplates()[0];
  assert.equal(next.stages[0].evidence.includes("mutated"), false);
  assert.equal(next.resources[0].transitions.planning.includes("mutated"), false);
});
