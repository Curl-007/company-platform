const http = require("node:http");

const { findExecutionCapability } = require("./executionCapabilities");
const { assertUiDirective } = require("./uiDirectives");
const { REQUIREMENT_PRIORITIES } = require("../../domain/enums");
const { buildRequirementCreate } = require("../requirements/service");
const { buildTaskCreate } = require("../tasks/service");

const MAX_GATEWAY_BODY_BYTES = 128 * 1024;
const DOMAIN_EXECUTION_ROUTE = "/v1/execution";
const DOMAIN_LIST_LIMIT = 100;
const DOMAIN_TITLE_LIMIT = 200;
const DOMAIN_TEXT_LIMIT = 2048;
const DOMAIN_DESCRIPTION_LIMIT = 4000;
const REMINDER_MESSAGE_LIMIT = 500;
// A reminder must be schedulable: at least one minute ahead so the platform
// sweep never races a just-created reminder, and at most 180 days ahead.
const REMINDER_MIN_LEAD_MS = 60_000;
const REMINDER_MAX_LEAD_MS = 180 * 24 * 60 * 60 * 1000;

function gatewayError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function readBearerToken(header) {
  const source = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(String(source || "").trim());
  return match ? match[1] : "";
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("error", rejectOnce);
    req.on("data", (chunk) => {
      if (settled) return;
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.length;
      if (size > maxBytes) {
        rejectOnce(gatewayError("AI_CAPABILITY_GATEWAY_BODY_TOO_LARGE", "Execution gateway request is too large.", 413));
        req.resume();
        return;
      }
      chunks.push(data);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        resolve(parsed);
      } catch {
        reject(gatewayError("AI_CAPABILITY_GATEWAY_INVALID_JSON", "Execution gateway request must be a JSON object.", 400));
      }
    });
  });
}

function writeJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function publicGatewayError(error) {
  return {
    error: {
      code: String(error?.code || "AI_CAPABILITY_GATEWAY_FAILED"),
      message: String(error?.message || "Execution gateway request failed.").replace(/\s+/g, " ").slice(0, 240),
    },
  };
}

function countOf(value) {
  return Number(value?.count || value?.c || 0);
}

function compactRisk(row) {
  const severity = String(row.severity || "medium");
  const title = String(row.title || "Untitled risk").replace(/\s+/g, " ").trim().slice(0, 180);
  return `[${severity}] ${title}`;
}

