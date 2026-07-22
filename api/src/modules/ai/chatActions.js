/**
 * Chat write-action drafts: parse model ACTION_JSON or local intent → proposedActions.
 * Platform never auto-writes; UI confirms then calls formal REST APIs.
 */

const ACTION_TYPES = Object.freeze([
  // core
  "create_requirement", "update_requirement", "update_requirement_status", "delete_requirement",
  "create_defect", "update_defect", "update_defect_status", "delete_defect",
  "create_task", "update_task", "update_task_status", "delete_task",
  // testing
  "create_test_case", "update_test_case", "update_test_case_status", "delete_test_case",
  // project / product
  "create_project", "update_project", "update_project_status", "delete_project",
  "create_product", "update_product", "delete_product",
  // delivery
  "create_build", "update_build", "update_build_status", "delete_build",
  "create_release", "update_release_status", "delete_release",
  // docs / sprint / ops
  "create_document", "update_document", "delete_document",
  "create_sprint", "update_sprint", "delete_sprint",
  "create_work_log", "create_time_entry",
  "create_risk", "create_program", "create_portfolio", "create_strategic_goal",
]);

const STATUS_TABLES = {
  requirement: {
    草稿: "draft", draft: "draft", 评审: "reviewing", reviewing: "reviewing",
    批准: "approved", approved: "approved", 开发: "in_dev", in_dev: "in_dev",
    测试: "testing", testing: "testing", 验收: "accepted", accepted: "accepted",
    关闭: "closed", closed: "closed", 取消: "cancelled", cancelled: "cancelled",
  },
  defect: {
    新建: "new", new: "new", 确认: "confirmed", confirmed: "confirmed",
    修复: "in_fix", in_fix: "in_fix", 解决: "resolved", resolved: "resolved",
    验证: "verified", verified: "verified", 关闭: "closed", closed: "closed",
    驳回: "rejected", rejected: "rejected",
  },
  task: {
    待处理: "todo", todo: "todo", 进行中: "in_progress", in_progress: "in_progress",
    阻塞: "blocked", blocked: "blocked", 代码评审: "code_review", code_review: "code_review",
    测试: "testing", testing: "testing", 验收: "acceptance", acceptance: "acceptance",
    完成: "done", done: "done", 取消: "cancelled", cancelled: "cancelled",
  },
  test_case: {
    草稿: "draft", draft: "draft", 就绪: "ready", ready: "ready",
    通过: "passed", passed: "passed", 失败: "failed", failed: "failed",
    阻塞: "blocked", blocked: "blocked",
  },
  project: {
    规划: "planning", planning: "planning", 进行: "active", active: "active",
    暂停: "on_hold", on_hold: "on_hold", 完成: "done", done: "done",
    归档: "archived", archived: "archived",
  },
  build: {
    草稿: "draft", draft: "draft", 构建中: "building", building: "building",
    测试: "testing", testing: "testing", 发布: "released", released: "released",
    失败: "failed", failed: "failed",
  },
  release: {
    计划: "planned", planned: "planned", 暂存: "staging", staging: "staging",
    发布: "released", released: "released", 回滚: "rolled_back", rolled_back: "rolled_back",
  },
};

