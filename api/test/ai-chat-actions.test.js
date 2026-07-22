const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildLocalAction,
  detectIntentType,
  extractProposedActions,
  stripActionJson,
} = require("../src/modules/ai/chatActions");

test("detects create/update/delete/status intents for requirement defect task", () => {
  assert.equal(detectIntentType([{ role: "user", content: "帮我新建一个缺陷：登录超时" }]), "create_defect");
  assert.equal(detectIntentType([{ role: "user", content: "创建任务：补齐单测" }]), "create_task");
  assert.equal(detectIntentType([{ role: "user", content: "把 REQ-001 状态改为 testing" }]), "update_requirement_status");
  assert.equal(detectIntentType([{ role: "user", content: "删除 BUG-002" }]), "delete_defect");
  assert.equal(detectIntentType([{ role: "user", content: "修改任务 TASK-003 标题为重构" }]), "update_task");
});

test("extracts multi-type ACTION_JSON", () => {
  const text = '好的\nACTION_JSON:{"type":"update_defect_status","resourceId":"BUG-001","status":"in_fix"}';
  const actions = extractProposedActions(text);
  assert.equal(actions[0].type, "update_defect_status");
  assert.equal(actions[0].resourceId, "BUG-001");
  assert.equal(actions[0].status, "in_fix");
  assert.doesNotMatch(stripActionJson(text), /ACTION_JSON/);
});

test("local action builds defect and task drafts", () => {
  const context = {
    projects: [{ id: "PRJ-001", name: "Portal" }],
    requirements: [{ id: "REQ-001", title: "Checkout" }],
    openDefects: [{ id: "BUG-001", title: "Timeout" }],
    blockedTasks: [{ id: "TASK-001", title: "Fix payment" }],
  };
  const defect = buildLocalAction({
    messages: [{ role: "user", content: "新建缺陷：标题：支付超时，严重级别高，项目 Portal" }],
    attachments: [],
    context,
  });
  assert.equal(defect.type, "create_defect");
  assert.equal(defect.title, "支付超时");
  assert.equal(defect.severity, "high");
  assert.equal(defect.projectId, "PRJ-001");

  const status = buildLocalAction({
    messages: [{ role: "user", content: "把 BUG-001 状态改为修复中" }],
    attachments: [],
    context,
  });
  assert.equal(status.type, "update_defect_status");
  assert.equal(status.resourceId, "BUG-001");
  assert.equal(status.status, "in_fix");

  const task = buildLocalAction({
    messages: [{ role: "user", content: "创建任务：标题：补齐单测，预估 4 小时，指派给 开发工程师，项目 PRJ-001" }],
    attachments: [],
    context,
  });
  assert.equal(task.type, "create_task");
  assert.equal(task.title, "补齐单测");
  assert.equal(task.estimatedHours, 4);
  assert.equal(task.projectId, "PRJ-001");
});
