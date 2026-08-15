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

// Load api/.env if present (deployment config per DELIVERY.md).
// Existing environment variables always take precedence; dotenv never overrides them.
try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (error) {
  // Missing dotenv should not crash startup; env vars can be injected directly.
  console.warn("[env] .env load skipped:", error && error.message ? error.message : error);
}

const {
  audit: writeAuditLog,
  initDb,
  closeDatabase,
  db: sqliteConnection,
  insert,
  upsert,
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
  sanitizeAuditValue,
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
const { createRateLimitPolicy } = require("./src/middleware/rateLimitPolicy");
const { createProjectAccess } = require("./src/security/projectAccess");
const { createAccessScopeResolver } = require("./src/security/accessScope");
const { createSecretCodec } = require("./src/security/secretCodec");
const {
  createDefaultAiProvider,
  resolveAiCapabilityTokenSecret,
  resolveAiConfigEncryptionKey,
  resolveAllowedOrigins,
  resolveJwtSecret,
} = require("./src/bootstrap/runtimeConfig");
const { wrapRouterAsync } = require("./src/lib/asyncHandler");
const { createHttpErrorHandler } = require("./src/http/errorHandler");
const { createResponseHelpers } = require("./src/http/responses");
const { createAuditRouter } = require("./src/modules/audit/routes");
const { createAuditRepository } = require("./src/modules/audit/repository");
const { createAuthRouter } = require("./src/modules/auth/routes");
const { createAuthRepository } = require("./src/modules/auth/repository");
const { createAuthService } = require("./src/modules/auth/service");
const { createCapacityRouter } = require("./src/modules/capacity/routes");
const { createCapacityRepository } = require("./src/modules/capacity/repository");
const { createAiJobsRouter } = require("./src/modules/ai/routes");
const { createAiJobRepository, createBusinessAdviceRepository } = require("./src/modules/ai/repository");
const { createAiCapabilityRepository } = require("./src/modules/ai/capabilityRepository");
const { createTokenUsageRepository } = require("./src/modules/ai/tokenUsage");
const { createAiCapabilitiesRouter } = require("./src/modules/ai/capabilityRoutes");
const { createAiCapabilityService } = require("./src/modules/ai/capabilityService");
const { createAgentEventBus } = require("./src/modules/ai/agentEventBus");
const { createAgentEventBridge } = require("./src/modules/ai/agentEventBridge");
const { createAiCapabilityControlStore } = require("./src/modules/ai/capabilityControls");
const { createCapabilityRegistry } = require("./src/modules/ai/capabilityRegistry");
const { createExecutionGateway } = require("./src/modules/ai/executionGateway");
const { createBrowserControlService } = require("./src/modules/ai/browserControl");
const { createScopedExecutionTokenService } = require("./src/modules/ai/executionToken");
const { resolveHarnessPaths } = require("./src/modules/ai/harnessRuntime");
const { createAiSessionReplayService } = require("./src/modules/ai/sessionReplay");
const { createAiSessionReplayRouter } = require("./src/modules/ai/sessionReplayRoutes");
const { createAgentInteractionService } = require("./src/modules/ai/agentInteractionsService");
const { createAgentInteractionsRouter } = require("./src/modules/ai/agentInteractionsRoutes");
const { createHarnessCapabilityAdapter } = require("./src/modules/ai/capabilityAdapter");
const { createAiModelComposition } = require("./src/modules/ai/modelComposition");
const { createDocumentAnalysisService } = require("./src/modules/ai/documentAnalysis");
const { createAiModelClient, normalizeAiWireApi } = require("./src/modules/ai/modelClient");
const { createAiJobDispatcher } = require("./src/modules/ai/jobDispatcher");
const { createDocumentAnalysisRunner } = require("./src/modules/ai/jobRunner");
const { failTimedOutAiJobs, startAiJobTimeoutMonitor } = require("./src/modules/ai/timeoutMonitor");
const {
  createAiReminderRepository,
  createDynamicCenterReminderDelivery,
  createReminderScheduler,
} = require("./src/modules/ai/reminderScheduler");
const { buildDocumentChunks } = require("./src/modules/ai/ragIndex");
const { createAiInteractionsRouter } = require("./src/modules/ai/interactionsRoutes");
const { createBusinessAdviceContextService, createBusinessAdviceHelpers } = require("./src/modules/ai/interactionsService");
const { createAiChatService, normalizeAiChatMessages } = require("./src/modules/ai/chatService");
const { compactText, createAiSummaryService } = require("./src/modules/ai/summaryService");
const { createSummaryInvalidatingAudit } = require("./src/modules/ai/auditCache");
const { createAiAdviceService } = require("./src/modules/ai/adviceService");
const { createAiAssistantAdminRouter } = require("./src/modules/ai/assistantAdminRoutes");
const { createAiAssistantAdminService } = require("./src/modules/ai/assistantAdminService");
const { createAiAssistantStore } = require("./src/modules/ai/assistantStore");
const { createAiProviderAdminRouter } = require("./src/modules/ai/providerAdminRoutes");
const { createAiProviderAdminService } = require("./src/modules/ai/providerAdminService");
const { createAiProviderStore } = require("./src/modules/ai/providerStore");
const { createAiMaskingRouter } = require("./src/modules/ai/maskingRoutes");
const { createAiMaskingRuleRepository, createMaskingRulesService } = require("./src/modules/ai/maskingRules");
const { assertAiProviderUrlAllowed } = require("./src/modules/ai/outboundUrlPolicy");
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
const { createDocumentsRepository } = require("./src/modules/documents/repository");
const { createDocumentAccessPolicy } = require("./src/modules/documents/policy");
const { createDocumentCollaborationServer } = require("./src/modules/documents/collaboration");
const { extractTextFromUpload } = require("./src/modules/documents/textExtraction");
const { createProductsRouter } = require("./src/modules/products/routes");
const { createProductsRepository } = require("./src/modules/products/repository");
const { createProductImageUpload } = require("./src/modules/products/upload");
const { createStrategyRouter } = require("./src/modules/strategy/routes");
const { createStrategyRepository } = require("./src/modules/strategy/repository");
const { createProjectsRouter } = require("./src/modules/projects/routes");
const { createProjectsRepository } = require("./src/modules/projects/repository");
const { projectActivationReadiness: evaluateProjectActivationReadiness } = require("./src/modules/projects/service");
const { createOrganizationRouter } = require("./src/modules/organization/routes");
const { createOrganizationRepository } = require("./src/modules/organization/repository");
const { createProjectSourceBrowser } = require("./src/modules/projects/sourceBrowser");
const { createRequirementsRouter } = require("./src/modules/requirements/routes");
const { createRequirementsRepository } = require("./src/modules/requirements/repository");
const { createRequirementPolicy } = require("./src/modules/requirements/policy");
const { createRequirementScoreService } = require("./src/modules/requirements/scoreService");
const { createRequirementTaskSync } = require("./src/modules/requirements/taskSync");
const { createTasksRouter } = require("./src/modules/tasks/routes");
const { createTasksRepository } = require("./src/modules/tasks/repository");
const { createTestingRouter } = require("./src/modules/testing/routes");
const { createTestingRepository } = require("./src/modules/testing/repository");
const { createTestCaseTaskSync } = require("./src/modules/testing/taskSync");
const { createDefectTaskSync } = require("./src/modules/defects/taskSync");
const { createAiTargetAccess } = require("./src/modules/ai/targetAccess");
const { createRagMaintenance } = require("./src/modules/ai/ragMaintenance");
const { createAiJobRecovery } = require("./src/modules/ai/jobRecovery");
const { createNextId } = require("./src/lib/nextId");
const { createDateHelpers } = require("./src/lib/dates");
const { extractJsonPayload } = require("./src/lib/jsonPayload");
const { createIdempotency } = require("./src/lib/idempotency");
const { createProjectVersionGuard } = require("./src/lib/projectVersion");
const { isUniqueConstraintError } = require("./src/lib/databaseErrors");
const { createTeamRouter } = require("./src/modules/team/routes");
const { createTeamRepository } = require("./src/modules/team/repository");
const { createTeamService } = require("./src/modules/team/service");
const { createTimeEntriesRouter } = require("./src/modules/timeEntries/routes");
const { createTimeEntriesRepository } = require("./src/modules/timeEntries/repository");
const { createWorkLogsRouter } = require("./src/modules/workLogs/routes");
const { createWorkLogsRepository } = require("./src/modules/workLogs/repository");
const { createWorkLogHelpers } = require("./src/modules/workLogs/service");
const { createWorkLogAnalysisService } = require("./src/modules/workLogs/analysisService");
const { createWorkflowRouter } = require("./src/modules/workflow/routes");
const { createWorkflowRepository } = require("./src/modules/workflow/repository");
const { createProjectFlowService } = require("./src/modules/workflow/service");
const { createMetaRouter } = require("./src/modules/meta/routes");
const { canTransition } = require("./src/workflow/stateMachine");
const { createStatusHistory } = require("./src/workflow/statusHistory");
const { createSprintCommitment } = require("./src/workflow/sprintCommitment");
const { publicWorkflowTemplates } = require("./src/workflow/templates");
const { createWorkflowTemplateStore } = require("./src/workflow/templateStore");
const { createServerLifecycle } = require("./src/ops/serverLifecycle");
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
const { isTrustedSessionRequest, rateLimitHandler } = createRateLimitPolicy({
  env: process.env,
  isProd: IS_PROD,
  randomUUID: crypto.randomUUID,
});

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

const DEFAULT_AI_PROVIDER = createDefaultAiProvider(process.env);
const AI_JOB_TIMEOUT_MS = Number(process.env.AI_JOB_TIMEOUT_MS || 300000);
const AI_JOB_TIMEOUT_SWEEP_MS = Number(process.env.AI_JOB_TIMEOUT_SWEEP_MS || 60000);

// JWT secret: never fall back to a hardcoded value in production.
const JWT_SECRET = resolveJwtSecret({ env: process.env, isProd: IS_PROD });
const secretCodec = createSecretCodec(resolveAiConfigEncryptionKey(JWT_SECRET, { env: process.env, isProd: IS_PROD }));
const AI_CAPABILITY_TOKEN_SECRET = resolveAiCapabilityTokenSecret(JWT_SECRET, { env: process.env });

const RELEASE_READY_REQUIREMENT_STATUSES = new Set(["accepted", "closed"]);
const CLOSED_TASK_STATUSES = new Set(["done", "cancelled"]);

// Allowed browser origins for the web app. Comma-separated via CORS_ORIGIN, or
// defaults to the Vite dev server.
const ALLOWED_ORIGINS = resolveAllowedOrigins(process.env);

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
const aiAssistantStore = createAiAssistantStore({
  json,
  now,
  parse,
  readProviderList: aiProviderStore.readList,
  resolveActiveProvider: aiProviderStore.resolveConfig,
  row,
  run,
});
const aiCapabilityRegistry = createCapabilityRegistry();
const aiCapabilityControlStore = createAiCapabilityControlStore({
  json,
  now,
  parse,
  registry: aiCapabilityRegistry,
  row,
  run,
});
const aiCapabilityRepository = createAiCapabilityRepository({ insert, row, rows, run });
const aiTokenUsageRepository = createTokenUsageRepository({ insert, rows });
const aiExecutionTokenService = createScopedExecutionTokenService({ secret: AI_CAPABILITY_TOKEN_SECRET });
// Convert legacy plaintext API keys on startup before any configuration write
// can copy them forward. New writes always use apiKeyEncrypted.
// Fire-and-forget is intentional for module bootstrap; failures are logged.
aiProviderStore.migrateSecrets().catch((error) => {
  console.warn("AI provider secret migration failed:", error.message);
});
const projectAccess = createProjectAccess({ row });
const {
  canManageDocument: canManageDocumentCollaboration,
  canViewDocument,
} = createDocumentAccessPolicy({
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  mapDocument,
});
// The execution gateway is assembled after nextId and the audit facade exist:
// domain capability dispatch writes through insert/nextId and audits every
// write plus every rejection. (See createExecutionGateway further below.)
const { resolveAccessScope } = createAccessScopeResolver({
  rows,
  canAccessProject: projectAccess.canAccessProject,
});
const projectRepository = createProjectsRepository({ insert, row, rows, run });
const documentsRepository = createDocumentsRepository({ insert, row, rows, run });
const productsRepository = createProductsRepository({ insert, json, parse, row, rows, run });
const strategyRepository = createStrategyRepository({ insert, row, rows, run });
const teamRepository = createTeamRepository({ insert, row, rows, run });
const testingRepository = createTestingRepository({ insert, row, rows, run });
const workflowRepository = createWorkflowRepository({ row, rows });
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
  normalizeAttachments: aiChatService.normalizeAttachments,
  recordSuccess: aiProviderStore.recordSuccess,
  recordFailure: aiProviderStore.recordFailure,
  getTimeoutMs: () => Number(process.env.AI_TIMEOUT_MS || 30000),
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
  validateBaseUrl: assertAiProviderUrlAllowed,
  writeActive: aiProviderStore.writeActiveConfig,
  writeList: aiProviderStore.writeList,
});
const aiAssistantAdminService = createAiAssistantAdminService({
  assistantStore: aiAssistantStore,
  readProviderList: aiProviderStore.readList,
});
// Masking rules share one process-wide cache with the harness proxy default
// engine, so admin writes here invalidate the proxy snapshot immediately.
const aiMaskingRulesService = createMaskingRulesService({
  nextId,
  now,
  repository: createAiMaskingRuleRepository({ insert, row, rows, run }),
});
const { callChatAssistantModel, callRealModel } = createAiModelComposition({
  aiAssistantAdminService,
  aiModelClient,
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
const authService = createAuthService({
  comparePassword: (password, passwordHash) => require("bcryptjs").compareSync(password, passwordHash),
  issueToken: (user) => require("jsonwebtoken").sign({
    sub: user.id,
    role: user.role,
    tv: Number(user.token_version || 0),
  }, JWT_SECRET, { expiresIn: "8h" }),
  publicUser,
  repository: createAuthRepository({ row, run }),
});
const aiSummaryService = createAiSummaryService({
  callModel: callRealModel,
  extractJsonPayload,
  getModelName: async () => (await aiProviderStore.resolveConfig()).model,
  rows,
});

const { audit } = createSummaryInvalidatingAudit({
  writeAuditLog,
  clearSummaryCache: aiSummaryService.clearCache,
});
const dashboardService = createDashboardService({
  createAiSummary: aiSummaryService.createSummary,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRequirement,
  mapTask,
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
const sprintCommitment = createSprintCommitment({ insert, nextId, now, row, rows, upsert });
const workflowTemplateStore = createWorkflowTemplateStore({
  row,
  now,
  upsert,
});
const projectFlowService = createProjectFlowService({
  repository: workflowRepository,
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
  repository: teamRepository,
});
let revokeUserSessions = () => 0;

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

// Reject abusive API request rates before allocating memory to parse request bodies.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isInteger(Number(process.env.API_RATE_LIMIT_MAX)) && Number(process.env.API_RATE_LIMIT_MAX) > 0
    ? Number(process.env.API_RATE_LIMIT_MAX)
    : IS_PROD ? 600 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !IS_PROD && isTrustedSessionRequest(req),
  handler: rateLimitHandler("请求过于频繁，请稍后再试。"),
});
app.use("/api/", apiLimiter);

// Ensure request/response JSON is interpreted as UTF-8 (Windows clients/tools may omit charset).
app.use(express.json({ limit: "32mb", type: ["application/json", "application/*+json"] }));

const { createDocumentUpload, MAX_UPLOAD_BYTES } = require("./src/security/uploadPolicy");
const upload = createDocumentUpload({ multer, storageDir: STORAGE_DIR });
const productImageUpload = createProductImageUpload({ multer, storageDir: STORAGE_DIR });

const { fail, ok, paginatedResponse } = createResponseHelpers({ now, randomUUID: crypto.randomUUID });

const { beginIdempotentRequest } = createIdempotency({ row, run, parse, now, fail });
const { expectedProjectVersion } = createProjectVersionGuard({ fail });

const { syncRequirementTask, mergeRequirementLinkedTask } = createRequirementTaskSync({
  row,
  run,
  insert,
  nextId,
  json,
  parse,
});
const { syncTestCaseTask } = createTestCaseTaskSync({ nextId, repository: testingRepository });
const { syncDefectTask } = createDefectTaskSync({
  row,
  run,
  insert,
  nextId,
  closedDefectStatuses: CLOSED_DEFECT_STATUSES,
});

const { canOperateRequirement } = createRequirementPolicy({
  canWriteProject: projectAccess.canWriteProject,
  hasPermission,
  normalizeRole,
});

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

app.use("/api", wrapRouterAsync(createMetaRouter({
  ok,
  publicEnums,
})));

// Sprint 5.1 ask-user/user-approval bridge: the dsh child asks the platform
// user through the execution gateway's loopback server (created before the
// gateway so its handler can be delegated there); platform users answer over
// the agent interactions REST routes and the /ws/agent push.
const aiAgentInteractionService = createAgentInteractionService({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  findInvocation: aiCapabilityRepository.find,
  hasPermission,
  insert,
  json,
  now,
  publicUser,
  row,
  rows,
  run,
  tokenService: aiExecutionTokenService,
  notifyInteraction: (userId, invocationId, interaction) =>
    agentEventBridge.pushInteraction(userId, invocationId, interaction),
});
aiAgentInteractionService.start();

// Browser control service for the dsh agent (headless Playwright over system
// Chrome). Screenshots land in storage/browser/<invocationId>.png and are
// served through the project-scoped artifact route on the capabilities router.
const aiBrowserControl = createBrowserControlService({
  storageDir: STORAGE_DIR,
  masking: aiMaskingRulesService,
});

const aiExecutionGateway = createExecutionGateway({
  audit,
  browserControl: aiBrowserControl,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  controlStore: aiCapabilityControlStore,
  hasPermission,
  insert,
  interactionHandler: aiAgentInteractionService.loopbackHandler,
  json,
  nextId,
  now,
  publicUser,
  registry: aiCapabilityRegistry,
  row,
  rows,
  tokenService: aiExecutionTokenService,
  transaction,
  // ui-control directive fan-out: the same user-addressed push the REST
  // test-fire route uses. Late-bound — the bridge attaches to the shared HTTP
  // server further below, before any request reaches this gateway.
  uiDirectiveSink: (userId, directive) => agentEventBridge.pushUiDirective(userId, directive),
});
const aiCapabilityAdapter = createHarnessCapabilityAdapter({
  callModel: callChatAssistantModel,
  executionGateway: aiExecutionGateway,
  now,
});
// In-process fan-out of live dsh session events; injected into both the
// capability service (publisher) and the /ws/agent bridge (subscriber).
const agentEventBus = createAgentEventBus();
const aiCapabilityService = createAiCapabilityService({
  adapter: aiCapabilityAdapter,
  agentEventBus,
  audit,
  canAccessProject: projectAccess.canAccessProject,
  controlStore: aiCapabilityControlStore,
  findProject: (projectId) => row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId }),
  getAssistantSnapshot: async () => {
    const resolved = await aiAssistantAdminService.resolve();
    return aiAssistantStore.publicConfig(resolved, { resolved });
  },
  getProviderSnapshot: () => aiProviderStore.publicConfig(),
  hasPermission,
  json,
  now,
  parse,
  registry: aiCapabilityRegistry,
  repository: aiCapabilityRepository,
  tokenService: aiExecutionTokenService,
  tokenUsage: aiTokenUsageRepository,
});