// Order: status → delete → create → update (specific first)
const INTENT_PATTERNS = [
  // status
  { type: "update_requirement_status", re: /\bREQ-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|流转)|(需求).{0,20}(状态|流转)/i },
  { type: "update_defect_status", re: /\bBUG-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|流转)|(缺陷|bug).{0,20}(状态|流转)/i },
  { type: "update_task_status", re: /\bTASK-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|流转)|(任务).{0,20}(状态|流转)/i },
  { type: "update_test_case_status", re: /\bTC-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成)|(测试用例|用例).{0,20}(状态|通过|失败)/i },
  { type: "update_project_status", re: /\bPRJ-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成|启动|归档)|(项目).{0,20}(状态|启动|暂停|归档)/i },
  { type: "update_build_status", re: /\bBLD-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成)|(构建).{0,20}(状态|发布|测试)/i },
  { type: "update_release_status", re: /\bREL-[A-Za-z0-9-]+\b.{0,30}(状态|改为|改成)|(发布).{0,20}(状态|上线|回滚)/i },
  // delete
  { type: "delete_requirement", re: /(删除|移除|作废).{0,16}(需求|REQ-)/i },
  { type: "delete_defect", re: /(删除|移除).{0,16}(缺陷|bug|BUG-)/i },
  { type: "delete_task", re: /(删除|移除).{0,16}(任务|TASK-)/i },
  { type: "delete_test_case", re: /(删除|移除).{0,16}(测试用例|用例|TC-)/i },
  { type: "delete_project", re: /(删除|移除|归档删除).{0,16}(项目|PRJ-)/i },
  { type: "delete_product", re: /(删除|移除).{0,16}(产品|PROD-)/i },
  { type: "delete_build", re: /(删除|移除).{0,16}(构建|BLD-)/i },
  { type: "delete_release", re: /(删除|移除).{0,16}(发布|REL-)/i },
  { type: "delete_document", re: /(删除|移除).{0,16}(文档|DOC-)/i },
  { type: "delete_sprint", re: /(删除|移除).{0,16}(迭代|冲刺|sprint|SPR-)/i },
  // create
  { type: "create_requirement", re: /(新建|创建|登记|录入|起草|生成).{0,12}(需求)|(帮我).{0,8}(建|写).{0,8}(需求)/i },
  { type: "create_defect", re: /(新建|创建|登记|报).{0,12}(缺陷|bug)|(帮我).{0,8}(建|写).{0,8}(缺陷|bug)/i },
  { type: "create_task", re: /(新建|创建|安排|指派).{0,12}(任务)|(帮我).{0,8}(建|排).{0,8}(任务)/i },
  { type: "create_test_case", re: /(新建|创建|编写).{0,12}(测试用例|用例|test case)/i },
  { type: "create_project", re: /(新建|创建|立项).{0,12}(项目)/i },
  { type: "create_product", re: /(新建|创建).{0,12}(产品)/i },
  { type: "create_build", re: /(新建|创建|发起).{0,12}(构建|build)/i },
  { type: "create_release", re: /(新建|创建|发起).{0,12}(发布|release)/i },
  { type: "create_document", re: /(新建|创建|上传).{0,12}(文档)/i },
  { type: "create_sprint", re: /(新建|创建|开启).{0,12}(迭代|冲刺|sprint)/i },
  { type: "create_work_log", re: /(写|提交|新建|创建).{0,12}(日报|工作日志)|(日报).{0,8}(提交|写)/i },
  { type: "create_time_entry", re: /(记录|登记|新建|创建).{0,12}(工时|实际工时)/i },
  { type: "create_risk", re: /(新建|创建|登记).{0,12}(风险)/i },
  { type: "create_program", re: /(新建|创建).{0,12}(项目集)/i },
  { type: "create_portfolio", re: /(新建|创建).{0,12}(组合|产品组合)/i },
  { type: "create_strategic_goal", re: /(新建|创建).{0,12}(战略目标|公司目标|OKR)/i },
  // update
  { type: "update_requirement", re: /(修改|更新|编辑|调整).{0,12}(需求|REQ-)/i },
  { type: "update_defect", re: /(修改|更新|编辑|调整).{0,12}(缺陷|bug|BUG-)/i },
  { type: "update_task", re: /(修改|更新|编辑|调整).{0,12}(任务|TASK-)/i },
  { type: "update_test_case", re: /(修改|更新|编辑|调整).{0,12}(测试用例|用例|TC-)/i },
  { type: "update_project", re: /(修改|更新|编辑|调整).{0,12}(项目|PRJ-)/i },
  { type: "update_product", re: /(修改|更新|编辑|调整).{0,12}(产品|PROD-)/i },
  { type: "update_build", re: /(修改|更新|编辑|调整).{0,12}(构建|BLD-)/i },
  { type: "update_document", re: /(修改|更新|编辑|调整|重命名).{0,12}(文档|DOC-)/i },
  { type: "update_sprint", re: /(修改|更新|编辑|调整).{0,12}(迭代|冲刺|sprint|SPR-)/i },
];

const ID_PREFIX = {
  requirement: "REQ",
  defect: "BUG",
  task: "TASK",
  test_case: "TC",
  project: "PRJ",
  product: "PROD",
  build: "BLD",
  release: "REL",
  document: "DOC",
  sprint: "SPR",
  risk: "RSK",
  program: "PROG",
  portfolio: "PORT",
  goal: "GOAL",
};

function latestUserText(messages = []) {
  return String(messages[messages.length - 1]?.content || "");
}

