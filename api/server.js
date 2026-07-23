const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const multer = require("multer");
const { WebSocketServer } = require("ws");
const {
  audit: writeAuditLog,
  initDb,
  closeDatabase,
  db: sqliteConnection,
  insert,
  json,
  mapDefect,
  mapDocument,
  mapProject,
  mapRequirement,
  mapSprint,
  mapTask,
  mapTestCase,
  mapTestRun,
  mapUser,
  mapProduct,
  mapBuild,
  mapRelease,
  now,
  parse,
  recordBurndownSnapshot,
  buildSprintBurndown,
  row,
  rows,
  run,
  transaction,
  dialect,
  STORAGE_DIR,
} = require("./db");
const { formatPreflightReport, preflightEnv } = require("./src/ops/envPreflight");
const { preflightMigrationStatus } = require("./src/ops/migrationStatus");
const { checkReadiness } = require("./src/ops/readiness");
const {
  apiOnlyContentSecurityPolicyDirectives,
  mountStaticWeb,
  resolveWebDist,
  shouldEnableHsts,
  shouldServeWeb,
  spaContentSecurityPolicyDirectives,
} = require("./src/ops/staticWeb");
const {
  SYSTEM_ROLES,
  buildCapabilities,
  defaultPermissionsForRole,
  hasPermission,
  isSystemRole,
  normalizeRole,
  publicUser,
  visibleDocumentsForUser,
} = require("./src/security/accessControl");
const { createAuthMiddleware } = require("./src/middleware/auth");
const { createProjectAccess } = require("./src/security/projectAccess");
const { createSecretCodec } = require("./src/security/secretCodec");
const { createAuditRouter } = require("./src/modules/audit/routes");
const { createAuditRepository } = require("./src/modules/audit/repository");
const { createAuthRouter } = require("./src/modules/auth/routes");
const { createAuthRepository } = require("./src/modules/auth/repository");
const { createAuthService } = require("./src/modules/auth/service");
const { createCapacityRouter } = require("./src/modules/capacity/routes");
const { createCapacityRepository } = require("./src/modules/capacity/repository");
const { createAiJobsRouter } = require("./src/modules/ai/routes");
const { createAiJobRepository, createBusinessAdviceRepository } = require("./src/modules/ai/repository");
const { createDocumentAnalysisService } = require("./src/modules/ai/documentAnalysis");
const { createAiModelClient, normalizeAiWireApi } = require("./src/modules/ai/modelClient");
const { createAiJobDispatcher } = require("./src/modules/ai/jobDispatcher");
const { createDocumentAnalysisRunner } = require("./src/modules/ai/jobRunner");
const { failTimedOutAiJobs, startAiJobTimeoutMonitor } = require("./src/modules/ai/timeoutMonitor");
const { buildDocumentChunks } = require("./src/modules/ai/ragIndex");
const { createAiInteractionsRouter } = require("./src/modules/ai/interactionsRoutes");
const { createBusinessAdviceContextService, createBusinessAdviceHelpers } = require("./src/modules/ai/interactionsService");
const { createAiChatService, dataUrlForAttachment, normalizeAiChatMessages } = require("./src/modules/ai/chatService");
const { compactText, createAiSummaryService } = require("./src/modules/ai/summaryService");
const { createAiAdviceService } = require("./src/modules/ai/adviceService");
const { createAiProviderAdminRouter } = require("./src/modules/ai/providerAdminRoutes");
const { createAiProviderAdminService } = require("./src/modules/ai/providerAdminService");
const { createAiProviderStore } = require("./src/modules/ai/providerStore");
const { createDashboardRouter } = require("./src/modules/dashboard/routes");
const { createDashboardRepository } = require("./src/modules/dashboard/repository");
const { createDashboardService } = require("./src/modules/dashboard/service");
const { createDefectsRouter } = require("./src/modules/defects/routes");
const { createDefectsRepository } = require("./src/modules/defects/repository");
const { createGovernanceRouter } = require("./src/modules/governance/routes");
const { createGovernanceRepository } = require("./src/modules/governance/repository");
const { createDeliveryRouter } = require("./src/modules/delivery/routes");
const { createDeliveryRepository } = require("./src/modules/delivery/repository");
const { CLOSED_DEFECT_STATUSES, createDeliveryService } = require("./src/modules/delivery/service");
const { mapDeliveryAudit, mapReleaseApproval, mapRollbackRecord } = require("./src/modules/delivery/mappers");
const { createDocumentsRouter } = require("./src/modules/documents/routes");
const { canManageDocument, canViewDocument: canViewDocumentByPolicy } = require("./src/modules/documents/policy");
const { createDocumentCollaborationServer } = require("./src/modules/documents/collaboration");
const { extractTextFromUpload } = require("./src/modules/documents/textExtraction");
const { createProductsRouter } = require("./src/modules/products/routes");
const { createStrategyRouter } = require("./src/modules/strategy/routes");
const { createProjectsRouter } = require("./src/modules/projects/routes");
const { createProjectsRepository } = require("./src/modules/projects/repository");
const { projectActivationReadiness: evaluateProjectActivationReadiness } = require("./src/modules/projects/service");
const { createOrganizationRouter } = require("./src/modules/organization/routes");
const { createOrganizationRepository } = require("./src/modules/organization/repository");
const { createProjectSourceBrowser } = require("./src/modules/projects/sourceBrowser");
const { createRequirementsRouter } = require("./src/modules/requirements/routes");
const { createRequirementsRepository } = require("./src/modules/requirements/repository");
const { createRequirementScoreService } = require("./src/modules/requirements/scoreService");
const { createRequirementTaskSync } = require("./src/modules/requirements/taskSync");
const { createTasksRouter } = require("./src/modules/tasks/routes");
const { createTasksRepository } = require("./src/modules/tasks/repository");
const { createTestingRouter } = require("./src/modules/testing/routes");
const { createTestCaseTaskSync } = require("./src/modules/testing/taskSync");
const { createDefectTaskSync } = require("./src/modules/defects/taskSync");
const { createAiTargetAccess } = require("./src/modules/ai/targetAccess");
const { createRagMaintenance } = require("./src/modules/ai/ragMaintenance");
const { createAiJobRecovery } = require("./src/modules/ai/jobRecovery");
const { createNextId } = require("./src/lib/nextId");
const { createDateHelpers } = require("./src/lib/dates");
const { createIdempotency } = require("./src/lib/idempotency");
const { createProjectVersionGuard } = require("./src/lib/projectVersion");
const { createTeamRouter } = require("./src/modules/team/routes");
const { createTeamService } = require("./src/modules/team/service");
const { createTimeEntriesRouter } = require("./src/modules/timeEntries/routes");
const { createTimeEntriesRepository } = require("./src/modules/timeEntries/repository");
const { createWorkLogsRouter } = require("./src/modules/workLogs/routes");
const { createWorkLogsRepository } = require("./src/modules/workLogs/repository");
const { createWorkLogHelpers } = require("./src/modules/workLogs/service");
const { createWorkLogAnalysisService } = require("./src/modules/workLogs/analysisService");
const { createWorkflowRouter } = require("./src/modules/workflow/routes");
const { createProjectFlowService } = require("./src/modules/workflow/service");
const { createMetaRouter } = require("./src/modules/meta/routes");
const { canTransition } = require("./src/workflow/stateMachine");
const { createStatusHistory } = require("./src/workflow/statusHistory");
const { createSprintCommitment } = require("./src/workflow/sprintCommitment");
const { publicWorkflowTemplates } = require("./src/workflow/templates");
const { createWorkflowTemplateStore } = require("./src/workflow/templateStore");
const {
  BUILD_STATUSES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  DOCUMENT_CATEGORIES,
  PROJECT_STATUSES,
  RELEASE_STATUSES,
  RELEASE_TYPES,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  SPRINT_STATUSES,
  TASK_STATUSES,
  TASK_TYPES,
  TEST_CASE_STATUSES,
  publicEnums,
} = require("./src/domain/enums");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 4010;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

