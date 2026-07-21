const { STATUS_VALUES, TRANSITIONS } = require("./stateMachine");

const PROJECT_DELIVERY_STAGES = Object.freeze([
  Object.freeze({
    id: "initiation",
    label: "立项",
    description: "项目目标、范围、负责人和基础计划完成登记。",
    evidence: Object.freeze(["项目目标", "负责人", "计划日期"]),
    exitCriteria: Object.freeze(["项目具备目标、计划日期和基础责任人信息"]),
  }),
  Object.freeze({
    id: "requirement",
    label: "需求",
    description: "需求进入评审、批准并形成可交付范围。",
    evidence: Object.freeze(["需求列表", "需求状态", "需求完成度"]),
    exitCriteria: Object.freeze(["关键需求已批准，取消项不进入后续交付范围"]),
  }),
  Object.freeze({
    id: "design",
    label: "设计",
    description: "文档、方案和关键决策沉淀为可追溯证据。",
    evidence: Object.freeze(["设计文档", "项目决策", "AI 文档分析结果"]),
    exitCriteria: Object.freeze(["关键设计文档或决策记录已归档"]),
  }),
  Object.freeze({
    id: "development",
    label: "开发",
    description: "任务进入开发、评审和测试前流转。",
    evidence: Object.freeze(["WBS 任务", "Sprint 承诺", "任务状态历史"]),
    exitCriteria: Object.freeze(["任务状态按固定状态机流转并保留状态历史"]),
  }),
  Object.freeze({
    id: "testing",
    label: "测试",
    description: "测试用例、测试执行和缺陷闭环验证交付质量。",
    evidence: Object.freeze(["测试用例", "测试执行", "缺陷漏斗"]),
    exitCriteria: Object.freeze(["阻塞缺陷已处理，测试执行结果可追溯"]),
  }),
  Object.freeze({
    id: "acceptance",
    label: "验收",
    description: "需求进入验收或关闭，发布前证据完成复核。",
    evidence: Object.freeze(["验收状态", "发布门禁", "审计记录"]),
    exitCriteria: Object.freeze(["需求达到验收/关闭口径，发布门禁无阻断"]),
  }),
  Object.freeze({
    id: "release",
    label: "发布",
    description: "构建、发布、审批和回滚记录形成交付闭环。",
    evidence: Object.freeze(["构建记录", "发布记录", "发布审批", "回滚记录"]),
    exitCriteria: Object.freeze(["发布或回滚动作具备审计证据"]),
  }),
]);

function cloneTransitionMap(resource) {
  return Object.fromEntries(
    Object.entries(TRANSITIONS[resource] || {}).map(([from, to]) => [from, [...to]]),
  );
}

function buildResourceFlow(resource, label) {
  return {
    resource,
    label,
    statuses: [...STATUS_VALUES[resource]],
    transitions: cloneTransitionMap(resource),
  };
}

const LIGHTWEIGHT_STAGES = Object.freeze([
  Object.freeze({
    id: "initiation",
    label: "启动",
    description: "明确目标和负责人后即可启动。",
    evidence: Object.freeze(["项目目标", "负责人"]),
    exitCriteria: Object.freeze(["项目已离开 planning 状态"]),
    rules: Object.freeze([{ id: "project_not_planning", required: true }]),
  }),
  Object.freeze({
    id: "development",
    label: "开发",
    description: "任务推进与阻塞清理。",
    evidence: Object.freeze(["任务完成率", "阻塞任务"]),
    exitCriteria: Object.freeze(["任务完成率达标且无阻塞任务"]),
    rules: Object.freeze([
      { id: "task_exists", required: true },
      { id: "task_completion_ratio", op: "gte", threshold: 0.6, required: true },
      { id: "no_blocked_tasks", required: true },
    ]),
  }),
  Object.freeze({
    id: "testing",
    label: "测试",
    description: "关键缺陷关闭后可进入发布。",
    evidence: Object.freeze(["缺陷状态"]),
    exitCriteria: Object.freeze(["无阻塞/严重未关闭缺陷"]),
    rules: Object.freeze([
      { id: "no_open_blocking_defects", required: true },
      { id: "no_open_critical_defects", required: true },
    ]),
  }),
  Object.freeze({
    id: "release",
    label: "发布",
    description: "前置通过且存在发布记录。",
    evidence: Object.freeze(["发布记录"]),
    exitCriteria: Object.freeze(["前置阶段通过并完成发布"]),
    rules: Object.freeze([
      { id: "prior_stages_passed", required: true },
      { id: "release_exists", required: true },
    ]),
  }),
]);

const WORKFLOW_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "fixed-project-delivery-v1",
    name: "固定交付",
    version: "2026-07-21",
    scope: "project",
    mode: "fixed",
    description: "完整七阶段交付流程：立项→需求→设计→开发→测试→验收→发布。",
    processModes: Object.freeze(["scrum", "kanban", "waterfall"]),
    stages: PROJECT_DELIVERY_STAGES,
    resources: Object.freeze([
      Object.freeze(buildResourceFlow("project", "项目")),
      Object.freeze(buildResourceFlow("requirement", "需求")),
      Object.freeze(buildResourceFlow("task", "任务")),
      Object.freeze(buildResourceFlow("sprint", "迭代")),
      Object.freeze(buildResourceFlow("aiJob", "AI 任务")),
    ]),
    guardrails: Object.freeze([
      "默认完整交付模板，适合正式项目。",
      "工作日志、工时、容量和 WIP 不用于个人绩效评价。",
    ]),
  }),
  Object.freeze({
    id: "lightweight-delivery-v1",
    name: "轻量交付",
    version: "2026-07-21",
    scope: "project",
    mode: "fixed",
    description: "四阶段轻量流程：启动→开发→测试→发布，门禁更少、推进更快。",
    processModes: Object.freeze(["scrum", "kanban"]),
    stages: LIGHTWEIGHT_STAGES,
    resources: Object.freeze([
      Object.freeze(buildResourceFlow("project", "项目")),
      Object.freeze(buildResourceFlow("task", "任务")),
      Object.freeze(buildResourceFlow("sprint", "迭代")),
    ]),
    guardrails: Object.freeze([
      "轻量模板适合试点或小改动项目。",
      "工作日志、工时、容量和 WIP 不用于个人绩效评价。",
    ]),
  }),
]);

function publicWorkflowTemplates() {
  return WORKFLOW_TEMPLATES.map((template) => ({
    ...template,
    processModes: [...template.processModes],
    stages: template.stages.map((stage) => ({
      ...stage,
      evidence: stage.evidence ? [...stage.evidence] : [],
      exitCriteria: stage.exitCriteria ? [...stage.exitCriteria] : [],
      rules: stage.rules ? stage.rules.map((rule) => ({ ...rule })) : undefined,
    })),
    resources: template.resources.map((resource) => ({
      ...resource,
      statuses: [...resource.statuses],
      transitions: Object.fromEntries(
        Object.entries(resource.transitions).map(([from, to]) => [from, [...to]]),
      ),
    })),
    guardrails: [...template.guardrails],
  }));
}

module.exports = {
  WORKFLOW_TEMPLATES,
  publicWorkflowTemplates,
};
