const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const http = require("http");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const {
  aiSummaries,
  audit,
  initDb,
  insert,
  json,
  mapDefect,
  mapDocument,
  mapProject,
  mapRequirement,
  mapSprint,
  mapTask,
  now,
  organization,
  parse,
  row,
  rows,
  run,
  STORAGE_DIR,
} = require("./db");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 4010;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

// JWT secret: never fall back to a hardcoded value in production.
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (IS_PROD) {
    console.error("FATAL: JWT_SECRET environment variable must be set (>= 16 chars) in production.");
    process.exit(1);
  }
  // Dev-only deterministic secret so local startup still works without env vars.
  console.warn("WARNING: JWT_SECRET not set — using insecure dev default. Set JWT_SECRET before deploying.");
  return "dev-secret-change-me";
}
const JWT_SECRET = resolveJwtSecret();

// Allowed browser origins for the web app. Comma-separated via CORS_ORIGIN, or
// defaults to the Vite dev server.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

initDb();

// Security headers (CSP relaxed enough for the SPA proxy setup).
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS: only allow the configured web origins to carry credentials/tokens.
app.use(cors({ origin: ALLOWED_ORIGINS, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: "15mb" }));

const upload = multer({ dest: STORAGE_DIR, limits: { fileSize: 25 * 1024 * 1024 } });

