const ACTION_TYPES = Object.freeze([
  "create_requirement",
  "update_requirement",
  "update_requirement_status",
  "delete_requirement",
  "create_defect",
  "update_defect",
  "update_defect_status",
  "delete_defect",
  "create_task",
  "update_task",
  "update_task_status",
  "delete_task",
]);

const REQUIREMENT_STATUSES = new Set(["draft", "reviewing", "approved", "in_dev", "testing", "accepted", "closed", "cancelled"]);
const DEFECT_STATUSES = new Set(["new", "confirmed", "in_fix", "resolved", "verified", "closed", "rejected"]);
const TASK_STATUSES = new Set(["todo", "in_progress", "blocked", "code_review", "testing", "acceptance", "done", "cancelled"]);
const DEFECT_SEVERITIES = new Set(["low", "medium", "high", "critical", "blocker"]);
const TASK_TYPES = new Set(["epic", "story", "task", "bug", "milestone", "work_package"]);

// Status intents first (more specific), then delete/create/update.
const INTENT_PATTERNS = [
  { type: "update_requirement_status", re: /\bREQ-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|流转)|(需求).{0,24}(状态|流转).{0,12}(改为|改成|到|为)|(把|将).{0,20}(需求|REQ-).{0,24}(状态|改为|改成)/i },
  { type: "update_defect_status", re: /\bBUG-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|流转)|(缺陷|bug).{0,24}(状态|流转).{0,12}(改为|改成|到|为)|(把|将).{0,20}(缺陷|bug|BUG-).{0,24}(状态|改为|改成)/i },
  { type: "update_task_status", re: /\bTASK-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|流转)|(任务).{0,24}(状态|流转).{0,12}(改为|改成|到|为)|(把|将).{0,20}(任务|TASK-).{0,24}(状态|改为|改成)/i },
  { type: "delete_requirement", re: /(删除|移除|作废).{0,16}(需求|REQ-)/i },
  { type: "delete_defect", re: /(删除|移除).{0,16}(缺陷|bug|BUG-)/i },
  { type: "delete_task", re: /(删除|移除).{0,16}(任务|TASK-)/i },
  { type: "create_requirement", re: /(新建|创建|登记|录入|起草|生成).{0,12}(需求|story|requirement)|(帮我).{0,8}(建|写|录).{0,8}(需求)/i },
  { type: "create_defect", re: /(新建|创建|登记|录入|报).{0,12}(缺陷|bug|缺陷单)|(帮我).{0,8}(建|写|录).{0,8}(缺陷|bug)/i },
  { type: "create_task", re: /(新建|创建|登记|安排|指派).{0,12}(任务|todo|task)|(帮我).{0,8}(建|写|排).{0,8}(任务)/i },
  { type: "update_requirement", re: /(修改|更新|编辑|调整).{0,12}(需求|REQ-)|(需求).{0,12}(改成|改为|修改|更新)/i },
  { type: "update_defect", re: /(修改|更新|编辑|调整).{0,12}(缺陷|bug|BUG-)|(缺陷|bug).{0,12}(改成|改为|修改|更新)/i },
  { type: "update_task", re: /(修改|更新|编辑|调整).{0,12}(任务|TASK-)|(任务).{0,12}(改成|改为|修改|更新)/i },
];

function latestUserText(messages = []) {
  return String(messages[messages.length - 1]?.content || "");
}

function detectIntentType(messages = [], attachments = []) {
  const latest = latestUserText(messages);
  // Prefer id-prefix + 状态 even if Chinese resource word missing.
  if (/\bREQ-[A-Za-z0-9-]+\b/i.test(latest) && /(状态|改为|改成|流转)/i.test(latest) && !/(删除|移除)/i.test(latest)) {
    return "update_requirement_status";
  }
  if (/\bBUG-[A-Za-z0-9-]+\b/i.test(latest) && /(状态|改为|改成|流转)/i.test(latest) && !/(删除|移除)/i.test(latest)) {
    return "update_defect_status";
  }
  if (/\bTASK-[A-Za-z0-9-]+\b/i.test(latest) && /(状态|改为|改成|流转)/i.test(latest) && !/(删除|移除)/i.test(latest)) {
    return "update_task_status";
  }
  for (const item of INTENT_PATTERNS) {
    if (item.re.test(latest)) return item.type;
  }
  const recent = messages
    .filter((item) => item.role === "user")
    .slice(-2)
    .map((item) => item.content)
    .join("\n");
  if (
    attachments.some((item) => item.kind === "document") &&
    /(需求|requirement|验收|功能点)/i.test(recent) &&
    /(建|创建|生成|提炼|整理)/i.test(recent)
  ) {
    return "create_requirement";
  }
  return null;
}