app.get("/api/health", async (req, res) => {
  const readiness = await checkReadiness({
    row,
    rows,
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
    aiRuntime: aiModelClient.status(),
  };
  // liveness-style clients that only look at HTTP status get 503 when not ready
  if (!readiness.ok) return res.status(503).json(ok(payload));
  return res.json(ok(payload));
});

app.use("/api", wrapRouterAsync(createAuthRouter({
  audit,
  authLimiter,
  buildCapabilities,
  fail,
  ok,
  publicUser,
  service: authService,
})));
app.use("/api", wrapRouterAsync(createAuditRouter({
  audit,
  fail,
  ok,
  paginatedResponse,
  parse,
  repository: createAuditRepository({ rows }),
  requirePermission,
  resolveAccessScope,
  sanitizeAuditValue,
})));

app.use("/api", wrapRouterAsync(createDashboardRouter({ fail, ok, resolveAccessScope, service: dashboardService })));

app.use("/api", wrapRouterAsync(createProjectsRouter({
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
})));

app.use("/api", wrapRouterAsync(createWorkflowRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  evaluateProjectFlow: projectFlowService.evaluateProjectFlow,
  fail,
  ok,
  repository: workflowRepository,
  requirePermission,
  templateStore: workflowTemplateStore,
  workflowTemplates: publicWorkflowTemplates,
})));

