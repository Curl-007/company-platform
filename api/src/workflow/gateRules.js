/**
 * Configurable gate rule catalog and evaluator.
 *
 * Templates store per-stage rules:
 *   { id, op?, threshold?, required? }
 * Evaluation uses project metrics collected by the flow service.
 */

const GATE_RULE_CATALOG = Object.freeze([
  Object.freeze({
    id: "project_not_planning",
    label: "项目已立项（状态不是 planning）",
    description: "项目状态离开 planning 即视为立项完成。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "requirement_approved_ratio",
    label: "需求批准比例",
    description: "已批准及之后状态的需求占比。",
    valueType: "ratio",
    defaultOp: "gte",
    defaultThreshold: 0.5,
  }),
  Object.freeze({
    id: "requirement_exists",
    label: "至少存在需求",
    description: "项目下需求数量 > 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "design_doc_exists",
    label: "存在设计文档",
    description: "文档类型为 design 的数量 > 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "task_completion_ratio",
    label: "任务完成率",
    description: "done 任务占比。",
    valueType: "ratio",
    defaultOp: "gte",
    defaultThreshold: 0.8,
  }),
  Object.freeze({
    id: "no_blocked_tasks",
    label: "无阻塞任务",
    description: "blocked 任务数为 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "task_exists",
    label: "至少存在任务",
    description: "任务数量 > 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "no_open_blocking_defects",
    label: "无未关闭阻塞缺陷",
    description: "new/confirmed/in_fix 缺陷为 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "no_open_critical_defects",
    label: "无未关闭严重缺陷",
    description: "critical 且未关闭/未拒绝的缺陷为 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "test_pass_ratio",
    label: "测试通过率",
    description: "通过用例 / 计划或执行用例。",
    valueType: "ratio",
    defaultOp: "gte",
    defaultThreshold: 0.8,
  }),
  Object.freeze({
    id: "acceptance_doc_exists",
    label: "存在验收/测试文档",
    description: "文档类型为 test 的数量 > 0。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "release_exists",
    label: "存在已发布记录",
    description: "存在 status=released 的发布。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
  Object.freeze({
    id: "prior_stages_passed",
    label: "前置阶段全部通过",
    description: "模板中当前阶段之前的阶段均为 passed/done。",
    valueType: "boolean",
    defaultOp: "eq",
    defaultThreshold: true,
  }),
]);

const RULE_BY_ID = Object.freeze(Object.fromEntries(GATE_RULE_CATALOG.map((item) => [item.id, item])));

const DEFAULT_STAGE_RULES = Object.freeze({
  initiation: Object.freeze([{ id: "project_not_planning", required: true }]),
  requirement: Object.freeze([
    { id: "requirement_exists", required: true },
    { id: "requirement_approved_ratio", op: "gte", threshold: 0.5, required: true },
  ]),
  design: Object.freeze([{ id: "design_doc_exists", required: true }]),
  development: Object.freeze([
    { id: "task_exists", required: true },
    { id: "task_completion_ratio", op: "gte", threshold: 0.8, required: true },
    { id: "no_blocked_tasks", required: true },
  ]),
  testing: Object.freeze([
    { id: "no_open_blocking_defects", required: true },
    { id: "no_open_critical_defects", required: true },
  ]),
  acceptance: Object.freeze([
    { id: "acceptance_doc_exists", required: true },
    { id: "test_pass_ratio", op: "gte", threshold: 0.8, required: true },
  ]),
  release: Object.freeze([
    { id: "prior_stages_passed", required: true },
    { id: "release_exists", required: true },
  ]),
});

function compare(value, op, threshold) {
  const operator = op || "gte";
  if (operator === "eq") return value === threshold;
  if (operator === "neq") return value !== threshold;
  if (operator === "gt") return value > threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "lt") return value < threshold;
  if (operator === "lte") return value <= threshold;
  return false;
}

function formatValue(ruleId, value) {
  const meta = RULE_BY_ID[ruleId];
  if (!meta) return String(value);
  if (meta.valueType === "ratio") return `${Math.round(Number(value) * 100)}%`;
  if (meta.valueType === "boolean") return value ? "是" : "否";
  return String(value);
}

function readMetric(ruleId, metrics, context = {}) {
  switch (ruleId) {
    case "project_not_planning":
      return metrics.projectNotPlanning;
    case "requirement_approved_ratio":
      return metrics.requirementApprovedRatio;
    case "requirement_exists":
      return metrics.requirementTotal > 0;
    case "design_doc_exists":
      return metrics.designDocCount > 0;
    case "task_completion_ratio":
      return metrics.taskCompletionRatio;
    case "no_blocked_tasks":
      return metrics.taskBlockedCount === 0;
    case "task_exists":
      return metrics.taskTotal > 0;
    case "no_open_blocking_defects":
      return metrics.defectBlockingCount === 0;
    case "no_open_critical_defects":
      return metrics.defectCriticalOpenCount === 0;
    case "test_pass_ratio":
      return metrics.testPassRatio;
    case "acceptance_doc_exists":
      return metrics.acceptanceDocCount > 0;
    case "release_exists":
      return metrics.hasRelease;
    case "prior_stages_passed":
      return Boolean(context.priorStagesPassed);
    default:
      return null;
  }
}

function normalizeRule(rule) {
  const id = String(rule?.id || "").trim();
  if (!id || !RULE_BY_ID[id]) return null;
  const meta = RULE_BY_ID[id];
  const op = ["eq", "neq", "gt", "gte", "lt", "lte"].includes(rule?.op) ? rule.op : meta.defaultOp;
  let threshold = rule?.threshold;
  if (threshold == null) threshold = meta.defaultThreshold;
  if (meta.valueType === "ratio") {
    threshold = Number(threshold);
    if (!Number.isFinite(threshold)) threshold = meta.defaultThreshold;
    if (threshold > 1 && threshold <= 100) threshold = threshold / 100;
    threshold = Math.min(1, Math.max(0, threshold));
  } else if (meta.valueType === "boolean") {
    if (typeof threshold === "string") threshold = threshold === "true" || threshold === "1";
    threshold = Boolean(threshold);
  } else {
    threshold = Number(threshold);
    if (!Number.isFinite(threshold)) threshold = meta.defaultThreshold;
  }
  return {
    id,
    op,
    threshold,
    required: rule?.required === false ? false : true,
  };
}

function normalizeStageRules(rules) {
  if (!Array.isArray(rules)) return [];
  const normalized = [];
  const seen = new Set();
  for (const rule of rules.slice(0, 20)) {
    const item = normalizeRule(rule);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }
  return normalized;
}

function defaultRulesForStage(stageId) {
  return (DEFAULT_STAGE_RULES[stageId] || []).map((rule) => normalizeRule(rule)).filter(Boolean);
}

function evaluateRules(rules, metrics, context = {}) {
  const list = normalizeStageRules(rules);
  if (!list.length) {
    return {
      state: "pending",
      checks: [{ name: "未配置门禁规则", passed: false, detail: "请在模板中为该阶段添加规则" }],
    };
  }

  const checks = list.map((rule) => {
    const meta = RULE_BY_ID[rule.id];
    const value = readMetric(rule.id, metrics, context);
    if (value == null) {
      return {
        name: meta?.label || rule.id,
        passed: false,
        detail: "指标不可用",
        ruleId: rule.id,
        required: rule.required,
      };
    }
    const passed = compare(value, rule.op, rule.threshold);
    const thresholdText = meta?.valueType === "ratio"
      ? `${Math.round(Number(rule.threshold) * 100)}%`
      : String(rule.threshold);
    return {
      name: meta?.label || rule.id,
      passed,
      detail: `当前 ${formatValue(rule.id, value)}，要求 ${rule.op || "gte"} ${thresholdText}`,
      ruleId: rule.id,
      required: rule.required,
      actual: value,
      threshold: rule.threshold,
      op: rule.op,
    };
  });

  const requiredChecks = checks.filter((item) => item.required !== false);
  const allRequiredPassed = requiredChecks.every((item) => item.passed);
  const anyFailed = requiredChecks.some((item) => !item.passed);
  // pending if all metrics are zero-ish and failed due to empty data for existence-like rules
  let state = "in_progress";
  if (allRequiredPassed) state = "passed";
  else if (anyFailed) state = "blocked";
  return { state, checks };
}

function evaluateStageGate(stage, metrics, context = {}) {
  const rules = Array.isArray(stage?.rules) && stage.rules.length
    ? stage.rules
    : defaultRulesForStage(stage?.id);
  const result = evaluateRules(rules, metrics, context);
  return {
    stage: stage.id,
    label: stage.label || stage.id,
    description: stage.description || "",
    state: result.state,
    checks: result.checks,
    exitCriteria: stage.exitCriteria || [],
    evidence: stage.evidence || [],
    rules: normalizeStageRules(rules),
  };
}

module.exports = {
  GATE_RULE_CATALOG,
  DEFAULT_STAGE_RULES,
  normalizeRule,
  normalizeStageRules,
  defaultRulesForStage,
  evaluateRules,
  evaluateStageGate,
  readMetric,
};