// Fail closed in production before opening sockets or loading secrets deeply.
// Also validates SQLite parent-dir writability (DATABASE_FILE or default api/app.db).
{
  const defaultDatabaseFile = process.env.DATABASE_FILE
    ? undefined
    : path.join(__dirname, "app.db");
  const envReport = preflightEnv(process.env, { defaultDatabaseFile, checkFilesystem: true });
  for (const issue of envReport.issues) {
    const line = `[env] ${issue.code}: ${issue.message}`;
    if (issue.level === "error") console.error(line);
    else console.warn(line);
  }
  if (!envReport.ok) {
    console.error(formatPreflightReport(envReport));
    process.exit(1);
  }
}

const DEFAULT_AI_PROVIDER = {
  provider: process.env.AI_PROVIDER || "openai-compatible",
  baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  model: process.env.AI_MODEL || "gpt-4o-mini",
  wireApi: process.env.AI_WIRE_API || "chat_completions",
  disableResponseStorage: process.env.AI_DISABLE_RESPONSE_STORAGE !== "false",
  enabled: process.env.AI_ENABLED !== "false",
};
const AI_JOB_TIMEOUT_MS = Number(process.env.AI_JOB_TIMEOUT_MS || 300000);
const AI_JOB_TIMEOUT_SWEEP_MS = Number(process.env.AI_JOB_TIMEOUT_SWEEP_MS || 60000);

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
function resolveAiConfigEncryptionKey(jwtSecret) {
  const key = String(process.env.AI_CONFIG_ENCRYPTION_KEY || "").trim();
  if (IS_PROD) {
    if (!key || key.length < 16) {
      console.error("FATAL: AI_CONFIG_ENCRYPTION_KEY must be set (>= 16 chars) in production and must be independent from JWT_SECRET.");
      process.exit(1);
    }
    if (key === jwtSecret) {
      console.error("FATAL: AI_CONFIG_ENCRYPTION_KEY must not equal JWT_SECRET in production.");
      process.exit(1);
    }
    return key;
  }
  if (!key) {
    console.warn("WARNING: AI_CONFIG_ENCRYPTION_KEY not set — falling back to JWT_SECRET for local development only.");
    return jwtSecret;
  }
  if (key === jwtSecret) {
    console.warn("WARNING: AI_CONFIG_ENCRYPTION_KEY equals JWT_SECRET — use a dedicated encryption key before production.");
  }
  return key;
}
const JWT_SECRET = resolveJwtSecret();
const secretCodec = createSecretCodec(resolveAiConfigEncryptionKey(JWT_SECRET));