function buildSnapshotSummary(snapshot) {
  const project = snapshot.project;
  const metrics = snapshot.metrics;
  const blockers = [
    metrics.blockedTasks ? `${metrics.blockedTasks} blocked task${metrics.blockedTasks === 1 ? "" : "s"}` : "",
    metrics.openDefects ? `${metrics.openDefects} open defect${metrics.openDefects === 1 ? "" : "s"}` : "",
    metrics.openRisks ? `${metrics.openRisks} open risk${metrics.openRisks === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const status = project.status || "unknown";
  const health = Number.isFinite(project.healthScore) ? `health ${project.healthScore}` : "health unavailable";
  return `${project.name} is ${status} (${health}). ${blockers.length ? `Attention: ${blockers.join(", ")}.` : "No current blocking count was found."}`;
}

function compactDomainText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

// Read summaries are deliberately narrow projections: identity, workflow state,
// ownership, and dates. Long content fields are truncated, never returned raw.
function requirementSummary(requirement) {
  return {
    id: requirement.id,
    title: compactDomainText(requirement.title, DOMAIN_TITLE_LIMIT),
    status: requirement.status,
    priority: requirement.priority,
    owner: requirement.owner,
    assignee: requirement.assignee || null,
    completion: Number(requirement.completion) || 0,
    version: Number(requirement.version) || 1,
  };
}

function taskSummary(task) {
  return {
    id: task.id,
    title: compactDomainText(task.title, DOMAIN_TITLE_LIMIT),
    status: task.status,
    type: task.type,
    owner: task.owner,
    dueDate: task.due_date || null,
    progress: Number(task.progress) || 0,
    estimatedHours: Number(task.estimated_hours) || 0,
    remainingHours: Number(task.remaining_hours ?? task.estimated_hours) || 0,
    version: Number(task.version) || 1,
  };
}

function defectSummary(defect) {
  return {
    id: defect.id,
    title: compactDomainText(defect.title, DOMAIN_TITLE_LIMIT),
    severity: defect.severity,
    status: defect.status,
    assignee: defect.assignee || null,
    reporter: defect.reporter || null,
  };
}

function readDomainText(value, field, { maxLength, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw gatewayError("VALIDATION_FAILED", `${field} is required.`, 400);
    return "";
  }
  if (typeof value !== "string") throw gatewayError("VALIDATION_FAILED", `${field} must be a string.`, 400);
  const trimmed = value.trim();
  if (required && !trimmed) throw gatewayError("VALIDATION_FAILED", `${field} is required.`, 400);
  if (trimmed.length > maxLength) {
    throw gatewayError("VALIDATION_FAILED", `${field} must not exceed ${maxLength} characters.`, 400);
  }
  return trimmed;
}

function readDomainEstimatedHours(value) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    throw gatewayError("VALIDATION_FAILED", "estimatedHours must be a non-negative number.", 400);
  }
  return parsed;
}

function createExecutionGateway({
  audit,
  browserControl,
  canAccessProject,
  canWriteProject,
  controlStore,
  hasPermission,
  insert,
  interactionHandler,
  json,
  maxBodyBytes = MAX_GATEWAY_BODY_BYTES,
  nextId,
  now = () => new Date().toISOString(),
  publicUser,
  registry,
  row,
  rows,
  serverFactory = http.createServer,
  tokenService,
  transaction,
  uiDirectiveSink,
}) {
  if (!registry || !controlStore || !tokenService) throw new Error("Execution gateway policy dependencies are required.");
  if (typeof row !== "function" || typeof rows !== "function" || typeof canAccessProject !== "function" || typeof publicUser !== "function" || typeof hasPermission !== "function") {
    throw new Error("Execution gateway data and access dependencies are required.");
  }
  if (typeof audit !== "function" || typeof insert !== "function" || typeof json !== "function" || typeof nextId !== "function") {
    throw new Error("Execution gateway write dependencies (audit, insert, json, nextId) are required.");
  }

  const capturedByInvocation = new Map();
  const consumedTokenIds = new Map();
  const inFlightTokenIds = new Set();
  let baseUrl = null;
  let closeTask;
  let server;
  let startTask;

  function pruneConsumed() {
    const time = Date.now();
    for (const [tokenId, expiresAt] of consumedTokenIds) {
      if (expiresAt <= time) consumedTokenIds.delete(tokenId);
    }
  }

  // Single-use tokens run in two phases. A token is reserved in-flight for the
  // duration of one execution (blocking a concurrent replay), then either
  // committed to the consumed set on success or released on failure — so a
  // transient error (DB blip, dispatch throw) never permanently burns a still
  // valid token. reserveToken throws the replay error itself; callers must not
  // release a token they failed to reserve.
  function reserveToken(claims) {
    pruneConsumed();
    if (consumedTokenIds.has(claims.jti) || inFlightTokenIds.has(claims.jti)) {
      throw gatewayError("AI_CAPABILITY_TOKEN_REPLAYED", "Execution token was already used.", 409);
    }
    inFlightTokenIds.add(claims.jti);
  }

  function commitToken(claims) {
    inFlightTokenIds.delete(claims.jti);
    consumedTokenIds.set(claims.jti, claims.exp);
  }

  function releaseToken(claims) {
    inFlightTokenIds.delete(claims.jti);
  }

  async function loadSnapshot(projectId) {
    const project = await row(
      `SELECT id, name, objective, status, health_score, owner, progress, start_date, end_date, updated_at
         FROM projects
        WHERE id = @projectId AND deleted_at IS NULL`,
      { projectId },
    );
    if (!project) throw gatewayError("RESOURCE_NOT_FOUND", "Project not found.", 404);
    const [requirements, tasks, blockedTasks, defects, failingTests, risks, riskRows] = await Promise.all([
      row("SELECT COUNT(*) AS count FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL", { projectId }),
      row("SELECT COUNT(*) AS count FROM tasks WHERE project_id = @projectId", { projectId }),
      row("SELECT COUNT(*) AS count FROM tasks WHERE project_id = @projectId AND (status = 'blocked' OR COALESCE(blocker, '') != '')", { projectId }),
      row("SELECT COUNT(*) AS count FROM defects WHERE project_id = @projectId AND status NOT IN ('verified', 'closed', 'rejected')", { projectId }),
      row("SELECT COUNT(*) AS count FROM test_cases WHERE project_id = @projectId AND (status IN ('failed', 'blocked') OR failed_cases > 0 OR blocked_cases > 0)", { projectId }),
      row("SELECT COUNT(*) AS count FROM project_risks WHERE project_id = @projectId AND status != 'closed'", { projectId }),
      rows(
        `SELECT title, severity, status, owner_name
           FROM project_risks
          WHERE project_id = @projectId AND status != 'closed'
          ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC
          LIMIT 8`,
        { projectId },
      ),
    ]);
    const snapshot = {
      project: {
        id: project.id,
        name: project.name,
        objective: String(project.objective || "").slice(0, 1200),
        status: project.status,
        healthScore: Number(project.health_score),
        owner: project.owner,
        progress: Number(project.progress),
        startDate: project.start_date || null,
        endDate: project.end_date || null,
        updatedAt: project.updated_at || null,
      },
      metrics: {
        requirements: countOf(requirements),
        tasks: countOf(tasks),
        blockedTasks: countOf(blockedTasks),
        openDefects: countOf(defects),
        failingTestCases: countOf(failingTests),
        openRisks: countOf(risks),
      },
      risks: (riskRows || []).map(compactRisk),
      evidence: [],
    };
    snapshot.evidence = [
      `Project ${snapshot.project.id} is scoped to this invocation.`,
      `${snapshot.metrics.requirements} active requirements and ${snapshot.metrics.tasks} tasks were included.`,
      `${snapshot.metrics.openDefects} open defects, ${snapshot.metrics.failingTestCases} failing or blocked test cases, and ${snapshot.metrics.openRisks} open risks were included.`,
    ];
    return snapshot;
  }

  async function execute({ input, source = "adapter-fallback", token }) {
    const claims = tokenService.verify(token, { capabilityId: "project-snapshot" });
    const manifest = registry.get(claims.capabilityId);
    if (!manifest || manifest.version !== claims.capabilityVersion || manifest.status !== "approved") {
      throw gatewayError("AI_CAPABILITY_UNAPPROVED", "AI capability is not approved.", 503);
    }
    const control = await controlStore.get(manifest.id);
    if (!control.enabled) throw gatewayError("AI_CAPABILITY_DISABLED", "AI capability is disabled.", 503);
    const normalizedInput = registry.normalizeInvocationInput(manifest.id, input);
    if (normalizedInput.projectId !== claims.projectId) {
      throw gatewayError("AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", "Execution token scope does not match this project.", 403);
    }
    // Reserve the token in-flight before any database work: a concurrent
    // request cannot replay it mid-execution, yet a failure below releases it
    // so a transient error does not permanently burn a still-valid token.
    reserveToken(claims);
    try {
      const actor = await row("SELECT * FROM users WHERE id = @id", { id: claims.actorId });
      if (!actor || actor.status !== "active") {
        throw gatewayError("AI_CAPABILITY_ACTOR_UNAVAILABLE", "Execution actor is unavailable.", 403);
      }
      const user = publicUser(actor);
      if (!hasPermission(user, "ai:*")) {
        throw gatewayError("PERMISSION_DENIED", "Execution actor cannot use AI capabilities.", 403);
      }
      if (!(await canAccessProject(user, claims.projectId))) {
        throw gatewayError("PERMISSION_DENIED", "Execution actor cannot access this project.", 403);
      }
      const snapshot = await loadSnapshot(claims.projectId);
      const evidence = {
        at: now(),
        capabilityId: manifest.id,
        capabilityVersion: manifest.version,
        event: "execution-gateway.project-snapshot",
        projectId: claims.projectId,
        source: source === "runtime-tool" ? "runtime-tool" : "adapter-fallback",
      };
      const captured = { claims: tokenService.publicClaims(claims), evidence, snapshot };
      commitToken(claims);
      // Only a successful Harness tool call needs a temporary hand-off to the
      // adapter. Local fallback already owns the returned value directly.
      if (source === "runtime-tool") capturedByInvocation.set(claims.invocationId, captured);
      return captured;
    } catch (error) {
      releaseToken(claims);
      throw error;
    }
  }

  function bestEffortClaims(token) {
    try {
      return tokenService.verify(token);
    } catch {
      return null;
    }
  }

  function domainEvidence(capability, claims, source) {
    return {
      at: now(),
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      event: `execution-gateway.${capability.id}`,
      mode: capability.mode,
      projectId: claims.projectId,
      source: source === "runtime-tool" ? "runtime-tool" : "adapter-fallback",
    };
  }

  // Every rejected domain execution leaves an audit trail. A failure of this
  // compensation audit must never replace the policy error the caller sees.
  async function auditDomainRejection({ actor, capability, capabilityId, claims, error }) {
    const status = Number(error?.status) || 502;
    const denied = status >= 400 && status < 500;
    try {
      await audit(
        actor || null,
        denied ? "ai.capability_execution_denied" : "ai.capability_execution_failed",
        "ai_capability_execution",
        claims?.invocationId || null,
        null,
        {
          capabilityId: capability?.id || capabilityId || null,
          errorCode: String(error?.code || "AI_CAPABILITY_GATEWAY_FAILED"),
          projectId: claims?.projectId || null,
        },
        null,
        claims?.projectId ? { scopeType: "project", projectId: claims.projectId } : undefined,
      );
    } catch {
      // Keep the original policy failure authoritative.
    }
  }

  async function listDomainRequirements(projectId) {
    const items = await rows(
      `SELECT id, title, status, priority, owner, assignee, completion, version
         FROM requirements
        WHERE project_id = @projectId AND deleted_at IS NULL
        ORDER BY id
        LIMIT ${DOMAIN_LIST_LIMIT}`,
      { projectId },
    );
    return { count: items.length, requirements: items.map(requirementSummary) };
  }

  async function getDomainRequirement(projectId, requirementId) {
    // Scope the lookup to the invocation project so a requirement in another
    // project is indistinguishable from a missing one (both 404). Splitting
    // 403 vs 404 here would leak the cross-project existence of requirement ids.
    const requirement = await row(
      `SELECT id, title, description, status, priority, owner, assignee, completion, version
         FROM requirements
        WHERE id = @requirementId AND project_id = @projectId AND deleted_at IS NULL`,
      { projectId, requirementId },
    );
    if (!requirement) throw gatewayError("RESOURCE_NOT_FOUND", "Requirement not found.", 404);
    return {
      requirement: {
        ...requirementSummary(requirement),
        description: compactDomainText(requirement.description, DOMAIN_TEXT_LIMIT),
      },
    };
  }

  async function listDomainTasks(projectId) {
    const items = await rows(
      `SELECT id, title, status, type, owner, due_date, progress, estimated_hours, remaining_hours, version
         FROM tasks
        WHERE project_id = @projectId
        ORDER BY sort_order
        LIMIT ${DOMAIN_LIST_LIMIT}`,
      { projectId },
    );
    return { count: items.length, tasks: items.map(taskSummary) };
  }

  async function listDomainDefects(projectId) {
    const items = await rows(
      `SELECT id, title, severity, status, assignee, reporter
         FROM defects
        WHERE project_id = @projectId
        ORDER BY id
        LIMIT ${DOMAIN_LIST_LIMIT}`,
      { projectId },
    );
    return { count: items.length, defects: items.map(defectSummary) };
  }

  // Reminder read projection: scheduling identity only. The owning actor id
  // stays internal — the invoking user already is that actor.
  function reminderSummary(reminder) {
    return {
      id: reminder.id,
      message: compactDomainText(reminder.message, REMINDER_MESSAGE_LIMIT),
      remindAt: reminder.remind_at,
      status: reminder.status,
      invocationId: reminder.invocation_id || null,
      createdAt: reminder.created_at,
    };
  }

  async function listDomainReminders(projectId) {
    const items = await rows(
      `SELECT id, message, remind_at, status, invocation_id, created_at
         FROM ai_reminders
        WHERE project_id = @projectId AND status = 'pending' AND remind_at > @now
        ORDER BY remind_at
        LIMIT ${DOMAIN_LIST_LIMIT}`,
      { projectId, now: now() },
    );
    return { count: items.length, reminders: items.map(reminderSummary) };
  }

  function readReminderRemindAt(value) {
    const raw = readDomainText(value, "remindAt", { maxLength: 64, required: true });
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      throw gatewayError("VALIDATION_FAILED", "remindAt must be an ISO 8601 timestamp.", 400);
    }
    const nowMs = Date.parse(now());
    if (!Number.isFinite(nowMs)) {
      throw gatewayError("AI_CAPABILITY_GATEWAY_FAILED", "Execution gateway clock is unavailable.", 500);
    }
    if (parsed < nowMs + REMINDER_MIN_LEAD_MS) {
      throw gatewayError("VALIDATION_FAILED", "remindAt must be at least 60 seconds in the future.", 400);
    }
    if (parsed > nowMs + REMINDER_MAX_LEAD_MS) {
      throw gatewayError("VALIDATION_FAILED", "remindAt must be within the next 180 days.", 400);
    }
    return new Date(parsed).toISOString();
  }

  async function createDomainReminder({ actor, capability, claims, input }) {
    const message = readDomainText(input.message, "message", { maxLength: REMINDER_MESSAGE_LIMIT, required: true });
    const remindAt = readReminderRemindAt(input.remindAt);
    const invocationId = readDomainText(input.invocationId, "invocationId", { maxLength: 128 });
    const id = await nextId("REM");
    const record = {
      id,
      project_id: claims.projectId,
      actor_id: actor?.id || claims.actorId,
      message,
      remind_at: remindAt,
      status: "pending",
      invocation_id: invocationId || claims.invocationId || null,
      created_at: now(),
      sent_at: null,
    };
    await commitDomainWrite({
      actor,
      capability,
      claims,
      createEntity: () => insert("ai_reminders", record),
      resourceType: "ai_reminder",
      resourceId: id,
      auditAfter: () => ({ message: record.message, projectId: claims.projectId, remindAt: record.remind_at, reminderId: id }),
    });
    return {
      reminder: {
        id,
        message: record.message,
        projectId: claims.projectId,
        remindAt: record.remind_at,
        status: record.status,
        invocationId: record.invocation_id,
        createdAt: record.created_at,
      },
    };
  }

  // Writes commit the entity and the mandatory audit record together. With a
  // transaction helper both share one atomic unit (an audit outage rolls the
  // created entity back); without one the audit is written first so an audit
  // outage aborts before any entity exists.
  async function commitDomainWrite({ actor, capability, claims, createEntity, resourceType, resourceId, auditAfter }) {
    const writeAudit = () => audit(
      actor,
      "ai.capability_execution_write",
      resourceType,
      resourceId,
      null,
      { ...auditAfter(), capabilityId: capability.id, capabilityVersion: capability.version, invocationId: claims.invocationId },
      null,
      { scopeType: "project", projectId: claims.projectId },
    );
    const auditedWrite = async () => {
      try {
        await writeAudit();
      } catch {
        throw gatewayError("AI_CAPABILITY_AUDIT_WRITE_FAILED", "Execution write audit failed; the write was not committed.", 502);
      }
    };
    if (typeof transaction === "function") {
      await transaction(async () => {
        await createEntity();
        await auditedWrite();
      });
      return;
    }
    await auditedWrite();
    await createEntity();
  }

  async function createDomainRequirement({ actor, capability, claims, input }) {
    const title = readDomainText(input.title, "title", { maxLength: DOMAIN_TITLE_LIMIT, required: true });
    const description = readDomainText(input.description, "description", { maxLength: DOMAIN_DESCRIPTION_LIMIT });
    const priority = input.priority === undefined || input.priority === null || input.priority === "" ? "medium" : String(input.priority);
    if (!REQUIREMENT_PRIORITIES.includes(priority)) {
      throw gatewayError("VALIDATION_FAILED", `priority must be one of: ${REQUIREMENT_PRIORITIES.join(", ")}.`, 400);
    }
    const id = await nextId("REQ");
    const record = buildRequirementCreate(
      { description, priority, projectId: claims.projectId, title },
      { id, json },
    );
    await commitDomainWrite({
      actor,
      capability,
      claims,
      createEntity: () => insert("requirements", record),
      resourceType: "requirement",
      resourceId: id,
      auditAfter: () => ({ projectId: claims.projectId, requirementId: id, status: record.status, title: record.title }),
    });
    return {
      requirement: {
        id,
        priority: record.priority,
        projectId: claims.projectId,
        status: record.status,
        title: record.title,
        version: record.version,
      },
    };
  }

  async function createDomainTask({ actor, capability, claims, input }) {
    const title = readDomainText(input.title, "title", { maxLength: DOMAIN_TITLE_LIMIT, required: true });
    const requirementId = readDomainText(input.requirementId, "requirementId", { maxLength: 128, required: true });
    const estimatedHours = readDomainEstimatedHours(input.estimatedHours);
    const requirement = await row(
      "SELECT id, project_id FROM requirements WHERE id = @requirementId AND deleted_at IS NULL",
      { requirementId },
    );
    if (!requirement) throw gatewayError("RESOURCE_NOT_FOUND", "Requirement not found.", 404);
    if (requirement.project_id !== claims.projectId) {
      throw gatewayError("VALIDATION_FAILED", "Requirement must belong to the invocation project.", 400);
    }
    const id = await nextId("TASK");
    const record = buildTaskCreate(
      { estimatedHours, owner: actor?.name || "Unassigned", requirementId, title },
      { id, json, projectId: claims.projectId, sortOrder: Date.now(), dueDate: now().slice(0, 10) },
    );
    await commitDomainWrite({
      actor,
      capability,
      claims,
      createEntity: () => insert("tasks", record),
      resourceType: "task",
      resourceId: id,
      auditAfter: () => ({ estimatedHours: record.estimated_hours, projectId: claims.projectId, requirementId, taskId: id, title: record.title }),
    });
    return {
      task: {
        estimatedHours: record.estimated_hours,
        id,
        projectId: claims.projectId,
        requirementId,
        status: record.status,
        title: record.title,
        version: record.version,
      },
    };
  }

  // ui-control: pushes one whitelisted UI directive to the invoking user's
  // connected clients. The push target comes from the token's userId claim —
  // never from tool input — and a missing claim (e.g. a bare REST test call
  // without an invocation context) still audits and answers ok with delivered
  // 0 instead of failing. Write semantics: the audit record is mandatory and
  // precedes the push, so an audit outage leaves the UI untouched.
  async function executeUiControl({ actor, capability, claims, input }) {
    const directive = assertUiDirective(input.directive);
    const targetUserId = String(claims.userId || "").trim();
    try {
      await audit(
        actor,
        "ai.tool.ui_control",
        "ai_ui_directive",
        null,
        null,
        {
          capabilityId: capability.id,
          capabilityVersion: capability.version,
          directive,
          invocationId: claims.invocationId,
        },
        null,
      );
    } catch {
      throw gatewayError("AI_CAPABILITY_AUDIT_WRITE_FAILED", "Execution write audit failed; the UI directive was not pushed.", 502);
    }
    let delivered = 0;
    if (targetUserId && typeof uiDirectiveSink === "function") {
      const pushed = uiDirectiveSink(targetUserId, directive);
      delivered = Number.isFinite(Number(pushed)) ? Math.max(0, Math.floor(Number(pushed))) : 0;
    }
    return { delivered, ok: true };
  }

  // browser-control: drives the headless browser service. The action input is
  // normalized first (whitelist + per-action fields), then the audit record is
  // mandatory and precedes the side effect, so an audit outage leaves the
  // browser untouched. Sessions are keyed by (actor, project) from the token
  // claims — never from tool input. projectScoped:false in the registry
  // exempts this capability from the project data gates, but the invocation
  // still carries the control-plane projectId for audit/storage scope.
  async function executeBrowserControl({ actor, capability, claims, input }) {
    if (!browserControl || typeof browserControl.executeAction !== "function") {
      throw gatewayError("AI_BROWSER_DISABLED", "Browser control is not available on this server.", 503);
    }
    const normalized = browserControl.normalizeAction(input);
    const sessionKey = `${claims.actorId}:${claims.projectId || "global"}`;
    try {
      await audit(
        actor,
        "ai.tool.browser_control",
        "ai_browser_action",
        claims.invocationId || null,
        null,
        {
          capabilityId: capability.id,
          capabilityVersion: capability.version,
          action: normalized,
          projectId: claims.projectId || null,
        },
        null,
      );
    } catch {
      throw gatewayError("AI_CAPABILITY_AUDIT_WRITE_FAILED", "Execution write audit failed; the browser action was not executed.", 502);
    }
    browserControl.sweepSessions?.();
    return browserControl.executeAction(normalized, {
      sessionKey,
      invocationId: claims.invocationId,
    });
  }

  async function dispatchDomainCapability({ actor, capability, claims, input }) {
    switch (capability.id) {
      case "requirements-list":
        return { projectId: claims.projectId, ...(await listDomainRequirements(claims.projectId)) };
      case "requirement-get": {
        const requirementId = readDomainText(input.requirementId, "requirementId", { maxLength: 128, required: true });
        return { projectId: claims.projectId, ...(await getDomainRequirement(claims.projectId, requirementId)) };
      }
      case "tasks-list":
        return { projectId: claims.projectId, ...(await listDomainTasks(claims.projectId)) };
      case "defects-list":
        return { projectId: claims.projectId, ...(await listDomainDefects(claims.projectId)) };
      case "requirement-create":
        return createDomainRequirement({ actor, capability, claims, input });
      case "task-create":
        return createDomainTask({ actor, capability, claims, input });
      case "reminders-list":
        return { projectId: claims.projectId, ...(await listDomainReminders(claims.projectId)) };
      case "reminder-create":
        return createDomainReminder({ actor, capability, claims, input });
      case "ui-control":
        return executeUiControl({ actor, capability, claims, input });
      case "browser-control":
        return executeBrowserControl({ actor, capability, claims, input });
      default:
        throw gatewayError("AI_EXECUTION_CAPABILITY_UNKNOWN", "Execution capability is not dispatchable.", 400);
    }
  }

  // Domain capability execution: the token must be scoped to exactly the
  // requested capability (id and version), so a read-only invocation token can
  // never execute a write capability and vice versa. The registry-declared
  // permission, the ai:* baseline, and the project scope are re-checked here at
  // the execution boundary.
  async function executeDomain({ input = {}, source = "runtime-tool", token } = {}) {
    const capabilityId = String(input.capabilityId || "").trim();
    const capabilityVersion = String(input.capabilityVersion || "").trim();
    const capability = findExecutionCapability(capabilityId, capabilityVersion);
    if (!capability) {
      const error = gatewayError("AI_EXECUTION_CAPABILITY_UNKNOWN", "Execution capability is not registered for this gateway.", 400);
      await auditDomainRejection({ actor: null, capability: null, capabilityId, claims: bestEffortClaims(token), error });
      throw error;
    }
    const claims = tokenService.verify(token, { capabilityId: capability.id, capabilityVersion: capability.version });
    let actorRow = null;
    let reserved = false;
    try {
      // Two-phase reservation (see reserveToken): in-flight now, committed only
      // after dispatch succeeds, released on any failure below so a transient
      // error is retryable with the same still-valid token.
      reserveToken(claims);
      reserved = true;
      actorRow = await row("SELECT * FROM users WHERE id = @id", { id: claims.actorId });
      if (!actorRow || actorRow.status !== "active") {
        throw gatewayError("AI_CAPABILITY_ACTOR_UNAVAILABLE", "Execution actor is unavailable.", 403);
      }
      const user = publicUser(actorRow);
      if (!hasPermission(user, "ai:*")) {
        throw gatewayError("PERMISSION_DENIED", "Execution actor cannot use AI capabilities.", 403);
      }
      if (!hasPermission(user, capability.permission)) {
        throw gatewayError("PERMISSION_DENIED", `Execution actor cannot use the ${capability.id} capability.`, 403);
      }
      // Project-scope gates apply to every project-data capability. ui-control
      // is a declared non-project capability (projectScoped: false): it
      // addresses the invoking user's own live UI through the token's
      // userId claim and never reads or writes project data, so requiring a
      // matching projectId here would only force callers to send a fake one.
      if (capability.projectScoped !== false) {
        const projectId = String(input.projectId || "").trim();
        if (!projectId || projectId !== claims.projectId) {
          throw gatewayError("AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", "Execution token scope does not match this project.", 403);
        }
        if (!(await canAccessProject(user, claims.projectId))) {
          throw gatewayError("PERMISSION_DENIED", "Execution actor cannot access this project.", 403);
        }
        if (capability.mode === "write") {
          const canWrite = typeof canWriteProject === "function" ? canWriteProject : canAccessProject;
          if (!(await canWrite(user, claims.projectId))) {
            throw gatewayError("PERMISSION_DENIED", "Execution actor cannot write in this project.", 403);
          }
        }
      }
      const result = await dispatchDomainCapability({ actor: actorRow, capability, claims, input });
      commitToken(claims);
      reserved = false;
      const captured = {
        claims: tokenService.publicClaims(claims),
        evidence: domainEvidence(capability, claims, source),
        result,
      };
      // Mirror the project-snapshot hand-off: a successful Harness tool call
      // leaves its adjudicated result for the adapter to pick up, so the
      // adapter can distinguish "the model used the tool" from local fallback.
      if (source === "runtime-tool") capturedByInvocation.set(claims.invocationId, captured);
      return captured;
    } catch (error) {
      if (reserved) releaseToken(claims);
      await auditDomainRejection({ actor: actorRow, capability, capabilityId, claims, error });
      throw error;
    }
  }

  async function handle(req, res) {
    const parsed = new URL(req.url || "/", "http://127.0.0.1");
    // Sprint 5.1 ask-user/user-approval bridge: interaction routes ride this
    // same loopback server (reusing its URL and scoped-token creation auth).
    // The handler owns only /v1/interaction* paths and answers everything it
    // matches, so the gateway's own 404 semantics stay untouched otherwise.
    if (typeof interactionHandler === "function" && await interactionHandler(req, res, parsed)) return;
    if (req.method !== "POST" || parsed.search || parsed.hash) {
      writeJson(res, 404, { error: { code: "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN", message: "Execution gateway route is not allowed." } });
      return;
    }
    if (parsed.pathname === "/v1/project-snapshot") {
      try {
        const result = await execute({
          input: await readJsonBody(req, maxBodyBytes),
          source: "runtime-tool",
          token: readBearerToken(req.headers.authorization),
        });
        writeJson(res, 200, { data: { evidence: result.evidence, snapshot: result.snapshot } });
      } catch (error) {
        writeJson(res, Number(error?.status) || 502, publicGatewayError(error));
      }
      return;
    }
    if (parsed.pathname === DOMAIN_EXECUTION_ROUTE) {
      try {
        const result = await executeDomain({
          input: await readJsonBody(req, maxBodyBytes),
          source: "runtime-tool",
          token: readBearerToken(req.headers.authorization),
        });
        writeJson(res, 200, { data: { evidence: result.evidence, result: result.result } });
      } catch (error) {
        writeJson(res, Number(error?.status) || 502, publicGatewayError(error));
      }
      return;
    }
    writeJson(res, 404, { error: { code: "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN", message: "Execution gateway route is not allowed." } });
  }

  async function start() {
    if (baseUrl) return baseUrl;
    startTask ||= new Promise((resolve, reject) => {
      server = serverFactory((req, res) => { void handle(req, res); });
      const onError = (error) => {
        server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server?.off("error", onError);
        const address = server?.address();
        if (!address || typeof address === "string") {
          reject(gatewayError("AI_CAPABILITY_GATEWAY_START_FAILED", "Execution gateway did not expose a loopback port.", 500));
          return;
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve(baseUrl);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
    try {
      return await startTask;
    } catch (error) {
      startTask = undefined;
      throw error;
    }
  }

  async function close() {
    if (closeTask) return closeTask;
    closeTask = new Promise((resolve) => {
      if (!server) return resolve();
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
    await closeTask;
    if (typeof browserControl?.close === "function") {
      await browserControl.close().catch(() => {});
    }
    baseUrl = null;
    server = undefined;
    startTask = undefined;
  }

  return {
    close,
    execute,
    executeDomain,
    getCaptured(invocationId) {
      const key = String(invocationId || "");
      const captured = capturedByInvocation.get(key) || null;
      if (captured) capturedByInvocation.delete(key);
      return captured;
    },
    start,
    status: () => ({ capturedInvocations: capturedByInvocation.size, started: Boolean(baseUrl) }),
  };
}

module.exports = {
  MAX_GATEWAY_BODY_BYTES,
  buildSnapshotSummary,
  createExecutionGateway,
  gatewayError,
};