function wantsCreateRequirement(messages = [], attachments = []) {
  return detectIntentType(messages, attachments) === "create_requirement";
}

function stripActionJson(content) {
  return String(content || "")
    .replace(/\n?ACTION_JSON\s*:\s*\{[\s\S]*\}\s*$/i, "")
    .replace(/\n?```(?:json)?\s*\{[\s\S]*?"type"\s*:\s*"[a-z_]+"[\s\S]*?\}\s*```\s*$/i, "")
    .trim();
}

function normalizePriority(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["high", "高", "p0", "p1"].includes(raw)) return "high";
  if (["low", "低", "p3"].includes(raw)) return "low";
  if (["medium", "中", "p2", "mid"].includes(raw)) return "medium";
  return "medium";
}

function normalizeSeverity(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["blocker", "阻塞"].includes(raw)) return "blocker";
  if (["critical", "严重", "致命"].includes(raw)) return "critical";
  if (["high", "高"].includes(raw)) return "high";
  if (["low", "低"].includes(raw)) return "low";
  return "medium";
}

function normalizeAssigneeRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "qa" || raw === "测试") return "qa";
  if (raw === "dev" || raw === "开发") return "dev";
  return "";
}

function normalizeAcceptanceCriteria(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof value === "string") {
    return value
      .split(/\n+|；|;|。/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function normalizeStatus(resource, value) {
  const raw = String(value || "").trim().toLowerCase();
  const map = {
    requirement: {
      草稿: "draft",
      draft: "draft",
      评审: "reviewing",
      reviewing: "reviewing",
      批准: "approved",
      approved: "approved",
      开发: "in_dev",
      in_dev: "in_dev",
      测试: "testing",
      testing: "testing",
      验收: "accepted",
      accepted: "accepted",
      关闭: "closed",
      closed: "closed",
      取消: "cancelled",
      cancelled: "cancelled",
    },
    defect: {
      新建: "new",
      new: "new",
      确认: "confirmed",
      confirmed: "confirmed",
      修复: "in_fix",
      in_fix: "in_fix",
      解决: "resolved",
      resolved: "resolved",
      验证: "verified",
      verified: "verified",
      关闭: "closed",
      closed: "closed",
      驳回: "rejected",
      rejected: "rejected",
    },
    task: {
      待处理: "todo",
      todo: "todo",
      进行中: "in_progress",
      in_progress: "in_progress",
      阻塞: "blocked",
      blocked: "blocked",
      代码评审: "code_review",
      code_review: "code_review",
      测试: "testing",
      testing: "testing",
      验收: "acceptance",
      acceptance: "acceptance",
      完成: "done",
      done: "done",
      取消: "cancelled",
      cancelled: "cancelled",
    },
  };
  const table = map[resource] || {};
  if (table[raw]) return table[raw];
  if (resource === "requirement" && REQUIREMENT_STATUSES.has(raw)) return raw;
  if (resource === "defect" && DEFECT_STATUSES.has(raw)) return raw;
  if (resource === "task" && TASK_STATUSES.has(raw)) return raw;
  for (const [key, mapped] of Object.entries(table)) {
    if (raw.includes(key) || key.includes(raw)) return mapped;
  }
  return "";
}

function parseJsonObject(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(String(raw).replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"'));
    } catch {
      return null;
    }
  }
}

function matchProjectId(source, context) {
  const projects = context?.projects || [];
  for (const project of projects) {
    if (project?.id && source.includes(project.id)) return project.id;
    if (project?.name && source.includes(project.name)) return project.id;
  }
  if (projects.length === 1) return projects[0].id;
  return "";
}

function extractIdLoose(source) {
  const match = String(source || "").match(/\b((?:REQ|BUG|TASK|PRJ)-[A-Za-z0-9-]+)\b/i);
  return match ? match[1].toUpperCase() : "";
}

function guessTitleFromText(text, fallback = "未命名草稿") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const cleaned = line
      .replace(/^#+\s*/, "")
      .replace(/^(标题|需求|名称|缺陷|任务)[:：]\s*/i, "")
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 80 && !/^(背景|描述|验收|目标|优先级|状态)/i.test(cleaned)) {
      return cleaned.slice(0, 80);
    }
  }
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 48) : fallback;
}

function fieldTitle(source) {
  const match = source.match(/(?:标题|名称)[:：]\s*([^\n，,；;]+)/i);
  return match ? match[1].trim().slice(0, 80) : "";
}