const RELEASE_READY_REQUIREMENT_STATUSES = new Set(["accepted", "closed"]);
const CLOSED_TASK_STATUSES = new Set(["done", "cancelled"]);

// Allowed browser origins for the web app. Comma-separated via CORS_ORIGIN, or
// defaults to the Vite dev server.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// initDb is sync for sqlite and async for postgres — always await via Promise.resolve.
const _dbInitPromise = Promise.resolve(initDb());
const aiProviderStore = createAiProviderStore({
  defaults: DEFAULT_AI_PROVIDER,
  row,
  run,
  json,
  parse,
  now,
  secretCodec,
  normalizeWireApi: normalizeAiWireApi,
});
// Convert legacy plaintext API keys on startup before any configuration write
// can copy them forward. New writes always use apiKeyEncrypted.
// Fire-and-forget is intentional for module bootstrap; failures are logged.
aiProviderStore.migrateSecrets().catch((error) => {
  console.warn("AI provider secret migration failed:", error.message);
});
const projectAccess = createProjectAccess({ row });
const projectRepository = createProjectsRepository({ insert, row, rows, run });
const deliveryRepository = createDeliveryRepository({ insert, row, rows, run });
const projectActivationReadiness = (project) =>
  evaluateProjectActivationReadiness(project, projectRepository, parse);
const organizationRepository = createOrganizationRepository({ insert, row, rows, run });
const projectSourceBrowser = createProjectSourceBrowser({ fs, path });
const dashboardRepository = createDashboardRepository({ row, rows });
const aiJobsRepository = createAiJobRepository({ insert, row, rows, run });
const { reindexDocumentForRag, deleteDocumentRagIndex } = createRagMaintenance({
  buildDocumentChunks,
  aiJobsRepository,
  run,
  now,
});
const { requirementScore } = createRequirementScoreService({ row, rows, parse });
const nextId = createNextId({ rows });
const { isoDateOnly, weekKeyOf } = createDateHelpers({ now });
const businessAdviceRepository = createBusinessAdviceRepository({ row, rows });
const aiChatService = createAiChatService({
  extractTextFromUpload,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRelease,
  mapRequirement,
  mapTask,
  rows,
});
const aiModelClient = createAiModelClient({
  getConfig: aiProviderStore.resolveConfig,
  fetchImpl: fetch,
  normalizeAttachments: aiChatService.normalizeAttachments,
  dataUrlForAttachment,
  recordSuccess: aiProviderStore.recordSuccess,
  recordFailure: aiProviderStore.recordFailure,
  getTimeoutMs: () => Number(process.env.AI_TIMEOUT_MS || 30000),
});
const documentAnalysisService = createDocumentAnalysisService({
  callModel: callRealModel,
  getModelName: async () => (await aiProviderStore.resolveConfig()).model,
});
const documentAnalysisRunner = createDocumentAnalysisRunner({
  repository: aiJobsRepository,
  analyzeDocument: documentAnalysisService.analyze,
  json,
  now,
});
const aiJobDispatcher = createAiJobDispatcher({
  runJob: documentAnalysisRunner.run,
  onFailure: (error, context) => console.warn(`AI job ${context.jobId} failed:`, error.message),
});
let aiJobTimeoutTimer = null;
const authService = createAuthService({
  comparePassword: (password, passwordHash) => require("bcryptjs").compareSync(password, passwordHash),
  issueToken: (user) => require("jsonwebtoken").sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" }),
  publicUser,
  repository: createAuthRepository({ row, run }),
});
const aiProviderAdminService = createAiProviderAdminService({
  defaults: DEFAULT_AI_PROVIDER,
  normalizeEntry: aiProviderStore.normalizeEntry,
  now,
  providerConfigId: aiProviderStore.providerConfigId,
  publicConfig: aiProviderStore.publicConfig,
  readActive: aiProviderStore.resolveConfig,
  readList: aiProviderStore.readList,
  resetHealth: aiProviderStore.resetHealth,
  writeActive: aiProviderStore.writeActiveConfig,
  writeList: aiProviderStore.writeList,
});
const aiSummaryService = createAiSummaryService({
  callModel: callRealModel,
  extractJsonPayload,
  getModelName: async () => (await aiProviderStore.resolveConfig()).model,
  rows,
});