app.use("/api", wrapRouterAsync(createStrategyRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  fail,
  hasPermission,
  json,
  mapProduct,
  mapProject,
  nextId,
  now,
  ok,
  parse,
  repository: strategyRepository,
  requireAnyPermission,
  requirePermission,
  transaction,
})));

app.use("/api", wrapRouterAsync(createProductsRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  fail,
  hasPermission,
  json,
  mapProduct,
  mapProject,
  mapRequirement,
  nextId,
  now,
  ok,
  productImageUpload,
  repository: productsRepository,
  requireAnyPermission,
  requirePermission,
  storageDir: STORAGE_DIR,
  transaction,
})));

app.use("/api", wrapRouterAsync(createRequirementsRouter({
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
})));
app.use("/api", wrapRouterAsync(createTasksRouter({
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
})));

app.use("/api", wrapRouterAsync(createDeliveryRouter({
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
})));

app.use("/api", wrapRouterAsync(createTestingRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  fail,
  mapTestCase,
  mapTestRun,
  nextId,
  now,
  ok,
  paginatedResponse,
  repository: testingRepository,
  requireAnyPermission,
  syncTestCaseTask,
  testCaseStatuses: TEST_CASE_STATUSES,
  transaction,
})));

app.use("/api", wrapRouterAsync(createDocumentsRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  deleteDocumentRagIndex,
  documentCategories: DOCUMENT_CATEGORIES,
  extractTextFromUpload,
  fail,
  json,
  mapDocument,
  nextId,
  now,
  ok,
  paginatedResponse,
  reindexDocument: reindexDocumentForRag,
  repository: documentsRepository,
  requirePermission,
  storageDir: STORAGE_DIR,
  transaction,
  upload,
})));
app.use("/api", wrapRouterAsync(createAiJobsRouter({
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
})));