function resourceOfType(type) {
  if (type.includes("requirement")) return "requirement";
  if (type.includes("defect")) return "defect";
  if (type.includes("task") && !type.includes("test")) return "task";
  if (type.includes("test_case")) return "test_case";
  if (type.includes("project")) return "project";
  if (type.includes("product")) return "product";
  if (type.includes("build")) return "build";
  if (type.includes("release")) return "release";
  if (type.includes("document")) return "document";
  if (type.includes("sprint")) return "sprint";
  if (type.includes("work_log")) return "work_log";
  if (type.includes("time_entry")) return "time_entry";
  if (type.includes("risk")) return "risk";
  if (type.includes("program")) return "program";
  if (type.includes("portfolio")) return "portfolio";
  if (type.includes("strategic_goal")) return "goal";
  return "unknown";
}

function detectIntentType(messages = [], attachments = []) {
  const latest = latestUserText(messages);
  const idStatus = [
    ["REQ-", "update_requirement_status"],
    ["BUG-", "update_defect_status"],
    ["TASK-", "update_task_status"],
    ["TC-", "update_test_case_status"],
    ["PRJ-", "update_project_status"],
    ["BLD-", "update_build_status"],
    ["REL-", "update_release_status"],
  ];
  for (const [prefix, type] of idStatus) {
    if (new RegExp(`\\b${prefix}[A-Za-z0-9-]+\\b`, "i").test(latest)
      && /(状态|改为|改成|流转|启动|归档|上线|回滚|通过|失败)/i.test(latest)
      && !/(删除|移除)/i.test(latest)) {
      return type;
    }
  }
  for (const item of INTENT_PATTERNS) {
    if (item.re.test(latest)) return item.type;
  }
  const recent = messages.filter((m) => m.role === "user").slice(-2).map((m) => m.content).join("\n");
  if (attachments.some((a) => a.kind === "document") && /(需求|验收|功能)/i.test(recent) && /(建|创建|生成)/i.test(recent)) {
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
  if (Array.isArray(value)) return value.map((i) => String(i || "").trim()).filter(Boolean).slice(0, 20);
  if (typeof value === "string") {
    return value.split(/\n+|；|;|。/).map((i) => i.trim()).filter(Boolean).slice(0, 20);
  }
  return [];
}

function normalizeStatus(resource, value) {
  const raw = String(value || "").trim().toLowerCase();
  const table = STATUS_TABLES[resource] || {};
  if (table[raw]) return table[raw];
  if (table[String(value || "").trim()]) return table[String(value || "").trim()];
  for (const [k, v] of Object.entries(table)) {
    if (raw.includes(k) || k.includes(raw)) return v;
  }
  return String(value || "").trim();
}

function parseJsonObject(raw) {
  try { return JSON.parse(raw); } catch {
    try { return JSON.parse(String(raw).replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"')); } catch { return null; }
  }
}

function matchProjectId(source, context) {
  const projects = context?.projects || [];
  for (const p of projects) {
    if (p?.id && source.includes(p.id)) return p.id;
    if (p?.name && source.includes(p.name)) return p.id;
  }
  return projects.length === 1 ? projects[0].id : "";
}

function extractPrefixedId(source, prefix) {
  const m = String(source || "").match(new RegExp(`\\b(${prefix}-[A-Za-z0-9-]+)\\b`, "i"));
  return m ? m[1].toUpperCase() : "";
}

function fieldTitle(source) {
  const m = source.match(/(?:标题|名称)[:：]\s*([^\n，,；;]+)/i);
  return m ? m[1].trim().slice(0, 80) : "";
}

function guessTitleFromText(text, fallback = "未命名草稿") {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = line.replace(/^#+\s*/, "").replace(/^(标题|名称)[:：]\s*/i, "").trim();
    if (cleaned.length >= 2 && cleaned.length <= 80 && !/^(背景|描述|验收|状态|优先级)/i.test(cleaned)) {
      return cleaned.slice(0, 80);
    }
  }
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 48) : fallback;
}

function normalizeAction(parsed) {
  const type = String(parsed?.type || "").trim();
  if (!ACTION_TYPES.includes(type)) return null;
  const resource = resourceOfType(type);

  const base = {
    type,
    title: String(parsed.title || parsed.name || "").trim().slice(0, 200),
    name: String(parsed.name || parsed.title || "").trim().slice(0, 200),
    description: String(parsed.description || parsed.content || parsed.notes || parsed.releaseNotes || "").trim().slice(0, 8000),
    content: String(parsed.content || "").trim().slice(0, 8000),
    projectId: String(parsed.projectId || "").trim().slice(0, 64),
    productId: String(parsed.productId || "").trim().slice(0, 64),
    resourceId: String(parsed.resourceId || parsed.id || "").trim().slice(0, 64),
    status: String(parsed.status || "").trim().slice(0, 40),
    priority: normalizePriority(parsed.priority),
    severity: normalizeSeverity(parsed.severity),
    assignee: String(parsed.assignee || "").trim().slice(0, 80),
    assigneeRole: normalizeAssigneeRole(parsed.assigneeRole),
    acceptanceCriteria: normalizeAcceptanceCriteria(parsed.acceptanceCriteria),
    owner: String(parsed.owner || parsed.assignee || "").trim().slice(0, 80),
    taskType: String(parsed.taskType || "task").trim().slice(0, 40),
    estimatedHours: parsed.estimatedHours != null && parsed.estimatedHours !== "" ? Number(parsed.estimatedHours) : undefined,
    hours: parsed.hours != null && parsed.hours !== "" ? Number(parsed.hours) : undefined,
    workDate: String(parsed.workDate || "").trim().slice(0, 20),
    version: String(parsed.version || "").trim().slice(0, 40),
    buildId: String(parsed.buildId || "").trim().slice(0, 64),
    objective: String(parsed.objective || "").trim().slice(0, 2000),
    category: String(parsed.category || "").trim().slice(0, 40),
    reason: String(parsed.reason || "").trim().slice(0, 500),
  };

  if (type.includes("_status") || type.includes("status")) {
    base.status = normalizeStatus(resource, base.status) || base.status;
  }

  if (type.startsWith("create_") && !base.title && !base.name && !base.content && type !== "create_work_log" && type !== "create_time_entry") {
    return null;
  }
  if ((type.startsWith("update_") || type.startsWith("delete_")) && !base.resourceId && !base.title && !base.name) {
    return null;
  }
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
    .filter((a) => a.kind === "document")
    .map((a) => a.contentText || "")
    .join("\n")
    .slice(0, 6000);
  const source = [latest, docText].filter(Boolean).join("\n");
  const resource = resourceOfType(type);
  const prefix = ID_PREFIX[resource];
  const projectId = matchProjectId(source, context);
  const explicitTitle = fieldTitle(source);
  const needsTitle = type.startsWith("create_") || (type.startsWith("update_") && !type.includes("_status"));
  const title = needsTitle
    ? (explicitTitle || guessTitleFromText(source, `未命名${actionLabel(type).replace(/新建|修改|删除|变更/g, "") || "对象"}`))
    : (explicitTitle || "");
  const assignee = ((source.match(/(?:执行人|处理人|负责人|指派给|owner|assignee)[:：]?\s*([^\n，,；;]+)/i) || [])[1] || "")
    .trim()
    .slice(0, 80);
  const statusHint = (source.match(/(?:状态|改为|改成|到|为)[:：]?\s*([^\n，,；;]+)/i) || [])[1];
  const hoursMatch = source.match(/(?:预估|工时|小时)[:：]?\s*(\d+(?:\.\d+)?)/i);
  const versionMatch = source.match(/(?:版本|version)[:：]?\s*([vV]?\d[\w.-]*)/i);

  const common = {
    type,
    title,
    name: title,
    description: [
      docText ? `【来自附件】\n${docText.slice(0, 2500)}` : "",
      latest ? `【对话说明】\n${latest.slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n\n").slice(0, 8000),
    content: type === "create_work_log" || type === "create_document" ? (docText || latest).slice(0, 8000) : "",
    projectId,
    productId: extractPrefixedId(source, "PROD"),
    resourceId: prefix ? extractPrefixedId(source, prefix) : "",
    status: statusHint ? normalizeStatus(resource, statusHint) : "",
    priority: normalizePriority((source.match(/(?:优先级|priority)[:：]?\s*(high|medium|low|高|中|低)/i) || [])[1]),
    severity: normalizeSeverity((source.match(/(?:严重|级别|severity)[:：]?\s*(blocker|critical|high|medium|low|阻塞|严重|高|中|低)/i) || [])[1]),
    assignee,
    assigneeRole: "",
    acceptanceCriteria: [],
    owner: assignee,
    taskType: "task",
    estimatedHours: hoursMatch ? Number(hoursMatch[1]) : undefined,
    hours: hoursMatch ? Number(hoursMatch[1]) : undefined,
    workDate: ((source.match(/(?:日期|workDate)[:：]?\s*(\d{4}-\d{2}-\d{2})/i) || [])[1] || new Date().toISOString().slice(0, 10)),
    version: versionMatch ? versionMatch[1] : "",
    buildId: extractPrefixedId(source, "BLD"),
    objective: ((source.match(/(?:目标|objective)[:：]?\s*([^\n]+)/i) || [])[1] || "").trim().slice(0, 2000),
    category: "project",
    reason: "",
  };

  if (type.includes("requirement")) {
    const criteriaBlock = source.match(/(?:验收标准|验收条件)[:：]?\s*([\s\S]{0,1200})/i);
    if (criteriaBlock) common.acceptanceCriteria = normalizeAcceptanceCriteria(criteriaBlock[1]);
  }

  if ((type.startsWith("update_") || type.startsWith("delete_")) && !common.resourceId) {
    const bags = {
      requirement: context?.requirements,
      defect: context?.openDefects,
      task: context?.blockedTasks,
    };
    const bag = bags[resource] || [];
    const hit = bag.find((item) => item.title && source.includes(item.title));
    if (hit?.id) common.resourceId = hit.id;
  }

  if (type === "create_time_entry" && !common.hours) common.hours = 1;
  if (type === "create_work_log" && !common.content) common.content = latest.slice(0, 2000);

  return normalizeAction(common);
}

function actionLabel(type) {
  const map = {
    create_requirement: "新建需求", update_requirement: "修改需求", update_requirement_status: "变更需求状态", delete_requirement: "删除需求",
    create_defect: "新建缺陷", update_defect: "修改缺陷", update_defect_status: "变更缺陷状态", delete_defect: "删除缺陷",
    create_task: "新建任务", update_task: "修改任务", update_task_status: "变更任务状态", delete_task: "删除任务",
    create_test_case: "新建测试用例", update_test_case: "修改测试用例", update_test_case_status: "变更用例状态", delete_test_case: "删除测试用例",
    create_project: "新建项目", update_project: "修改项目", update_project_status: "变更项目状态", delete_project: "删除项目",
    create_product: "新建产品", update_product: "修改产品", delete_product: "删除产品",
    create_build: "新建构建", update_build: "修改构建", update_build_status: "变更构建状态", delete_build: "删除构建",
    create_release: "新建发布", update_release_status: "变更发布状态", delete_release: "删除发布",
    create_document: "新建文档", update_document: "修改文档", delete_document: "删除文档",
    create_sprint: "新建迭代", update_sprint: "修改迭代", delete_sprint: "删除迭代",
    create_work_log: "提交日报", create_time_entry: "记录工时",
    create_risk: "登记风险", create_program: "新建项目集", create_portfolio: "新建组合", create_strategic_goal: "新建战略目标",
  };
  return map[type] || type;
}

function appendLocalActionDraft(content, action) {
  if (!action) return content;
  return [
    String(content || "").trim(),
    "",
    `我已整理出「${actionLabel(action.type)}」草稿，请在下方确认后才会写入系统（不会自动执行）。`,
    action.resourceId ? `对象：${action.resourceId}` : "",
    action.title || action.name ? `标题：${action.title || action.name}` : "",
    action.projectId ? `项目：${action.projectId}` : "",
    action.productId ? `产品：${action.productId}` : "",
    action.status ? `目标状态：${action.status}` : "",
  ].filter(Boolean).join("\n");
}

function buildLocalRequirementAction(args) {
  return buildLocalAction(args);
}

function appendLocalRequirementDraft(content, action) {
  return appendLocalActionDraft(content, action);
}

function chatActionPromptRules() {
  return [
    "6. 若用户意图是业务写操作，先自然语言说明拟操作，再在文末单独一行输出 ACTION_JSON:{...}（不要代码块）。",
    `   type 仅允许：${ACTION_TYPES.join("|")}。`,
    "   字段可用：title,name,description,content,priority,severity,projectId,productId,resourceId,status,assignee,assigneeRole,acceptanceCriteria,owner,taskType,estimatedHours,hours,workDate,version,buildId,objective,category,reason。",
    "   create_* 尽量给 title/name；update_*/delete_* 尽量给 resourceId（REQ/BUG/TASK/TC/PRJ/PROD/BLD/REL/DOC/SPR）；status 用平台英文码。",
    "   不要编造不存在的 id；平台只把 ACTION_JSON 当待确认草稿，绝不自动写库；非写操作禁止输出 ACTION_JSON。",
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
  resourceOfType,
  stripActionJson,
  wantsCreateRequirement,
};