// Keep process-local AI summary cache coherent after mutating business data.
// Scope is process-wide clear (cheap) so dashboards/summary don't serve stale TTL.
async function audit(actor, action, resourceType, resourceId, beforeValue, afterValue, ip) {
  const result = await writeAuditLog(actor, action, resourceType, resourceId, beforeValue, afterValue, ip);
  try {
    if (typeof action === "string" && !action.startsWith("ai.") && !action.startsWith("auth.") && action !== "page.view") {
      aiSummaryService.clearCache();
    }
  } catch {
    // never fail writes because of cache maintenance
  }
  return result;
}
const dashboardService = createDashboardService({
  createAiSummary: aiSummaryService.createSummary,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRequirement,
  mapTask,
  projectAccess,
  repository: dashboardRepository,
  visibleDocumentsForUser,
});
const deliveryService = createDeliveryService({
  closedDefectStatuses: CLOSED_DEFECT_STATUSES,
  closedTaskStatuses: CLOSED_TASK_STATUSES,
  mapBuild,
  mapDefect,
  mapDeliveryAudit,
  mapRelease,
  mapReleaseApproval,
  mapRequirement,
  mapRollbackRecord,
  parse,
  releaseReadyRequirementStatuses: RELEASE_READY_REQUIREMENT_STATUSES,
  repository: deliveryRepository,
});
const {
  buildReleaseReport,
  evaluateBuildDeliveryGates,
  evaluateReleaseDeliveryGates,
  listDeliveryGateResults,
  loadLinkedDefects,
  loadRequirementReadiness,
  normalizeIdList,
  validateBuildStatusTransition,
  validateReleaseStatusTransition,
} = deliveryService;
const businessAdviceHelpers = createBusinessAdviceHelpers({
  closedDefectStatuses: CLOSED_DEFECT_STATUSES,
  closedTaskStatuses: CLOSED_TASK_STATUSES,
  compactText,
});
const businessAdviceContextService = createBusinessAdviceContextService({
  buildReleaseReport,
  compactText,
  evaluateBuildDeliveryGates,
  evaluateReleaseDeliveryGates,
  loadLinkedDefects,
  loadRequirementReadiness,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRelease,
  mapRequirement,
  mapTask,
  mapTestCase,
  mapTestRun,
  normalizeIdList,
  repository: businessAdviceRepository,
  requirementScore,
});
const aiAdviceService = createAiAdviceService({
  businessAdviceContextService,
  businessAdviceHelpers,
  callModel: callRealModel,
  compactText,
  extractJsonPayload,
  getModelName: async () => (await aiProviderStore.resolveConfig()).model,
  getProviderName: async () => (await aiProviderStore.resolveConfig()).provider,
  mapRequirement,
  row,
  rows,
});
const statusHistory = createStatusHistory({ insert, nextId, now, rows });
const sprintCommitment = createSprintCommitment({ insert, nextId, now, row, rows });
const workflowTemplateStore = createWorkflowTemplateStore({
  insert,
  row,
  run,
  now,
});
const projectFlowService = createProjectFlowService({
  row,
  rows,
  getProjectBinding: workflowTemplateStore.getProjectBinding,
  getTemplate: workflowTemplateStore.getTemplate,
});
const workLogHelpers = createWorkLogHelpers({ normalizeRole, parse, row, rows });
const workLogAnalysisService = createWorkLogAnalysisService({
  callModel: callRealModel,
  getModelName: async () => (await aiProviderStore.resolveConfig()).model,
  row,
  rows,
});
const teamService = createTeamService({
  mapDefect,
  mapProject,
  mapRequirement,
  mapTask,
  mapUser,
  normalizeRole,
  rows,
});

// Same-origin SPA hosting for single-process SQLite trial / internal production.
// Default: production + web/dist present, or SERVE_WEB=1. Disable with SERVE_WEB=0.
const SERVE_WEB = shouldServeWeb(process.env, { apiRoot: __dirname, isProd: IS_PROD });
const WEB_DIST = SERVE_WEB ? resolveWebDist(process.env, { apiRoot: __dirname }) : null;

// Security headers. When hosting the SPA, CSP must allow self scripts/styles/ws.
// API-only mode keeps a restrictive CSP (no script execution expected on JSON APIs).
// Plain-HTTP deploys must NOT send upgrade-insecure-requests or HSTS (lazy chunks break).
const ENABLE_HSTS = shouldEnableHsts(process.env);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: SERVE_WEB ? spaContentSecurityPolicyDirectives() : apiOnlyContentSecurityPolicyDirectives(),
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  strictTransportSecurity: ENABLE_HSTS
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
}));

// CORS: only allow the configured web origins to carry credentials/tokens.
// Same-origin SPA does not need CORS for browser XHR, but keep allowlist for split-origin trials.
app.use(cors({ origin: ALLOWED_ORIGINS, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));
// Ensure request/response JSON is interpreted as UTF-8 (Windows clients/tools may omit charset).
app.use(express.json({ limit: "32mb", type: ["application/json", "application/*+json"] }));
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    } else {
      const current = String(res.getHeader("Content-Type"));
      if (current.includes("application/json") && !/charset=/i.test(current)) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    }
    return originalJson(body);
  };
  next();
});