const { ensureAiTargetAccess } = createAiTargetAccess({
  row,
  fail,
  canViewDocument,
  canAccessProject: projectAccess.canAccessProject,
  canWriteProject: projectAccess.canWriteProject,
  isOrganizationProjectManager: projectAccess.isOrganizationProjectManager,
});

app.use("/api", wrapRouterAsync(createWorkLogsRouter({
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
})));
app.use("/api", wrapRouterAsync(createTimeEntriesRouter({
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
})));
app.use("/api", wrapRouterAsync(createDefectsRouter({
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
  transaction,
})));
app.use("/api", wrapRouterAsync(createGovernanceRouter({
  audit,
  canAccessProject: projectAccess.canAccessProject,
  canManageProject: projectAccess.canManageProject,
  fail,
  nextId,
  now,
  ok,
  repository: createGovernanceRepository({ insert, row, rows, run }),
})));

app.use("/api", wrapRouterAsync(createOrganizationRouter({
  audit,
  fail,
  nextId,
  now,
  ok,
  repository: organizationRepository,
  requirePermission,
  transaction,
})));

app.use("/api", wrapRouterAsync(createTeamRouter({
  audit,
  buildTeamMembers: teamService.buildTeamMembers,
  canViewTeamLogs: workLogHelpers.canViewTeamLogs,
  defaultPermissionsForRole,
  fail,
  isSystemRole,
  json,
  mapUser,
  nextId,
  now,
  ok,
  paginatedResponse,
  repository: teamRepository,
  requirePermission,
  revokeUserSessions: (userId) => revokeUserSessions(userId),
  systemRoles: SYSTEM_ROLES,
  organizationRepository,
})));