function normalizeAction(parsed) {
  const type = String(parsed?.type || "").trim();
  if (!ACTION_TYPES.includes(type)) return null;

  const base = {
    type,
    title: String(parsed.title || "").trim().slice(0, 200),
    description: String(parsed.description || "").trim().slice(0, 8000),
    projectId: String(parsed.projectId || "").trim().slice(0, 64),
    resourceId: String(parsed.resourceId || parsed.id || "").trim().slice(0, 64),
    status: String(parsed.status || "").trim().slice(0, 40),
    priority: normalizePriority(parsed.priority),
    severity: normalizeSeverity(parsed.severity),
    assignee: String(parsed.assignee || parsed.owner || "").trim().slice(0, 80),
    assigneeRole: normalizeAssigneeRole(parsed.assigneeRole),
    acceptanceCriteria: normalizeAcceptanceCriteria(parsed.acceptanceCriteria),
    owner: String(parsed.owner || "").trim().slice(0, 80),
    taskType: String(parsed.taskType || parsed.itemType || "task").trim().slice(0, 40),
    estimatedHours:
      parsed.estimatedHours != null && parsed.estimatedHours !== ""
        ? Number(parsed.estimatedHours)
        : undefined,
    reason: String(parsed.reason || "").trim().slice(0, 500),
  };

  if (base.taskType && !TASK_TYPES.has(base.taskType)) base.taskType = "task";
  if (base.severity && !DEFECT_SEVERITIES.has(base.severity)) base.severity = "medium";

  if (type.includes("requirement") && type.includes("status")) {
    base.status = normalizeStatus("requirement", base.status) || base.status;
  } else if (type.includes("defect") && type.includes("status")) {
    base.status = normalizeStatus("defect", base.status) || base.status;
  } else if (type.includes("task") && type.includes("status")) {
    base.status = normalizeStatus("task", base.status) || base.status;
  }

  if (type.startsWith("create_") && !base.title) return null;
  if ((type.startsWith("update_") || type.startsWith("delete_")) && !base.resourceId && !base.title) return null;
  return base;
}

function extractProposedActions(content) {
  const text = String(content || "");
  const patterns = [
    /ACTION_JSON\s*:\s*(\{[\s\S]*\})\s*$/im,
    /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"[a-z_]+"[\s\S]*?\})\s*```/im,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const action = normalizeAction(parseJsonObject(match[1]));
    if (action) return [action];
  }
  return [];
}

function buildLocalAction({ messages = [], attachments = [], context = null }) {
  const type = detectIntentType(messages, attachments);
  if (!type) return null;

  const latest = latestUserText(messages);
  const docText = attachments
    .filter((item) => item.kind === "document")
    .map((item) => item.contentText || "")
    .join("\n")
    .slice(0, 6000);
  const source = [latest, docText].filter(Boolean).join("\n");
  const projectId = matchProjectId(source, context);
  const fallbackTitle = type.includes("defect")
    ? "未命名缺陷"
    : type.includes("task")
      ? "未命名任务"
      : "未命名需求";
  const explicitTitle = fieldTitle(source);
  const title = type.startsWith("create_") || (type.startsWith("update_") && !type.includes("_status"))
    ? (explicitTitle || guessTitleFromText(source, fallbackTitle))
    : (explicitTitle || "");
  const assignee = ((source.match(/(?:执行人|处理人|负责人|指派给|assignee)[:：]?\s*([^\n，,；;]+)/i) || [])[1] || "")
    .trim()
    .slice(0, 80);

  const common = {
    type,
    title,
    description: [
      docText ? `【来自附件】\n${docText.slice(0, 2500)}` : "",
      latest ? `【对话说明】\n${latest.slice(0, 1500)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000),
    projectId,
    resourceId: "",
    status: "",
    priority: normalizePriority((source.match(/(?:优先级|priority)[:：]?\s*(high|medium|low|高|中|低)/i) || [])[1]),
    severity: normalizeSeverity(
      (source.match(/(?:严重|级别|severity)[:：]?\s*(blocker|critical|high|medium|low|阻塞|严重|高|中|低)/i) || [])[1],
    ),
    assignee,
    assigneeRole: "",
    acceptanceCriteria: [],
    owner: assignee,
    taskType: "task",
    estimatedHours: undefined,
    reason: "",
  };

  if (type.includes("requirement")) {
    common.resourceId = extractIdLoose(source);
    if (common.resourceId && !common.resourceId.startsWith("REQ-")) {
      const onlyReq = source.match(/\b(REQ-[A-Za-z0-9-]+)\b/i);
      common.resourceId = onlyReq ? onlyReq[1].toUpperCase() : common.resourceId.startsWith("REQ") ? common.resourceId : "";
    }
    if (!common.resourceId) {
      const onlyReq = source.match(/\b(REQ-[A-Za-z0-9-]+)\b/i);
      common.resourceId = onlyReq ? onlyReq[1].toUpperCase() : "";
    }
    const criteriaBlock = source.match(/(?:验收标准|验收条件|acceptance)[:：]?\s*([\s\S]{0,1200})/i);
    if (criteriaBlock) common.acceptanceCriteria = normalizeAcceptanceCriteria(criteriaBlock[1]);
    if (type === "update_requirement_status") {
      common.status = normalizeStatus(
        "requirement",
        (source.match(/(?:状态|改为|改成|到)[:：]?\s*([^\n，,；;]+)/i) || [])[1],
      );
    }
  } else if (type.includes("defect")) {
    const onlyBug = source.match(/\b(BUG-[A-Za-z0-9-]+)\b/i);
    common.resourceId = onlyBug ? onlyBug[1].toUpperCase() : "";
    if (type === "update_defect_status") {
      common.status = normalizeStatus(
        "defect",
        (source.match(/(?:状态|改为|改成|到)[:：]?\s*([^\n，,；;]+)/i) || [])[1],
      );
    }
  } else if (type.includes("task")) {
    const onlyTask = source.match(/\b(TASK-[A-Za-z0-9-]+)\b/i);
    common.resourceId = onlyTask ? onlyTask[1].toUpperCase() : "";
    const hours = source.match(/(?:预估|工时|小时)[:：]?\s*(\d+(?:\.\d+)?)/i);
    if (hours) common.estimatedHours = Number(hours[1]);
    if (type === "update_task_status") {
      common.status = normalizeStatus(
        "task",
        (source.match(/(?:状态|改为|改成|到)[:：]?\s*([^\n，,；;]+)/i) || [])[1],
      );
    }
  }

  if ((type.startsWith("update_") || type.startsWith("delete_")) && !common.resourceId) {
    const bag = type.includes("requirement")
      ? context?.requirements
      : type.includes("defect")
        ? context?.openDefects
        : context?.blockedTasks || [];
    const hit = (bag || []).find((item) => item.title && source.includes(item.title));
    if (hit?.id) common.resourceId = hit.id;
  }

  return normalizeAction(common);
}