const { createMulterFileFilter, MAX_UPLOAD_BYTES } = require("./src/security/uploadPolicy");
const upload = multer({
  dest: STORAGE_DIR,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: createMulterFileFilter(),
});

function ok(data, meta = {}) {
  return { data, meta: { generatedAt: now(), ...meta } };
}

function fail(res, status, errorCode, message, details) {
  return res.status(status).json({
    errorCode,
    message,
    traceId: crypto.randomUUID(),
    ...(details === undefined ? {} : { details }),
  });
}

const { beginIdempotentRequest } = createIdempotency({ row, run, parse, now, fail });
const { expectedProjectVersion } = createProjectVersionGuard({ fail });

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

const { syncRequirementTask, mergeRequirementLinkedTask } = createRequirementTaskSync({
  row,
  run,
  insert,
  nextId,
  json,
  parse,
});
const { syncTestCaseTask } = createTestCaseTaskSync({ row, run, insert, nextId });
const { syncDefectTask } = createDefectTaskSync({
  row,
  run,
  insert,
  nextId,
  closedDefectStatuses: CLOSED_DEFECT_STATUSES,
});

function ensureRoleAllowed(targetRole, allowedRoles, fieldName = "role") {
  if (!targetRole || !allowedRoles.includes(targetRole)) {
    return `${fieldName} must be one of: ${allowedRoles.join(", ")}`;
  }
  return null;
}

async function canOperateRequirement(user, requirementRow) {
  if (!user || !requirementRow) return false;
  if (!(await projectAccess.canWriteProject(user, requirementRow.project_id))) return false;
  if (hasPermission(user, "requirement:*")) return true;
  const role = normalizeRole(user.role);
  if (!["dev", "qa"].includes(role)) return false;
  return requirementRow.assignee === user.name && requirementRow.assignee_role === role;
}

function canViewDocument(user, documentRow) {
  return canViewDocumentByPolicy(user, documentRow, { canAccessProject: projectAccess.canAccessProject, mapDocument });
}

function canManageDocumentCollaboration(user, documentRow) {
  return canManageDocument(user, documentRow, { canWriteProject: projectAccess.canWriteProject });
}

// Global API rate limit (per IP). Windows reset on first request.
function isTrustedSessionRequest(req) {
  // Dev-only rate-limit skip: require an explicit opt-in so automated clients with
  // Mozilla UAs cannot accidentally bypass limits.
  if (IS_PROD) return false;
  if (process.env.RATE_LIMIT_TRUST_LOCAL !== "1") return false;
  const authHeader = req.headers.authorization || "";
  const hasBearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedProto = req.headers["x-forwarded-proto"];
  const localRequest =
    req.ip === "::1" ||
    req.ip === "127.0.0.1" ||
    req.ip === "::ffff:127.0.0.1" ||
    req.hostname === "localhost" ||
    req.hostname === "127.0.0.1";

  return localRequest && hasBearerToken && !forwardedFor && !forwardedProto;
}

function rateLimitHandler(message) {
  return (_req, res, _next, options) => res.status(options.statusCode).json({
    errorCode: "RATE_LIMITED",
    message,
    traceId: crypto.randomUUID(),
  });
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 600 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !IS_PROD && isTrustedSessionRequest(req),
  handler: rateLimitHandler("请求过于频繁，请稍后再试。"),
});
app.use("/api/", apiLimiter);

// Stricter limit for auth (brute-force protection).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("登录尝试次数过多，请稍后再试。"),
});

const {
  authenticate,
  authenticateSocket,
  requireAnyPermission,
  requirePermission,
} = createAuthMiddleware({ jwtSecret: JWT_SECRET, fail, row });

app.use(authenticate);

app.use("/api", createMetaRouter({
  ok,
  publicEnums,
}));

function extractJsonPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
    }
  }
  return null;
}

function callRealModel(prompt, options = {}) {
  return aiModelClient.callModel(prompt, options);
}

app.get("/api/health", async (req, res) => {
  const readiness = await checkReadiness({
    row,
    dialect,
    sqliteConnection: dialect === "sqlite" ? sqliteConnection : null,
    migrationsDir: path.join(__dirname, "migrations"),
  });
  const payload = {
    status: readiness.ok ? "ok" : "fail",
    service: "company-project-management-api",
    database: dialect || "sqlite",
    uptime: Math.round(process.uptime()),
    serveWeb: SERVE_WEB,
    checks: readiness.checks,
  };
  // liveness-style clients that only look at HTTP status get 503 when not ready
  if (!readiness.ok) return res.status(503).json(ok(payload));
  return res.json(ok(payload));
});

app.use("/api", createAuthRouter({
  audit,
  authLimiter,
  buildCapabilities,
  fail,
  ok,
  publicUser,
  service: authService,
}));
app.use("/api", createAuditRouter({
  audit,
  fail,
  ok,
  paginatedResponse,
  parse,
  repository: createAuditRepository({ rows }),
  requirePermission,
}));