app.use("/api", wrapRouterAsync(createCapacityRouter({
  audit,
  canManageProject: projectAccess.canManageProject,
  canViewCapacity: workLogHelpers.canViewTeamLogs,
  fail,
  nextId,
  now,
  ok,
  repository: createCapacityRepository({ row, rows, run, upsert }),
  requirePermission,
})));

app.use("/api", wrapRouterAsync(createAiProviderAdminRouter({
  audit,
  callModelWithConfig: aiModelClient.callWithConfig,
  callRealModel,
  fail,
  ok,
  publicConfig: aiProviderStore.publicConfig,
  requirePermission,
  service: aiProviderAdminService,
})));

app.use("/api", wrapRouterAsync(createAiMaskingRouter({
  audit,
  fail,
  ok,
  requirePermission,
  service: aiMaskingRulesService,
})));

app.use("/api", wrapRouterAsync(createAiAssistantAdminRouter({
  audit,
  fail,
  ok,
  requirePermission,
  service: aiAssistantAdminService,
})));

app.use("/api", wrapRouterAsync(createAiCapabilitiesRouter({
  audit,
  browserScreenshotDir: aiBrowserControl.config.enabled ? require("node:path").join(STORAGE_DIR, "browser") : null,
  canAccessProject: projectAccess.canAccessProject,
  fail,
  modelClient: aiModelClient,
  ok,
  // Late-bound like the interaction push above: the bridge instance is
  // created further below on the shared HTTP server, before any request can
  // reach this route.
  pushUiDirective: (userId, directive) => agentEventBridge.pushUiDirective(userId, directive),
  repository: aiCapabilityRepository,
  requirePermission,
  resolveAccessScope,
  service: aiCapabilityService,
  tokenUsage: aiTokenUsageRepository,
})));

