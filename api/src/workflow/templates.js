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

const WORKFLOW_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "fixed-project-delivery-v1",
    name: "固定项目交付流程",
    version: "2026-07-15",
    scope: "project",
    mode: "fixed",
    description: "当前实现使用固定阶段门禁与固定状态机；后续可配置模板引擎应保持本只读契约兼容。",
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
      "项目激活仍受目标、计划、成员、里程碑/Sprint、容量投入和容量计划门禁约束。",
      "所有状态变更必须经过固定状态机校验并写入状态历史或审计证据。",
      "工作日志、工时、容量和 WIP 仅用于资源协调、交付追溯和风险提示，不用于个人绩效、排名、薪酬、晋升或淘汰。",
      "当前模板不包含请假或请假审批流程。",
    ]),
  }),
]);

function publicWorkflowTemplates() {
  return WORKFLOW_TEMPLATES.map((template) => ({
    ...template,
    processModes: [...template.processModes],
    stages: template.stages.map((stage) => ({
      ...stage,
      evidence: [...stage.evidence],
      exitCriteria: [...stage.exitCriteria],
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