app.use("/api", createDashboardRouter({ fail, ok, service: dashboardService }));

app.use("/api", createProjectsRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  canTransition,
  expectedProjectVersion,
  fail,
  json,
  mapProject,
  mapSprint,
  mapTask,
  nextId,
  normalizeRole,
  now,
  ok,
  paginatedResponse,
  parse,
  projectActivationReadiness,
  projectStatuses: PROJECT_STATUSES,
  repository: projectRepository,
  requirePermission,
  sourceBrowser: projectSourceBrowser,
  statusHistory,
  transaction,
}));

app.use("/api", createWorkflowRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  evaluateProjectFlow: projectFlowService.evaluateProjectFlow,
  fail,
  ok,
  repository: projectRepository,
  requirePermission,
  templateStore: workflowTemplateStore,
  workflowTemplates: publicWorkflowTemplates,
}));

app.use("/api", createStrategyRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  fail,
  hasPermission,
  insert,
  json,
  mapProduct,
  mapProject,
  mapRequirement,
  nextId,
  now,
  ok,
  parse,
  requireAnyPermission,
  requirePermission,
  row,
  rows,
  run,
  transaction,
}));

app.use("/api", createProductsRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  fail,
  hasPermission,
  insert,
  json,
  mapProduct,
  mapProject,
  mapRequirement,
  nextId,
  now,
  ok,
  parse,
  requireAnyPermission,
  requirePermission,
  row,
  rows,
  run,
}));

app.use("/api", createRequirementsRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  canOperateRequirement,
  fail,
  json,
  mapRequirement,
  mergeRequirementLinkedTask,
  nextId,
  now,
  ok,
  paginatedResponse,
  releaseReadyRequirementStatuses: RELEASE_READY_REQUIREMENT_STATUSES,
  requirementPriorities: REQUIREMENT_PRIORITIES,
  requirementScore,
  requirementStatuses: REQUIREMENT_STATUSES,
  requirePermission,
  repository: createRequirementsRepository({ insert, row, rows, run }),
  statusHistory,
  syncRequirementTask,
  transaction,
}));
app.use("/api", createTasksRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  canWriteProject: projectAccess.canWriteProject,
  buildSprintBurndown,
  closedTaskStatuses: CLOSED_TASK_STATUSES,
  fail,
  json,
  mapSprint,
  mapTask,
  nextId,
  now,
  ok,
  paginatedResponse,
  parse,
  recordBurndownSnapshot,
  requirePermission,
  requireAnyPermission,
  repository: createTasksRepository({ insert, row, rows, run }),
  sprintCommitment,
  statusHistory,
  sprintStatuses: SPRINT_STATUSES,
  taskStatuses: TASK_STATUSES,
  taskTypes: TASK_TYPES,
  transaction,
  weekKeyOf,
}));

app.use("/api", createDeliveryRouter({
  audit,
  beginIdempotentRequest,
  buildReleaseReport,
  buildStatuses: BUILD_STATUSES,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  fail,
  isOrganizationProjectManager: projectAccess.isOrganizationProjectManager,
  json,
  listDeliveryGateResults,
  mapBuild,
  mapRelease,
  mapReleaseApproval,
  mapRollbackRecord,
  nextId,
  now,
  ok,
  parse,
  releaseStatuses: RELEASE_STATUSES,
  releaseTypes: RELEASE_TYPES,
  requireAnyPermission,
  requirePermission,
  repository: deliveryRepository,
  transaction,
  validateBuildStatusTransition,
  validateReleaseStatusTransition,
}));

app.use("/api", createTestingRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  ensureRoleAllowed,
  fail,
  insert,
  mapTestCase,
  mapTestRun,
  nextId,
  now,
  ok,
  paginatedResponse,
  requireAnyPermission,
  row,
  rows,
  run,
  syncTestCaseTask,
  testCaseStatuses: TEST_CASE_STATUSES,
}));

app.use("/api", createDocumentsRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  deleteDocumentRagIndex,
  documentCategories: DOCUMENT_CATEGORIES,
  extractTextFromUpload,
  fail,
  insert,
  json,
  mapDocument,
  nextId,
  now,
  ok,
  paginatedResponse,
  reindexDocument: reindexDocumentForRag,
  requirePermission,
  row,
  rows,
  run,
  storageDir: STORAGE_DIR,
  upload,
}));
app.use("/api", createAiJobsRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canViewDocument,
  canWriteProject: projectAccess.canWriteProject,
  dispatcher: aiJobDispatcher,
  fail,
  json,
  mapDocument,
  nextId,
  now,
  ok,
  parse,
  repository: aiJobsRepository,
  requirementPriorities: REQUIREMENT_PRIORITIES,
  requirePermission,
  transaction,
}));

const { ensureAiTargetAccess } = createAiTargetAccess({
  row,
  fail,
  canViewDocument,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  isOrganizationProjectManager: projectAccess.isOrganizationProjectManager,
});