app.use("/api", wrapRouterAsync(createAgentInteractionsRouter({
  fail,
  ok,
  requirePermission,
  service: aiAgentInteractionService,
})));

// dsh session replay (admin): strictly read-only over the harness session
// store. Paths follow the resident composition's resolution so HARNESS_HOME /
// HARNESS_SESSION_DB overrides stay consistent with the runtime that writes
// them; a missing or busy store simply answers an empty replay.
const harnessSessionPaths = resolveHarnessPaths({ env: process.env });
app.use("/api", wrapRouterAsync(createAiSessionReplayRouter({
  fail,
  ok,
  requirePermission,
  service: createAiSessionReplayService({
    DatabaseSync: require("node:sqlite").DatabaseSync,
    databaseFile: harnessSessionPaths.sessionDb,
    jsonlRoot: harnessSessionPaths.sessionRoot,
  }),
})));

app.use("/api", wrapRouterAsync(createAiInteractionsRouter({
  audit,
  buildAiChatPrompt: aiChatService.buildPrompt,
  buildAiChatContext: aiChatService.buildContext,
  callRealModel: callChatAssistantModel,
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
  publicAiAssistantConfig: aiAssistantAdminService.getPublic,
  publicAiProviderConfig: aiProviderStore.publicConfig,
  requirementScore,
  requirePermission,
  resolveAccessScope,
  resolveAiProviderConfig: aiProviderStore.resolveConfig,
  row,
  rows,
})));