function ok(data, meta = {}) {
  return { success: true, data, meta: { generatedAt: now(), ...meta } };
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

function paginatedResponse(allItems, query) {
  const page = query.page != null ? Math.max(1, parseInt(query.page, 10) || 1) : null;
  const pageSize = query.pageSize != null ? Math.max(1, Math.min(200, parseInt(query.pageSize, 10) || 20)) : null;
  if (page != null && pageSize != null) {
    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const items = allItems.slice(start, start + pageSize);
    return { items, page, pageSize, total };
  }
  return allItems;
}

function nextId(prefix, table, column = "id") {
  const existing = rows(`SELECT ${column} AS id FROM ${table}`);
  const max = existing.reduce((value, item) => {
    const numeric = Number(String(item.id || "").replace(`${prefix}-`, ""));
    return Number.isFinite(numeric) ? Math.max(value, numeric) : value;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: parse(user.permissions, []),
  };
}

function hasPermission(user, permission) {
  const permissions = Array.isArray(user.permissions) ? user.permissions : parse(user.permissions, []);
  return permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${permission.split(":")[0]}:*`);
}

function authenticate(req, res, next) {
  if (req.path === "/api/health" || req.path === "/api/auth/login") return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(res, 401, "UNAUTHENTICATED", "请先登录。");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = row("SELECT * FROM users WHERE id = @id", { id: payload.sub });
    if (!user) return fail(res, 401, "UNAUTHENTICATED", "登录已失效。");
    req.user = publicUser(user);
    return next();
  } catch {
    return fail(res, 401, "UNAUTHENTICATED", "登录已失效。");
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
    return next();
  };
}

// Global API rate limit (per IP). Windows reset on first request.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试。" } },
});
app.use("/api/", apiLimiter);

// Stricter limit for auth (brute-force protection).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "登录尝试次数过多，请稍后再试。" } },
});

app.use(authenticate);

function authenticateSocket(req) {
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token") || "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = row("SELECT * FROM users WHERE id = @id", { id: payload.sub });
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

function buildDashboard(scope = {}) {
  const { owner } = scope;
  const taskFilter = owner ? " WHERE owner = @owner" : "";
  const reqFilter = owner ? " WHERE owner = @owner" : "";
  const tasks = rows(`SELECT * FROM tasks${taskFilter}`, owner ? { owner } : {}).map(mapTask);
  const projects = rows("SELECT * FROM projects").map(mapProject);
  const requirements = rows(`SELECT * FROM requirements${reqFilter}`, owner ? { owner } : {}).map(mapRequirement);
  const tests = rows("SELECT * FROM test_cases");
  const documents = rows("SELECT * FROM documents").map(mapDocument);
  const taskCounts = tasks.reduce((counts, task) => {
    counts.total += 1;
    counts[task.status] = (counts[task.status] || 0) + 1;
    return counts;
  }, { total: 0 });
  const projectHealthAverage = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + project.healthScore, 0) / projects.length)
    : 0;
  const requirementCompletionAverage = requirements.length
    ? Math.round(requirements.reduce((sum, requirement) => sum + requirement.completion, 0) / requirements.length)
    : 0;
  const totalCases = tests.reduce((sum, test) => sum + test.total_cases, 0);
  const passedCases = tests.reduce((sum, test) => sum + test.passed_cases, 0);

  // Personal scope limits risky projects / requirement progress to those the
  // user is involved with; global scope shows everything.
  const myProjectIds = new Set(tasks.map((t) => t.projectId));
  const riskyProjects = (owner
    ? projects.filter((p) => myProjectIds.has(p.id))
    : projects
  ).filter((project) => project.riskCount > 0).sort((a, b) => b.riskCount - a.riskCount);

  return {
    metrics: {
      tasks: taskCounts,
      projectHealthAverage,
      requirementCompletionAverage,
      testPassRate: totalCases ? Math.round((passedCases / totalCases) * 100) : 0,
      openRisks: riskyProjects.reduce((sum, project) => sum + project.riskCount, 0),
      documentCount: documents.length,
    },
    focusTasks: tasks,
    riskyProjects,
    requirementProgress: requirements.map((requirement) => ({
      id: requirement.id,
      title: requirement.title,
      completion: requirement.completion,
      projectId: requirement.projectId,
      projectName: row("SELECT name FROM projects WHERE id = @id", { id: requirement.projectId })?.name || requirement.projectId,
    })),
    ai: aiSummaries.dashboard,
  };
}

function extractSentences(content, keywords) {
  return String(content || "")
    .replace(/\r/g, "\n")
    .split(/[\n.;!?。；！？]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)));
}

function analyzeWorkLog(input) {
  const normalized = [input?.content, input?.blockers, input?.nextPlan].filter(Boolean).join("\n").trim();
  const requirementIds = [...new Set((normalized.match(/REQ-\d+/gi) || []).map((id) => id.toUpperCase()))];
  const percentages = [...new Set((normalized.match(/\d{1,3}%/g) || []).map((value) => Number(value.replace("%", ""))))]
    .filter((value) => value >= 0 && value <= 100);
  const completedItems = extractSentences(normalized, ["completed", "done", "finished", "完成", "已完成", "推进", "联调", "验证"]);
  const blockers = extractSentences(normalized, ["blocked", "waiting", "risk", "缺少", "等待", "阻塞", "风险", "问题", "不一致"]);
  return {
    completedItems: completedItems.length ? completedItems : ["No explicit completed item was detected."],
    blockers: blockers.length ? blockers : ["No explicit blocker was detected."],
    linkedRequirements: requirementIds.map((id) => {
      const requirement = row("SELECT * FROM requirements WHERE id = @id", { id });
      return { id, title: requirement?.title || id, known: Boolean(requirement), currentCompletion: requirement?.completion ?? null };
    }),
    progressChange: percentages.length >= 2
      ? { from: percentages[0], to: percentages[percentages.length - 1], delta: percentages[percentages.length - 1] - percentages[0] }
      : percentages.length === 1 ? { from: null, to: percentages[0], delta: null } : { from: null, to: null, delta: null },
    confidence: normalized.length > 80 ? "medium" : "low",
    suggestedActions: blockers.length
      ? ["Assign an owner and target date for each blocker before the next standup."]
      : ["Move completed items into acceptance or regression verification."],
  };
}

async function callRealModel(prompt) {
  if (!process.env.OPENAI_API_KEY && !process.env.AI_API_KEY) {
    return null;
  }
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "你是企业项目管理平台的文档分析助手，输出简洁 JSON。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`AI model request failed: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

async function createAiDocumentResult(document) {
  const modelText = await callRealModel(`分析文档：${document.title}\n类型：${document.type}\n内容摘要：${document.content || ""}`).catch(() => null);
  return {
    summary: modelText || `${document.title} 已完成本地解析。未配置 OPENAI_API_KEY，当前使用规则引擎生成结构化草稿。`,
    modelUsed: modelText ? AI_MODEL : "local-rule-engine",
    requirements: [{ title: `${document.title} - 需求草稿`, priority: "high", acceptanceCriteria: ["业务目标明确", "验收标准完整", "测试用例覆盖"] }],
    wbs: [
      { title: "需求梳理", estimatedHours: 8, wbsCode: "1.1" },
      { title: "方案设计", estimatedHours: 12, wbsCode: "1.2" },
      { title: "开发与测试", estimatedHours: 32, wbsCode: "1.3" },
    ],
    apis: [{ method: "POST", path: "/api/ai/documents/analyze", purpose: "提交文档分析 Job" }],
    risks: ["文档内容需要人工确认后再写入正式需求。"],
  };
}

function requirementScore(requirementId) {
  const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: requirementId });
  if (!requirement) return null;
  const linkedTasks = rows("SELECT * FROM tasks WHERE requirement_id = @id", { id: requirementId });
  const taskScore = linkedTasks.length ? Math.round(linkedTasks.reduce((sum, task) => sum + task.progress, 0) / linkedTasks.length) : 0;
  const linkedTests = rows("SELECT * FROM test_cases WHERE requirement_id = @id", { id: requirementId });
  const testScore = linkedTests.length
    ? Math.round(linkedTests.reduce((sum, test) => sum + (test.passed_cases / test.total_cases) * 100, 0) / linkedTests.length)
    : 0;
  const score = Math.round(taskScore * 0.4 + testScore * 0.3 + requirement.completion * 0.3);
  return { requirementId, score, taskScore, testScore, declaredCompletion: requirement.completion };
}

app.get("/api/health", (req, res) => res.json(ok({ status: "ok", service: "company-project-management-api", database: "sqlite", uptime: Math.round(process.uptime()) })));

app.post("/api/auth/login", authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = row("SELECT * FROM users WHERE email = @email", { email });
  if (!user || !bcrypt.compareSync(String(password || ""), user.password_hash)) {
    audit(null, "auth.login_failed", "user", email, null, { email }, req.ip);
    return fail(res, 401, "INVALID_CREDENTIALS", "账号或密码错误。");
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  audit(publicUser(user), "auth.login", "user", user.id, null, { email }, req.ip);
  res.json(ok({ token, user: publicUser(user) }));
});

app.get("/api/auth/me", (req, res) => res.json(ok(req.user)));
app.get("/api/audit-logs", requirePermission("audit:read"), (req, res) => {
  const allItems = rows("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000").map((item) => ({ ...item, before: parse(item.before_json), after: parse(item.after_json) }));
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});

app.get("/api/dashboard", (req, res) => res.json(ok(buildDashboard())));
app.get("/api/dashboard/personal", (req, res) => res.json(ok(buildDashboard({ owner: req.user?.name }))));

app.get("/api/projects", (req, res) => {
  let sql = "SELECT * FROM projects WHERE 1=1";
  const params = {};
  if (req.query.keyword) {
    sql += " AND name LIKE @keyword";
    params.keyword = `%${req.query.keyword}%`;
  }
  if (req.query.status) {
    sql += " AND status = @status";
    params.status = req.query.status;
  }
  sql += " ORDER BY updated_at DESC";
  const allItems = rows(sql, params).map(mapProject);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/projects", requirePermission("project:*"), (req, res) => {
  const { name, owner, status, progress, programId, productId, processMode } = req.body || {};
  if (!name || !owner) return fail(res, 400, "VALIDATION_FAILED", "Project name and owner are required.");
  const project = {
    id: nextId("PRJ", "projects"),
    name: String(name).trim(),
    status: status || "planning",
    health_score: 80,
    owner: String(owner).trim(),
    program_id: programId || null,
    product_id: productId || null,
    process_mode: processMode || "scrum",
    progress: Number(progress) || 0,
    risk_count: 0,
    milestones: json([{ name: "Project kickoff", status: "planned", date: now().slice(0, 10) }]),
    updated_at: now(),
  };
  insert("projects", project);
  audit(req.user, "project.create", "project", project.id, null, project, req.ip);
  res.status(201).json(ok(mapProject(row("SELECT * FROM projects WHERE id = @id", { id: project.id }))));
});
app.patch("/api/projects/:id/status", requirePermission("project:*"), (req, res) => {
  const ALLOWED_STATUSES = ["planning", "development", "testing", "acceptance", "release", "closed"];
  if (!req.body.status || !ALLOWED_STATUSES.includes(req.body.status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${ALLOWED_STATUSES.join(", ")}`);
  }
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  run("UPDATE projects SET status = @status, updated_at = @updatedAt WHERE id = @id", { id: req.params.id, status: req.body.status, updatedAt: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.status_update", "project", req.params.id, before, after, req.ip);
  res.json(ok(mapProject(after)));
});

app.get("/api/projects/:projectId/sprints", (req, res) => {
  const allItems = rows("SELECT * FROM sprints WHERE project_id = @projectId", { projectId: req.params.projectId }).map(mapSprint);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/projects/:projectId/sprints", requirePermission("project:*"), (req, res) => {
  const { name, goal, status, startDate, endDate } = req.body || {};
  if (!name || !String(name).trim()) {
    return fail(res, 400, "VALIDATION_FAILED", "Sprint name is required and cannot be empty.");
  }
  const project = row("SELECT * FROM projects WHERE id = @id", { id: req.params.projectId });
  if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const sprint = {
    id: nextId("SPR", "sprints"),
    project_id: req.params.projectId,
    name: String(name).trim(),
    goal: goal || "",
    status: status || "planned",
    start_date: startDate || null,
    end_date: endDate || null,
  };
  insert("sprints", sprint);
  audit(req.user, "sprint.create", "sprint", sprint.id, null, sprint, req.ip);
  res.status(201).json(ok(mapSprint(row("SELECT * FROM sprints WHERE id = @id", { id: sprint.id }))));
});

app.get("/api/projects/:id", (req, res) => {
  const project = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const mapped = mapProject(project);
  const projectTasks = rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: req.params.id }).map(mapTask);
  const projectSprints = rows("SELECT * FROM sprints WHERE project_id = @projectId", { projectId: req.params.id }).map(mapSprint);
  res.json(ok({ ...mapped, tasks: projectTasks, sprints: projectSprints }));
});

app.get("/api/programs", (req, res) => res.json(ok(rows("SELECT * FROM programs").map((item) => ({ id: item.id, name: item.name, owner: item.owner, status: item.status, healthScore: item.health_score, progress: item.progress, projectIds: parse(item.project_ids, []), risks: parse(item.risks, []), updatedAt: item.updated_at })))));
app.get("/api/portfolios", (req, res) => res.json(ok(rows("SELECT * FROM portfolios").map((item) => ({ id: item.id, name: item.name, owner: item.owner, status: item.status, productIds: parse(item.product_ids, []), roadmap: parse(item.roadmap, []) })))));
app.get("/api/products", (req, res) => res.json(ok(rows("SELECT * FROM products").map((item) => ({ id: item.id, name: item.name, owner: item.owner, version: item.version, stage: item.stage, modules: parse(item.modules, []), roadmap: parse(item.roadmap, []) })))));

app.get("/api/requirements", (req, res) => {
  let sql = "SELECT * FROM requirements WHERE 1=1";
  const params = {};
  if (req.query.keyword) {
    sql += " AND title LIKE @keyword";
    params.keyword = `%${req.query.keyword}%`;
  }
  if (req.query.status) {
    sql += " AND status = @status";
    params.status = req.query.status;
  }
  if (req.query.priority) {
    sql += " AND priority = @priority";
    params.priority = req.query.priority;
  }
  if (req.query.projectId) {
    sql += " AND project_id = @projectId";
    params.projectId = req.query.projectId;
  }
  sql += " ORDER BY id DESC";
  const allItems = rows(sql, params).map(mapRequirement);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/requirements", requirePermission("requirement:*"), (req, res) => {
  const { title, projectId, owner, priority, description, acceptanceCriteria, productId, portfolioId } = req.body || {};
  if (!title || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Requirement title and projectId are required.");
  const requirement = {
    id: nextId("REQ", "requirements"),
    title: String(title).trim(),
    description: description || "",
    status: "draft",
    priority: priority || "medium",
    project_id: projectId,
    product_id: productId || null,
    portfolio_id: portfolioId || null,
    owner: owner || "Product Office",
    completion: 0,
    linked_tasks: json([]),
    acceptance_criteria: json(Array.isArray(acceptanceCriteria) ? acceptanceCriteria : []),
  };
  insert("requirements", requirement);
  audit(req.user, "requirement.create", "requirement", requirement.id, null, requirement, req.ip);
  res.status(201).json(ok(mapRequirement(row("SELECT * FROM requirements WHERE id = @id", { id: requirement.id }))));
});
app.get("/api/requirements/:id/completion-score", (req, res) => {
  const score = requirementScore(req.params.id);
  if (!score) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  res.json(ok(score));
});

app.get("/api/tasks", (req, res) => {
  let sql = "SELECT * FROM tasks WHERE 1=1";
  const params = {};
  if (req.query.keyword) {
    sql += " AND title LIKE @keyword";
    params.keyword = `%${req.query.keyword}%`;
  }
  if (req.query.status) {
    sql += " AND status = @status";
    params.status = req.query.status;
  }
  if (req.query.projectId) {
    sql += " AND project_id = @projectId";
    params.projectId = req.query.projectId;
  }
  if (req.query.assignee) {
    sql += " AND owner = @assignee";
    params.assignee = req.query.assignee;
  }
  sql += " ORDER BY sort_order";
  const allItems = rows(sql, params).map(mapTask);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.get("/api/projects/:id/wbs", (req, res) => res.json(ok(rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY wbs_code", { id: req.params.id }).map(mapTask))));
app.get("/api/projects/:id/kanban", (req, res) => {
  const columns = ["todo", "in_progress", "code_review", "testing", "blocked", "acceptance", "done"];
  const tasks = rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: req.params.id }).map(mapTask);
  res.json(ok(columns.map((id) => ({ id, title: id.replace("_", " "), tasks: tasks.filter((task) => task.kanbanColumn === id) }))));
});
app.post("/api/projects/:id/wbs/tasks", requirePermission("project:*"), (req, res) => {
  if (!req.body.title || !String(req.body.title).trim()) {
    return fail(res, 400, "VALIDATION_FAILED", "Task title is required and cannot be empty.");
  }
  const task = {
    id: nextId("TASK", "tasks"),
    title: req.body.title,
    status: "todo",
    status_text: "To Do",
    project_id: req.params.id,
    owner: req.body.assigneeId || "Unassigned",
    due_date: now().slice(0, 10),
    requirement_id: req.body.requirementId || null,
    progress: 0,
    blocker: null,
    type: req.body.type || "task",
    parent_id: req.body.parentId || null,
    wbs_code: req.body.wbsCode || "1",
    kanban_column: "todo",
    sort_order: Date.now(),
    estimated_hours: Number(req.body.estimatedHours) || 0,
    actual_hours: 0,
  };
  insert("tasks", task);
  audit(req.user, "task.create", "task", task.id, null, task, req.ip);
  res.status(201).json(ok(mapTask(row("SELECT * FROM tasks WHERE id = @id", { id: task.id }))));
});
app.patch("/api/tasks/:id/kanban-position", requirePermission("project:*"), (req, res) => {
  const ALLOWED_COLUMNS = ["todo", "in_progress", "code_review", "testing", "blocked", "acceptance", "done"];
  if (!req.body.kanbanColumn || !ALLOWED_COLUMNS.includes(req.body.kanbanColumn)) {
    return fail(res, 400, "VALIDATION_FAILED", `kanbanColumn must be one of: ${ALLOWED_COLUMNS.join(", ")}`);
  }
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  run("UPDATE tasks SET kanban_column = @column, status = @column, sort_order = @sortOrder WHERE id = @id", { id: req.params.id, column: req.body.kanbanColumn, sortOrder: Number(req.body.sortOrder) || Date.now() });
  const after = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  audit(req.user, "task.kanban_move", "task", req.params.id, before, after, req.ip);
  res.json(ok(mapTask(after)));
});
app.get("/api/tasks/:id", (req, res) => {
  const task = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  res.json(ok(mapTask(task)));
});

app.get("/api/tests", (req, res) => res.json(ok(rows("SELECT * FROM test_cases").map((item) => ({ id: item.id, name: item.name, requirementId: item.requirement_id, projectId: item.project_id, status: item.status, owner: item.owner, totalCases: item.total_cases, passedCases: item.passed_cases, failedCases: item.failed_cases, blockedCases: item.blocked_cases })))));

app.get("/api/documents", (req, res) => {
  let sql = "SELECT * FROM documents WHERE 1=1";
  const params = {};
  if (req.query.keyword) {
    sql += " AND title LIKE @keyword";
    params.keyword = `%${req.query.keyword}%`;
  }
  if (req.query.type) {
    sql += " AND type = @type";
    params.type = req.query.type;
  }
  sql += " ORDER BY updated_at DESC";
  const allItems = rows(sql, params).map(mapDocument);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/documents", requirePermission("document:*"), (req, res) => {
  const { title, type, owner, fileName, fileSize, fileType, contentBase64 } = req.body || {};
  if (!title || !type || !owner || !fileName) return fail(res, 400, "VALIDATION_FAILED", "Document title, type, owner, and fileName are required.");
  const id = nextId("DOC", "documents");
  const storageKey = `${id}_${String(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}`;
  let content = "";
  if (contentBase64) {
    const base64 = String(contentBase64).includes(",") ? String(contentBase64).split(",").pop() : String(contentBase64);
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(path.join(STORAGE_DIR, storageKey), buffer);
    content = buffer.toString("utf8").slice(0, 20000);
    insert("objects", { id: `OBJ-${id}`, bucket: "documents", storage_key: storageKey, original_name: fileName, mime_type: fileType || "application/octet-stream", size: buffer.length, created_by: req.user.id, created_at: now() });
  }
  const document = { id, title, type, version: "v1.0", ai_status: "uploaded", owner, updated_at: now(), linked_requirements: json([]), risks: json([]), file_name: fileName, file_size: Number(fileSize) || 0, file_type: fileType || "application/octet-stream", storage_key: storageKey, content };
  insert("documents", document);
  audit(req.user, "document.upload", "document", id, null, document, req.ip);
  res.status(201).json(ok(mapDocument(row("SELECT * FROM documents WHERE id = @id", { id }))));
});
app.post("/api/documents/:id/object", requirePermission("document:*"), upload.single("file"), (req, res) => {
  const document = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  insert("objects", { id: `OBJ-${Date.now()}`, bucket: "documents", storage_key: req.file.filename, original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size, created_by: req.user.id, created_at: now() });
  run("UPDATE documents SET storage_key = @key, file_name = @name, file_size = @size, file_type = @type, updated_at = @updated WHERE id = @id", { id: req.params.id, key: req.file.filename, name: req.file.originalname, size: req.file.size, type: req.file.mimetype, updated: now() });
  audit(req.user, "object.upload", "document", req.params.id, null, req.file, req.ip);
  res.json(ok({ objectKey: req.file.filename }));
});
app.get("/api/objects/:key", (req, res) => {
  const object = row("SELECT * FROM objects WHERE storage_key = @key", { key: req.params.key });
  if (!object) return fail(res, 404, "RESOURCE_NOT_FOUND", "Object not found.");
  res.download(path.join(STORAGE_DIR, object.storage_key), object.original_name);
});

app.post("/api/ai/documents/analyze", requirePermission("ai:*"), async (req, res, next) => {
  try {
    const document = row("SELECT * FROM documents WHERE id = @id", { id: req.body.documentId });
    if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    const result = await createAiDocumentResult(mapDocument(document));
    const job = { job_id: nextId("JOB", "ai_jobs", "job_id"), scene: "document_analysis", status: "awaiting_review", progress: 100, current_step: "结构化结果已生成", source_type: "document", source_id: document.id, goals: json(req.body.analysisGoals || []), result: json(result), evidence: json([{ documentId: document.id, pageNo: 1, quote: document.title }]), written_requirement_id: null, created_at: now(), confirmed_at: null };
    insert("ai_jobs", job);
    run("UPDATE documents SET ai_status = 'awaiting_review' WHERE id = @id", { id: document.id });
    audit(req.user, "ai.document_analyze", "ai_job", job.job_id, null, job, req.ip);
    res.status(202).json(ok({ jobId: job.job_id, scene: job.scene, status: job.status, progress: job.progress, currentStep: job.current_step, result, evidence: parse(job.evidence, []) }));
  } catch (error) {
    next(error);
  }
});
app.get("/api/ai/jobs/:id", (req, res) => {
  const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
  res.json(ok({ jobId: job.job_id, scene: job.scene, status: job.status, progress: job.progress, currentStep: job.current_step, result: parse(job.result, {}), evidence: parse(job.evidence, []), writtenRequirementId: job.written_requirement_id }));
});
app.post("/api/ai/jobs/:id/confirm", requirePermission("ai:*"), (req, res) => {
  const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
  const result = parse(job.result, {});
  const generated = result.requirements?.[0];
  let writtenRequirementId = job.written_requirement_id;
  // Resolve the target project from the request body, falling back to the
  // job's source document's project, instead of blindly picking the
  // most-recently-updated project.
  let projectId = req.body?.projectId || null;
  if (!projectId && job.source_type === "document" && job.source_id) {
    const sourceDoc = row("SELECT * FROM documents WHERE id = @id", { id: job.source_id });
    const linked = sourceDoc ? parse(sourceDoc.linked_requirements, []) : [];
    if (linked.length) {
      const reqRow = row("SELECT project_id FROM requirements WHERE id = @id", { id: linked[0] });
      projectId = reqRow?.project_id || null;
    }
  }
  if (generated && projectId && !writtenRequirementId) {
    const project = row("SELECT * FROM projects WHERE id = @id", { id: projectId });
    if (!project) return fail(res, 400, "VALIDATION_FAILED", "projectId does not match a known project.");
    writtenRequirementId = nextId("REQ", "requirements");
    insert("requirements", { id: writtenRequirementId, title: generated.title, description: result.summary, status: "draft", priority: generated.priority || "medium", project_id: project.id, product_id: null, portfolio_id: null, owner: req.user.name, completion: 0, linked_tasks: json([]), acceptance_criteria: json(generated.acceptanceCriteria || []) });
  }
  run("UPDATE ai_jobs SET status = 'confirmed', confirmed_at = @confirmed, written_requirement_id = @rid WHERE job_id = @id", { id: req.params.id, confirmed: now(), rid: writtenRequirementId });
  audit(req.user, "ai.job_confirm", "ai_job", req.params.id, job, { writtenRequirementId }, req.ip);
  const after = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  res.json(ok({ jobId: after.job_id, scene: after.scene, status: after.status, progress: after.progress, currentStep: after.current_step, result: parse(after.result, {}), evidence: parse(after.evidence, []), writtenRequirementId: after.written_requirement_id }));
});

app.get("/api/work-logs", (req, res) => {
  const allItems = rows("SELECT * FROM work_logs ORDER BY created_at DESC").map((item) => ({
    id: item.id,
    author: item.author,
    project: item.project,
    content: item.content,
    blockers: item.blockers,
    nextPlan: item.next_plan,
    analysis: parse(item.analysis, {}),
    createdAt: item.created_at,
  }));
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/work-logs", requirePermission("project:*"), (req, res) => {
  const content = String(req.body?.content ?? "").trim();
  if (!content) return fail(res, 400, "VALIDATION_FAILED", "工作日志 content 不能为空。");
  const analysis = analyzeWorkLog(req.body);
  const id = nextId("LOG", "work_logs");
  insert("work_logs", { id, author: req.body.author || req.user.name, project: req.body.project || "", content, blockers: req.body.blockers || "", next_plan: req.body.nextPlan || "", analysis: json(analysis), created_at: now() });
  audit(req.user, "work_log.create", "work_log", id, null, req.body, req.ip);
  res.status(201).json(ok({ id, analysis }));
});
app.post("/api/work-logs/analyze", (req, res) => res.json(ok(analyzeWorkLog(req.body))));
app.post("/api/ai/logs/analyze", requirePermission("ai:*"), (req, res) => res.json(ok(analyzeWorkLog(req.body))));
app.post("/api/ai/requirements/:id/score", requirePermission("ai:*"), (req, res) => {
  const score = requirementScore(req.params.id);
  if (!score) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  res.json(ok({ ...score, recommendation: "Review task, test, and log evidence before confirming the AI score." }));
});

app.get("/api/defects", (req, res) => {
  let sql = "SELECT * FROM defects WHERE 1=1";
  const params = {};
  if (req.query.keyword) {
    sql += " AND title LIKE @keyword";
    params.keyword = `%${req.query.keyword}%`;
  }
  if (req.query.status) {
    sql += " AND status = @status";
    params.status = req.query.status;
  }
  if (req.query.severity) {
    sql += " AND severity = @severity";
    params.severity = req.query.severity;
  }
  if (req.query.projectId) {
    sql += " AND project_id = @projectId";
    params.projectId = req.query.projectId;
  }
  const allItems = rows(sql, params).map(mapDefect);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/defects", requirePermission("project:*"), (req, res) => {
  const { title, severity, status, projectId, requirementId, assignee } = req.body || {};
  if (!title || !String(title).trim()) {
    return fail(res, 400, "VALIDATION_FAILED", "Defect title is required and cannot be empty.");
  }
  if (!projectId) {
    return fail(res, 400, "VALIDATION_FAILED", "Defect projectId is required.");
  }
  const defect = {
    id: nextId("BUG", "defects"),
    title: String(title).trim(),
    severity: severity || "medium",
    status: status || "open",
    project_id: projectId,
    requirement_id: requirementId || null,
    assignee: assignee || null,
  };
  insert("defects", defect);
  audit(req.user, "defect.create", "defect", defect.id, null, defect, req.ip);
  res.status(201).json(ok(mapDefect(row("SELECT * FROM defects WHERE id = @id", { id: defect.id }))));
});
app.patch("/api/defects/:id/status", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
  const { status } = req.body || {};
  if (!status) return fail(res, 400, "VALIDATION_FAILED", "Defect status is required.");
  run("UPDATE defects SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  audit(req.user, "defect.status_update", "defect", req.params.id, before, after, req.ip);
  res.json(ok(mapDefect(after)));
});

app.get("/api/org", (req, res) => res.json(ok(organization)));
app.get("/api/ai/summary", (req, res) => {
  const jobs = rows("SELECT * FROM ai_jobs ORDER BY created_at DESC");
  const awaitingReview = jobs.filter((j) => j.status === "awaiting_review").length;
  const parsing = jobs.filter((j) => (j.progress || 0) < 100).length;
  const written = jobs.filter((j) => Boolean(j.written_requirement_id)).length;
  const totalProgress = jobs.length ? jobs.reduce((s, j) => s + (j.progress || 0), 0) : 0;
  const avgConfidence = jobs.length ? Math.round(totalProgress / jobs.length) : 0;
  const scope = req.query.scope || "dashboard";
  const scopeSummary = aiSummaries[scope] || aiSummaries.dashboard;

  const metrics = {
    todayAnalyses: jobs.length,
    pendingReview: awaitingReview,
    documentParsing: parsing,
    logAnalysis: rows("SELECT COUNT(*) AS c FROM work_logs").reduce((s, l) => s, 0),
    avgConfidence,
    writtenToBusiness: written,
  };
  const modelRoutes = [
    { scene: "文档结构化分析", modelStrategy: AI_MODEL, status: "active", humanReview: "需人工确认", audit: "全量记录" },
    { scene: "工作日志分析", modelStrategy: "local-rule-engine", status: "active", humanReview: "可选审核", audit: "全量记录" },
    { scene: "需求完成度评分", modelStrategy: "local-rule-engine", status: "active", humanReview: "需人工确认", audit: "全量记录" },
  ];
  const recentJobs = jobs.slice(0, 8).map((j) => ({
    jobId: j.job_id,
    scene: j.scene,
    status: j.status,
    progress: j.progress,
    currentStep: j.current_step,
  }));

  res.json(ok({
    scope,
    title: scopeSummary.title || "AI 分析摘要",
    summary: scopeSummary.summary || "",
    risks: scopeSummary.risks || [],
    recommendations: scopeSummary.recommendations || [],
    metrics,
    modelRoutes,
    recentJobs,
  }));
});

app.use((err, req, res, next) => {
  console.error(err);
  // Never leak internal error details to the client in production.
  const message = IS_PROD ? "服务器内部错误，请稍后再试。" : err.message || "Unexpected server error.";
  res.status(500).json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message } });
});
app.use((req, res) => fail(res, 404, "RESOURCE_NOT_FOUND", "请求的资源不存在。"));

const wss = new WebSocketServer({ server, path: "/ws/collab" });
const rooms = new Map();
wss.on("connection", (socket, req) => {
  const url = new URL(req.url, "http://localhost");
  const documentId = url.searchParams.get("documentId");
  const user = authenticateSocket(req);
  if (!documentId || !user || !hasPermission(user, "document:*")) return socket.close(1008, "Unauthorized");
  if (!rooms.has(documentId)) rooms.set(documentId, new Set());
  rooms.get(documentId).add(socket);
  const document = row("SELECT * FROM documents WHERE id = @id", { id: documentId });
  socket.send(JSON.stringify({ type: "snapshot", documentId, content: document?.content || "" }));
  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed messages instead of crashing the connection
    }
    if (message && message.type === "update") {
      const before = row("SELECT id, title, content, updated_at FROM documents WHERE id = @id", { id: documentId });
      run("UPDATE documents SET content = @content, updated_at = @updated WHERE id = @id", { id: documentId, content: String(message.content || "").slice(0, 100000), updated: now() });
      audit(user, "document.collab_update", "document", documentId, before, { id: documentId, contentLength: String(message.content || "").length }, req.socket.remoteAddress);
      for (const peer of rooms.get(documentId) || []) {
        if (peer !== socket && peer.readyState === 1) peer.send(JSON.stringify({ type: "update", documentId, content: message.content }));
      }
    }
  });
  socket.on("close", () => rooms.get(documentId)?.delete(socket));
});

function startServer(port, attempt = 0) {
  if (attempt > 5) {
    console.error(`Could not start server: no available port after ${PORT}..${port - 1}.`);
    process.exit(1);
  }
  const onError = (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      server.removeListener("error", onError);
      wss.removeListener("error", onError);
      startServer(port + 1, attempt + 1);
    } else {
      throw err;
    }
  };
  server.on("error", onError);
  wss.on("error", onError);
  server.listen(port, () => {
    console.log(`Company project management API listening on http://localhost:${port}`);
  });
}
startServer(PORT);