app.use("/api", createWorkLogsRouter({
  analyzeWorkLog: workLogAnalysisService.analyze,
  audit,
  beginIdempotentRequest,
  buildTeamWeeklySummary: workLogHelpers.buildTeamWeeklySummary,
  buildWeeklySummary: workLogHelpers.buildWeeklySummary,
  canSubmitDailyLog: workLogHelpers.canSubmitDailyLog,
  canViewTeamLogs: workLogHelpers.canViewTeamLogs,
  canWriteProject: projectAccess.canWriteProject,
  collectProjectMembers: workLogHelpers.collectProjectMembers,
  extractTextFromUpload,
  fail,
  isoDateOnly,
  json,
  nextId,
  now,
  ok,
  paginatedResponse,
  parse,
  repository: createWorkLogsRepository({ insert, row, rows }),
  requirePermission,
  resolveWorkLogProjectFilter: workLogHelpers.resolveWorkLogProjectFilter,
  transaction,
  weekKeyOf,
  workLogMatchesProject: workLogHelpers.workLogMatchesProject,
}));
app.use("/api", createTimeEntriesRouter({
  audit,
  beginIdempotentRequest,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  fail,
  insert,
  nextId,
  now,
  ok,
  paginatedResponse,
  repository: createTimeEntriesRepository({ insert, row, rows, run }),
  transaction,
}));
app.use("/api", createDefectsRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  defectSeverities: DEFECT_SEVERITIES,
  defectStatuses: DEFECT_STATUSES,
  fail,
  mapDefect,
  nextId,
  ok,
  paginatedResponse,
  requireAnyPermission,
  repository: createDefectsRepository({ insert, row, rows, run }),
  syncDefectTask,
}));
app.use("/api", createGovernanceRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  fail,
  nextId,
  now,
  ok,
  repository: createGovernanceRepository({ insert, row, rows, run }),
}));

app.use("/api", createOrganizationRouter({
  audit,
  fail,
  nextId,
  now,
  ok,
  repository: organizationRepository,
  requirePermission,
  transaction,
}));

app.use("/api", createTeamRouter({
  audit,
  buildTeamMembers: teamService.buildTeamMembers,
  canViewTeamLogs: workLogHelpers.canViewTeamLogs,
  defaultPermissionsForRole,
  fail,
  insert,
  isSystemRole,
  json,
  mapUser,
  nextId,
  now,
  ok,
  paginatedResponse,
  requirePermission,
  row,
  rows,
  run,
  systemRoles: SYSTEM_ROLES,
  organizationRepository,
}));

app.use("/api", createCapacityRouter({
  audit,
  canManageProject: projectAccess.canManageProject,
  canViewCapacity: workLogHelpers.canViewTeamLogs,
  fail,
  nextId,
  now,
  ok,
  repository: createCapacityRepository({ insert, row, rows, run }),
  requirePermission,
}));

app.use("/api", createAiProviderAdminRouter({
  audit,
  callRealModel,
  fail,
  ok,
  publicConfig: aiProviderStore.publicConfig,
  requirePermission,
  service: aiProviderAdminService,
}));

app.use("/api", createAiInteractionsRouter({
  audit,
  buildAiChatPrompt: aiChatService.buildPrompt,
  buildAiChatContext: aiChatService.buildContext,
  callRealModel,
  createAiRequirementRecommendation: aiAdviceService.createRequirementRecommendation,
  createAiSummary: aiSummaryService.createSummary,
  createBusinessAdvice: aiAdviceService.createBusinessAdvice,
  ensureAiTargetAccess,
  fail,
  localAiChatReply: aiChatService.localReplyV2,
  normalizeAttachments: aiChatService.normalizeAttachments,
  normalizeMessages: normalizeAiChatMessages,
  now,
  ok,
  publicAiProviderConfig: aiProviderStore.publicConfig,
  requirementScore,
  requirePermission,
  resolveAiProviderConfig: aiProviderStore.resolveConfig,
  row,
  rows,
}));

// Windows child_process.kill('SIGTERM') terminates without running handlers.
// Non-production opt-in lets ops drills invoke the same shutdown() path over HTTP.
// Registered before the 404 catch-all; handler body references shutdown() defined later.
if (!IS_PROD && String(process.env.ENABLE_HTTP_SHUTDOWN || "") === "1") {
  app.post("/api/ops/shutdown", (req, res) => {
    const expected = String(process.env.HTTP_SHUTDOWN_TOKEN || process.env.JWT_SECRET || "").trim();
    const provided = String(req.get("x-shutdown-token") || req.body?.token || "").trim();
    if (!expected || provided !== expected) {
      return fail(res, 403, "PERMISSION_DENIED", "Invalid shutdown token.");
    }
    res.status(202).json(ok({ shuttingDown: true, via: "http" }));
    setImmediate(() => {
      void shutdown("HTTP_SHUTDOWN");
    });
  });
}