let serverLifecycle;

// Windows child_process.kill('SIGTERM') terminates without running handlers.
// Non-production opt-in lets ops drills invoke the same shutdown() path over HTTP.
// Registered before the 404 catch-all; lifecycle initialization completes before listening.
if (!IS_PROD && String(process.env.ENABLE_HTTP_SHUTDOWN || "") === "1") {
  app.post("/api/ops/shutdown", (req, res) => {
    const expected = String(process.env.HTTP_SHUTDOWN_TOKEN || process.env.JWT_SECRET || "").trim();
    const provided = String(req.get("x-shutdown-token") || req.body?.token || "").trim();
    if (!expected || provided !== expected) {
      return fail(res, 403, "PERMISSION_DENIED", "Invalid shutdown token.");
    }
    res.status(202).json(ok({ shuttingDown: true, via: "http" }));
    setImmediate(() => {
      void serverLifecycle.shutdown("HTTP_SHUTDOWN");
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

app.use(createHttpErrorHandler({
  fail,
  isProd: IS_PROD,
  isUniqueConstraintError,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  productionMessage: "服务器内部错误，请稍后再试。",
  randomUUID: crypto.randomUUID,
}));
app.use((req, res) => fail(res, 404, "RESOURCE_NOT_FOUND", "请求的资源不存在。"));

const collaborationServer = createDocumentCollaborationServer({
  WebSocketServer,
  server,
  authenticateSocket,
  hasPermission,
  canManageDocument: canManageDocumentCollaboration,
  repository: documentsRepository,
  now,
  audit,
  publicUser,
  reindexDocument: reindexDocumentForRag,
  transaction,
});
const { wss } = collaborationServer;
revokeUserSessions = (userId) => collaborationServer.closeUserConnections(userId, 1008, "Session revoked");

// Agent event streaming rides the shared HTTP server on its own /ws/agent
// channel (collab connections are document-bound at upgrade, so they cannot
// carry per-invocation agent subscriptions).
const agentEventBridge = createAgentEventBridge({
  WebSocketServer,
  server,
  path: "/ws/agent",
  authenticateSocket,
  hasPermission,
  canAccessProject: projectAccess.canAccessProject,
  capabilityRepository: aiCapabilityRepository,
  agentEventBus,
  audit,
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

// Sprint 5.2 platform-side AI reminder scheduling: due reminders are delivered
// to the dynamic center (objects bucket "ai-reminder"); pending rows persist
// across restarts and the first start() sweep picks up overdue ones.
const reminderScheduler = createReminderScheduler({
  repository: createAiReminderRepository({ insert, rows, run }),
  deliver: createDynamicCenterReminderDelivery({ insert, nextId, now }),
  now,
  intervalMs: Number(process.env.AI_REMINDER_SWEEP_MS || 0) || undefined,
});

serverLifecycle = createServerLifecycle({
  aiExecutionGateway,
  aiJobTimeoutMs: AI_JOB_TIMEOUT_MS,
  aiJobTimeoutSweepMs: AI_JOB_TIMEOUT_SWEEP_MS,
  aiJobsRepository,
  aiModelClient,
  audit,
  closeDatabase,
  now,
  recoverPendingAiJobs,
  reminderScheduler,
  server,
  serveWeb: SERVE_WEB,
  startAiJobTimeoutMonitor,
  wss,
  agentWss: agentEventBridge.wss,
});
serverLifecycle.installSignalHandlers();

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
    serverLifecycle.start(PORT);
  })
  .catch((error) => {
    console.error("FATAL: database initialization failed:", error && error.message ? error.message : error);
    process.exit(1);
  });

