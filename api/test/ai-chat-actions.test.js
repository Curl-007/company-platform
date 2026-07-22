const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ACTION_TYPES,
  buildLocalAction,
  detectIntentType,
  extractProposedActions,
  stripActionJson,
} = require("../src/modules/ai/chatActions");

test("action type catalog covers core business write surfaces", () => {
  for (const type of [
    "create_requirement", "create_defect", "create_task", "create_test_case",
    "create_project", "create_product", "create_build", "create_release",
    "create_document", "create_sprint", "create_work_log", "create_time_entry",
    "create_risk", "create_program", "create_portfolio", "create_strategic_goal",
    "update_requirement_status", "update_defect_status", "update_task_status",
    "update_test_case_status", "update_project_status", "update_build_status", "update_release_status",
    "delete_requirement", "delete_defect", "delete_task", "delete_test_case",
    "delete_project", "delete_product", "delete_build", "delete_release", "delete_document", "delete_sprint",
  ]) {
    assert.ok(ACTION_TYPES.includes(type), `missing ${type}`);
  }
});

test("detects create/update/delete/status intents across domains", () => {
  assert.equal(detectIntentType([{ role: "user", content: "帮我新建一个缺陷：登录超时" }]), "create_defect");
  assert.equal(detectIntentType([{ role: "user", content: "创建任务：补齐单测" }]), "create_task");
  assert.equal(detectIntentType([{ role: "user", content: "新建测试用例：登录成功路径" }]), "create_test_case");
  assert.equal(detectIntentType([{ role: "user", content: "立项一个新项目：门户改版" }]), "create_project");
  assert.equal(detectIntentType([{ role: "user", content: "创建构建：1.2.0" }]), "create_build");
  assert.equal(detectIntentType([{ role: "user", content: "提交日报：完成联调" }]), "create_work_log");
  assert.equal(detectIntentType([{ role: "user", content: "记录工时 3 小时" }]), "create_time_entry");
  assert.equal(detectIntentType([{ role: "user", content: "把 REQ-001 状态改为 testing" }]), "update_requirement_status");
  assert.equal(detectIntentType([{ role: "user", content: "删除 BUG-002" }]), "delete_defect");
  assert.equal(detectIntentType([{ role: "user", content: "修改任务 TASK-003 标题为重构" }]), "update_task");
});

test("extracts multi-type ACTION_JSON", () => {
  const text = '好的\nACTION_JSON:{"type":"create_build","title":"nightly","projectId":"PRJ-001","version":"1.0.1"}';
  const actions = extractProposedActions(text);
  assert.equal(actions[0].type, "create_build");
  assert.equal(actions[0].title, "nightly");
  assert.equal(actions[0].projectId, "PRJ-001");
  assert.doesNotMatch(stripActionJson(text), /ACTION_JSON/);
});

test("local action builds drafts for expanded domains", () => {
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

  const project = buildLocalAction({
    messages: [{ role: "user", content: "新建项目：标题：数据中台，负责人 项目经理" }],
    attachments: [],
    context,
  });
  assert.equal(project.type, "create_project");
  assert.equal(project.title, "数据中台");

  const log = buildLocalAction({
    messages: [{ role: "user", content: "提交日报：完成支付联调，明日提测" }],
    attachments: [],
    context,
  });
  assert.equal(log.type, "create_work_log");
  assert.match(log.content || log.description || "", /支付联调|提测/);
});