// Host built SPA after API routes so /api and /ws stay authoritative.
if (SERVE_WEB) {
  try {
    mountStaticWeb(app, WEB_DIST, { isProd: IS_PROD });
    console.log(`[web] serving static SPA from ${WEB_DIST}`);
  } catch (error) {
    console.error("FATAL: SERVE_WEB enabled but web dist is not usable:", error && error.message ? error.message : error);
    process.exit(1);
  }
}

app.use((err, req, res, _next) => {
  if (err && (err.code === "LIMIT_FILE_SIZE" || err.code === "UPLOAD_TOO_LARGE" || err.code === "UPLOAD_TYPE_NOT_ALLOWED" || err.status === 400)) {
    const errorCode = err.code === "LIMIT_FILE_SIZE" ? "UPLOAD_TOO_LARGE" : (err.code || "VALIDATION_FAILED");
    const message = err.code === "LIMIT_FILE_SIZE"
      ? `File exceeds the ${MAX_UPLOAD_BYTES} byte limit.`
      : (err.message || "Upload rejected.");
    return fail(res, 400, errorCode, message);
  }
  console.error(err);
  // Never leak internal error details to the client in production.
  const message = IS_PROD ? "服务器内部错误，请稍后再试。" : err.message || "Unexpected server error.";
  res.status(500).json({ errorCode: "INTERNAL_SERVER_ERROR", message, traceId: crypto.randomUUID() });
});
app.use((req, res) => fail(res, 404, "RESOURCE_NOT_FOUND", "请求的资源不存在。"));

const { wss } = createDocumentCollaborationServer({
  WebSocketServer,
  server,
  authenticateSocket,
  hasPermission,
  canManageDocument: canManageDocumentCollaboration,
  row,
  run,
  now,
  audit,
  publicUser,
  reindexDocument: reindexDocumentForRag,
});

const { recoverPendingAiJobs } = createAiJobRecovery({
  aiJobsRepository,
  aiJobDispatcher,
  failTimedOutAiJobs,
  audit,
  now,
  timeoutMs: AI_JOB_TIMEOUT_MS,
  rows,
  row,
  mapDocument,
});

function startServer(port) {
  const onError = (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`FATAL: Port ${port} is already in use. Stop the other process or set PORT to a free port.`);
      process.exit(1);
    }
    throw err;
  };
  server.on("error", onError);
  wss.on("error", onError);
  server.listen(port, () => {
    recoverPendingAiJobs();
    if (!aiJobTimeoutTimer) {
      aiJobTimeoutTimer = startAiJobTimeoutMonitor({
        repository: aiJobsRepository,
        audit,
        now,
        timeoutMs: AI_JOB_TIMEOUT_MS,
        sweepMs: AI_JOB_TIMEOUT_SWEEP_MS,
        actor: { id: "system", name: "AI Worker Monitor" },
      });
    }
    console.log(`Company project management API listening on http://localhost:${port}`);
    if (SERVE_WEB) {
      console.log(`Same-origin web UI: http://localhost:${port}/ (HashRouter SPA)`);
    }
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  if (aiJobTimeoutTimer) {
    clearInterval(aiJobTimeoutTimer);
    aiJobTimeoutTimer = null;
  }

  try {
    for (const client of wss.clients || []) {
      try {
        client.close(1001, "Server shutting down");
      } catch {
        /* ignore */
      }
    }
    await new Promise((resolve) => {
      try {
        wss.close(() => resolve());
      } catch {
        resolve();
      }
    });
  } catch (error) {
    console.warn("WebSocket shutdown warning:", error && error.message ? error.message : error);
  }

  await new Promise((resolve) => {
    server.close(() => resolve());
    // Force-complete if keep-alive sockets hang.
    setTimeout(resolve, 8_000).unref?.();
  });

  try {
    await closeDatabase();
  } catch (error) {
    console.error("Database close failed:", error && error.message ? error.message : error);
  }

  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

// Wait for dialect-specific init (sync sqlite / async postgres ping+schema check),
// then verify migration ledger matches on-disk migration files (sqlite).
_dbInitPromise
  .then(() => {
    if (dialect === "sqlite" && sqliteConnection) {
      const migrationsDir = path.join(__dirname, "migrations");
      const migrationReport = preflightMigrationStatus(sqliteConnection, migrationsDir);
      if (!migrationReport.ok) {
        console.error(
          "FATAL: schema migration status preflight failed:",
          JSON.stringify({
            missingApplied: migrationReport.missingApplied,
            checksumMismatches: migrationReport.checksumMismatches,
            diskCount: migrationReport.diskCount,
            appliedCount: migrationReport.appliedCount,
            error: migrationReport.error || null,
          }),
        );
        process.exit(1);
      }
      if (migrationReport.extraApplied.length) {
        console.warn(
          `[env] MIGRATION_EXTRA_APPLIED: applied rows not on disk: ${migrationReport.extraApplied.join(", ")}`,
        );
      }
    }
    startServer(PORT);
  })
  .catch((error) => {
    console.error("FATAL: database initialization failed:", error && error.message ? error.message : error);
    process.exit(1);
  });