function actionLabel(type) {
  const map = {
    create_requirement: "新建需求",
    update_requirement: "修改需求",
    update_requirement_status: "变更需求状态",
    delete_requirement: "删除需求",
    create_defect: "新建缺陷",
    update_defect: "修改缺陷",
    update_defect_status: "变更缺陷状态",
    delete_defect: "删除缺陷",
    create_task: "新建任务",
    update_task: "修改任务",
    update_task_status: "变更任务状态",
    delete_task: "删除任务",
  };
  return map[type] || type;
}

function appendLocalActionDraft(content, action) {
  if (!action) return content;
  const lines = [
    String(content || "").trim(),
    "",
    `我已根据对话/附件整理出「${actionLabel(action.type)}」草稿，请在下方确认后才会写入系统（不会自动执行）。`,
    action.resourceId ? `对象：${action.resourceId}` : "",
    action.title ? `标题：${action.title}` : "",
    action.projectId ? `项目：${action.projectId}` : "",
    action.status ? `目标状态：${action.status}` : "",
    action.priority && action.type.includes("requirement") ? `优先级：${action.priority}` : "",
    action.severity && action.type.includes("defect") ? `严重级别：${action.severity}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function buildLocalRequirementAction(args) {
  return buildLocalAction(args);
}

function appendLocalRequirementDraft(content, action) {
  return appendLocalActionDraft(content, action);
}

function chatActionPromptRules() {
  return [
    "6. 若用户意图是业务写操作（新建/修改/删除/改状态：需求、缺陷、任务），先用自然语言说明拟操作内容，",
    "   然后在回答末尾单独追加一行 JSON（不要用代码块包裹）：ACTION_JSON:{...}",
    "   type 仅允许：create_requirement|update_requirement|update_requirement_status|delete_requirement|",
    "   create_defect|update_defect|update_defect_status|delete_defect|create_task|update_task|update_task_status|delete_task。",
    "   字段可用：title,description,priority,severity,projectId,resourceId,status,assignee,assigneeRole,acceptanceCriteria,owner,taskType,estimatedHours,reason。",
    "   规则：create_* 必填 title；update_*/delete_* 尽量填 resourceId（REQ-/BUG-/TASK-）；status 用平台英文状态码；",
    "   projectId 从上下文匹配，勿编造；平台只把 ACTION_JSON 当待确认草稿，绝不会自动写库。",
    "   非写操作意图时禁止输出 ACTION_JSON。",
  ];
}

module.exports = {
  ACTION_TYPES,
  actionLabel,
  appendLocalActionDraft,
  appendLocalRequirementDraft,
  buildLocalAction,
  buildLocalRequirementAction,
  chatActionPromptRules,
  detectIntentType,
  extractProposedActions,
  normalizeAction,
  stripActionJson,
  wantsCreateRequirement,
};
