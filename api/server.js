const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");
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
  STORAGE_DIR,
} = require("./db");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 4010;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const DEFAULT_AI_PROVIDER = {
  provider: process.env.AI_PROVIDER || "openai-compatible",
  baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  model: process.env.AI_MODEL || "gpt-4o-mini",
  wireApi: process.env.AI_WIRE_API || "chat_completions",
  disableResponseStorage: process.env.AI_DISABLE_RESPONSE_STORAGE !== "false",
  enabled: process.env.AI_ENABLED !== "false",
};

// Defect severity enum 鈥?single source of truth (docs/00 搂2.2.1).
const DEFECT_SEVERITIES = ["low", "medium", "high", "critical"];

// JWT secret: never fall back to a hardcoded value in production.
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (IS_PROD) {
    console.error("FATAL: JWT_SECRET environment variable must be set (>= 16 chars) in production.");
    process.exit(1);
  }
  // Dev-only deterministic secret so local startup still works without env vars.
  console.warn("WARNING: JWT_SECRET not set 鈥?using insecure dev default. Set JWT_SECRET before deploying.");
  return "dev-secret-change-me";
}
const JWT_SECRET = resolveJwtSecret();

// Centralized status enums to eliminate code duplication 鈥?docs/00 鏁版嵁瀛楀吀.
const PROJECT_STATUSES = ["planning", "active", "on_hold", "done", "archived"];
const REQUIREMENT_STATUSES = ["draft", "reviewing", "approved", "in_dev", "testing", "accepted", "closed", "cancelled"];
const TASK_STATUSES = ["todo", "in_progress", "blocked", "code_review", "testing", "acceptance", "done", "cancelled"];
const SPRINT_STATUSES = ["planned", "active", "closed"];
const TEST_CASE_STATUSES = ["draft", "active", "passed", "failed", "blocked"];
const DEFECT_STATUSES = ["new", "confirmed", "in_fix", "resolved", "verified", "closed", "rejected"];
const REQUIREMENT_PRIORITIES = ["high", "medium", "low"];
const TASK_TYPES = ["epic", "story", "task", "bug", "milestone", "work_package"];
const BUILD_STATUSES = ["building", "testing", "released", "failed"];
const RELEASE_STATUSES = ["draft", "staging", "released", "rollback"];
const RELEASE_TYPES = ["official", "stable", "hotfix"];
const DOCUMENT_CATEGORIES = ["project", "general", "announcement"];
const WORK_ITEM_ROLES = ["pm", "pdm", "dev", "qa"];
const SYSTEM_ROLES = ["admin", "pm", "pdm", "dev", "qa"];
const RELEASE_READY_REQUIREMENT_STATUSES = new Set(["accepted", "closed"]);
const CLOSED_TASK_STATUSES = new Set(["done", "cancelled"]);
const PAGE_KEYS = [
  "dashboard",
  "projects",
  "products",
  "team",
  "teamlogs",
  "requirements",
  "testing",
  "documents",
  "ai",
  "reports",
  "flow",
  "dynamic",
  "delivery",
  "builds",
  "releases",
  "mywork",
  "settings",
];
const PAGE_ACCESS_RULES = {
  dashboard: { permissions: [] },
  mywork: { roles: ["pm", "pdm", "dev", "qa"] },
  dynamic: { permissions: ["audit:read"] },
  projects: { permissions: ["project:read", "project:*"] },
  requirements: { permissions: ["requirement:read", "requirement:*"] },
  testing: { permissions: ["test:*", "project:*"] },
  delivery: { permissions: ["build:*", "project:*"] },
  builds: { permissions: ["build:*", "project:*"] },
  releases: { permissions: ["project:*"] },
  flow: { permissions: ["project:*"] },
  documents: { permissions: ["document:read", "document:*"] },
  reports: { permissions: ["project:*"] },
  ai: { permissions: ["ai:*"] },
  products: { permissions: ["product:*", "project:*"] },
  team: { roles: ["admin", "pm"] },
  teamlogs: { roles: ["admin", "pm"] },
  settings: { permissions: ["admin:*", "*"] },
};

const OPERATION_ACCESS_RULES = {
  "users:create": { permissions: ["admin:*", "*"] },
  "users:update": { permissions: ["admin:*", "*"] },
  "users:disable": { permissions: ["admin:*", "*"] },
  "aiProvider:manage": { permissions: ["admin:*", "*"] },
  "projects:create": { permissions: ["project:*"] },
  "projects:update": { permissions: ["project:*", "project:update"] },
  "projects:delete": { permissions: ["project:*"] },
  "projectMembers:manage": { permissions: ["project:*"] },
  "products:manage": { permissions: ["product:*"] },
  "requirements:manage": { permissions: ["requirement:*"] },
  "testing:manage": { permissions: ["project:*", "test:*"] },
  "delivery:manage": { permissions: ["project:*", "build:*"] },
  "documents:manage": { permissions: ["document:*"] },
  "ai:analyze": { permissions: ["ai:*"] },
  "audit:read": { permissions: ["audit:read"] },
  "source:read": { permissions: ["source:read"] },
};

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
app.use(express.json({ limit: "80mb" }));

const upload = multer({ dest: STORAGE_DIR, limits: { fileSize: 25 * 1024 * 1024 } });

function ok(data, meta = {}) {
  return { data, meta: { generatedAt: now(), ...meta } };
}

function fail(res, status, errorCode, message) {
  return res.status(status).json({ errorCode, message, traceId: crypto.randomUUID() });
}

function normalizeAiWireApi(value) {
  return ["responses", "chat_completions"].includes(value) ? value : "chat_completions";
}

function normalizeAiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function readStoredAiProviderConfig() {
  const setting = row("SELECT value, updated_at FROM app_settings WHERE key = @key", { key: "ai_provider" });
  return { ...parse(setting?.value, {}), updatedAt: setting?.updated_at || null };
}

function writeStoredAiProviderConfig(config) {
  run(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
    { key: "ai_provider", value: json(config), updatedAt: now() },
  );
}

function providerConfigId() {
  return `AIP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function normalizeAiProviderEntry(value = {}, fallback = {}) {
  const createdAt = value.createdAt || fallback.createdAt || now();
  return {
    id: String(value.id || fallback.id || providerConfigId()),
    name: String(value.name || fallback.name || value.provider || fallback.provider || "榛樿妯″瀷").trim(),
    provider: String(value.provider || fallback.provider || DEFAULT_AI_PROVIDER.provider).trim() || DEFAULT_AI_PROVIDER.provider,
    baseUrl: normalizeAiBaseUrl(value.baseUrl !== undefined ? value.baseUrl : fallback.baseUrl || DEFAULT_AI_PROVIDER.baseUrl),
    model: String(value.model !== undefined ? value.model : fallback.model || DEFAULT_AI_PROVIDER.model).trim(),
    wireApi: normalizeAiWireApi(value.wireApi !== undefined ? value.wireApi : fallback.wireApi || DEFAULT_AI_PROVIDER.wireApi),
    disableResponseStorage: value.disableResponseStorage !== undefined
      ? Boolean(value.disableResponseStorage)
      : fallback.disableResponseStorage !== undefined ? Boolean(fallback.disableResponseStorage) : DEFAULT_AI_PROVIDER.disableResponseStorage,
    enabled: value.enabled !== undefined
      ? Boolean(value.enabled)
      : fallback.enabled !== undefined ? Boolean(fallback.enabled) : DEFAULT_AI_PROVIDER.enabled,
    apiKey: value.apiKey !== undefined ? String(value.apiKey || "") : String(fallback.apiKey || ""),
    createdAt,
    updatedAt: value.updatedAt || fallback.updatedAt || createdAt,
  };
}

function readStoredAiProviderList() {
  const setting = row("SELECT value, updated_at FROM app_settings WHERE key = @key", { key: "ai_providers" });
  const stored = parse(setting?.value, {});
  const storedItems = Array.isArray(stored.providers) ? stored.providers : Array.isArray(stored.items) ? stored.items : [];
  if (setting && storedItems.length === 0) {
    return { activeId: null, providers: [], updatedAt: setting.updated_at || null };
  }
  if (storedItems.length) {
    const providers = storedItems.map((item) => normalizeAiProviderEntry(item));
    const activeId = providers.some((item) => item.id === stored.activeId) ? stored.activeId : providers[0]?.id || null;
    return { activeId, providers, updatedAt: setting?.updated_at || null };
  }

  const legacy = readStoredAiProviderConfig();
  const hasLegacy = Boolean(legacy.provider || legacy.baseUrl || legacy.model || legacy.apiKey);
  if (hasLegacy) {
    const migrated = normalizeAiProviderEntry({
      ...legacy,
      id: legacy.id || "AIP-LEGACY",
      name: legacy.name || legacy.provider || "榛樿妯″瀷",
      enabled: legacy.enabled !== undefined ? legacy.enabled : DEFAULT_AI_PROVIDER.enabled,
    });
    return { activeId: migrated.id, providers: [migrated], updatedAt: legacy.updatedAt || null };
  }

  const envApiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
  const defaultProvider = normalizeAiProviderEntry({
    id: "AIP-DEFAULT",
    name: DEFAULT_AI_PROVIDER.provider,
    ...DEFAULT_AI_PROVIDER,
    apiKey: envApiKey,
  });
  return { activeId: defaultProvider.id, providers: [defaultProvider], updatedAt: null };
}

function writeStoredAiProviderList(config) {
  run(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
    {
      key: "ai_providers",
      value: json({ activeId: config.activeId || null, providers: config.providers || [] }),
      updatedAt: now(),
    },
  );
}

function readStoredAiProviderHealth() {
  const setting = row("SELECT value FROM app_settings WHERE key = @key", { key: "ai_provider_health" });
  const stored = parse(setting?.value, {});
  return {
    lastAttemptAt: stored.lastAttemptAt || null,
    lastSuccessAt: stored.lastSuccessAt || null,
    lastFailureAt: stored.lastFailureAt || null,
    lastLatencyMs: stored.lastLatencyMs ?? null,
    lastWireApi: stored.lastWireApi || null,
    lastErrorMessage: stored.lastErrorMessage || "",
    lastErrorCode: stored.lastErrorCode || "",
    consecutiveFailures: Number(stored.consecutiveFailures || 0),
  };
}

function writeStoredAiProviderHealth() {
  run(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
    { key: "ai_provider_health", value: json(aiProviderHealth), updatedAt: now() },
  );
}

function resolveAiProviderConfig() {
  const storedList = readStoredAiProviderList();
  if (storedList.providers.length === 0) {
    return {
      id: null,
      name: "",
      provider: "",
      baseUrl: "",
      model: "",
      wireApi: DEFAULT_AI_PROVIDER.wireApi,
      disableResponseStorage: DEFAULT_AI_PROVIDER.disableResponseStorage,
      enabled: false,
      apiKey: "",
      apiKeySource: "none",
      updatedAt: storedList.updatedAt || null,
    };
  }
  const active = storedList.providers.find((item) => item.id === storedList.activeId) || storedList.providers[0] || {};
  const apiKey = active.apiKey || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
  return {
    id: active.id || null,
    name: active.name || active.provider || DEFAULT_AI_PROVIDER.provider,
    provider: active.provider || DEFAULT_AI_PROVIDER.provider,
    baseUrl: normalizeAiBaseUrl(active.baseUrl || DEFAULT_AI_PROVIDER.baseUrl),
    model: active.model || DEFAULT_AI_PROVIDER.model,
    wireApi: normalizeAiWireApi(active.wireApi || DEFAULT_AI_PROVIDER.wireApi),
    disableResponseStorage: active.disableResponseStorage !== undefined
      ? Boolean(active.disableResponseStorage)
      : DEFAULT_AI_PROVIDER.disableResponseStorage,
    enabled: active.enabled !== undefined ? Boolean(active.enabled) : DEFAULT_AI_PROVIDER.enabled,
    apiKey,
    apiKeySource: active.apiKey ? "database" : apiKey ? "environment" : "none",
    updatedAt: active.updatedAt || storedList.updatedAt || null,
  };
}

function maskSecret(value) {
  if (!value) return "";
  const raw = String(value);
  if (raw.length <= 8) return "已配置";
  return `${raw.slice(0, 3)}...${raw.slice(-4)}`;
}

function publicAiProviderConfig(config = resolveAiProviderConfig()) {
  let baseUrlHost = "";
  try { baseUrlHost = new URL(config.baseUrl).host; } catch { baseUrlHost = ""; }
  const configured = Boolean(config.enabled && config.apiKey && config.baseUrl && config.model);
  const storedList = readStoredAiProviderList();
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    baseUrl: config.baseUrl,
    baseUrlHost,
    model: config.model,
    wireApi: config.wireApi,
    disableResponseStorage: config.disableResponseStorage,
    enabled: Boolean(config.enabled),
    configured,
    apiKeyMasked: maskSecret(config.apiKey),
    apiKeySource: config.apiKeySource,
    updatedAt: config.updatedAt,
    health: publicAiProviderHealth(configured, Boolean(config.enabled)),
    activeId: storedList.activeId,
    providers: storedList.providers.map(publicAiProviderListItem),
  };
}

function publicAiProviderListItem(item) {
  let baseUrlHost = "";
  try { baseUrlHost = new URL(item.baseUrl).host; } catch { baseUrlHost = ""; }
  return {
    id: item.id,
    name: item.name,
    provider: item.provider,
    baseUrl: item.baseUrl,
    baseUrlHost,
    model: item.model,
    wireApi: item.wireApi,
    disableResponseStorage: item.disableResponseStorage,
    enabled: Boolean(item.enabled),
    configured: Boolean(item.enabled && item.apiKey && item.baseUrl && item.model),
    apiKeyMasked: maskSecret(item.apiKey),
    apiKeySource: item.apiKey ? "database" : "none",
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

const AI_HEALTH_RECENT_FAILURE_WINDOW_MS = 30 * 60 * 1000;
const aiProviderHealth = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastLatencyMs: null,
  lastWireApi: null,
  lastErrorMessage: "",
  lastErrorCode: "",
  consecutiveFailures: 0,
  ...readStoredAiProviderHealth(),
};

function resetAiProviderHealth() {
  Object.assign(aiProviderHealth, {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastLatencyMs: null,
    lastWireApi: null,
    lastErrorMessage: "",
    lastErrorCode: "",
    consecutiveFailures: 0,
  });
  writeStoredAiProviderHealth();
}

function sanitizeAiProviderError(error) {
  const raw = String(error?.message || error || "Unknown AI provider error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._~+/=-]+/gi, "sk-[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return raw.slice(0, 360);
}

function getAiProviderErrorCode(error) {
  if (error?.status) return String(error.status);
  const match = String(error?.message || "").match(/\b(4\d\d|5\d\d)\b/);
  return match ? match[1] : "";
}

function recordAiProviderSuccess({ wireApi, latencyMs }) {
  aiProviderHealth.lastAttemptAt = now();
  aiProviderHealth.lastSuccessAt = aiProviderHealth.lastAttemptAt;
  aiProviderHealth.lastLatencyMs = latencyMs;
  aiProviderHealth.lastWireApi = wireApi;
  aiProviderHealth.consecutiveFailures = 0;
  writeStoredAiProviderHealth();
}

function recordAiProviderFailure(error, { wireApi, latencyMs }) {
  aiProviderHealth.lastAttemptAt = now();
  aiProviderHealth.lastFailureAt = aiProviderHealth.lastAttemptAt;
  aiProviderHealth.lastLatencyMs = latencyMs;
  aiProviderHealth.lastWireApi = wireApi;
  aiProviderHealth.lastErrorMessage = sanitizeAiProviderError(error);
  aiProviderHealth.lastErrorCode = getAiProviderErrorCode(error);
  aiProviderHealth.consecutiveFailures += 1;
  writeStoredAiProviderHealth();
}

function publicAiProviderHealth(configured = true, enabled = true) {
  if (!enabled) {
    return {
      status: "disabled",
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastLatencyMs: null,
      lastWireApi: null,
      lastErrorMessage: "",
      lastErrorCode: "",
      consecutiveFailures: 0,
    };
  }
  if (!configured) {
    return {
      status: "unconfigured",
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastLatencyMs: null,
      lastWireApi: null,
      lastErrorMessage: "",
      lastErrorCode: "",
      consecutiveFailures: 0,
    };
  }

  const lastFailureMs = aiProviderHealth.lastFailureAt ? Date.parse(aiProviderHealth.lastFailureAt) : 0;
  const lastSuccessMs = aiProviderHealth.lastSuccessAt ? Date.parse(aiProviderHealth.lastSuccessAt) : 0;
  const hasRecentFailure = lastFailureMs > 0 && Date.now() - lastFailureMs < AI_HEALTH_RECENT_FAILURE_WINDOW_MS;
  const hasUnrecoveredFailure = lastFailureMs > lastSuccessMs;
  const status = hasUnrecoveredFailure && aiProviderHealth.consecutiveFailures >= 2
    ? "unavailable"
    : hasUnrecoveredFailure || hasRecentFailure
      ? "degraded"
      : aiProviderHealth.lastSuccessAt
        ? "healthy"
        : "unknown";

  return { status, ...aiProviderHealth };
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
    capabilities: buildCapabilities(user),
    phone: user.phone || "",
    position: user.position || "",
    department: user.department || "",
    bio: user.bio || "",
  };
}

function hasPermission(user, permission) {
  const permissions = Array.isArray(user.permissions) ? user.permissions : parse(user.permissions, []);
  return permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${permission.split(":")[0]}:*`);
}

function hasAnyPermission(user, permissions = []) {
  if (!permissions.length) return true;
  return permissions.some((permission) => hasPermission(user, permission));
}

function canAccessPageByServerRule(user, page) {
  if (!user || !PAGE_KEYS.includes(page)) return false;
  if (hasPermission(user, "*")) return true;
  const rule = PAGE_ACCESS_RULES[page];
  if (!rule) return false;
  if (rule.roles && !rule.roles.includes(normalizeRole(user.role))) return false;
  return hasAnyPermission(user, rule.permissions || []);
}

function canAccessOperationByServerRule(user, operation) {
  if (!user || !operation) return false;
  if (hasPermission(user, "*")) return true;
  const rule = OPERATION_ACCESS_RULES[operation];
  if (!rule) return false;
  if (rule.roles && !rule.roles.includes(normalizeRole(user.role))) return false;
  return hasAnyPermission(user, rule.permissions || []);
}

function buildCapabilities(user) {
  const sourceUser = {
    ...user,
    permissions: Array.isArray(user?.permissions) ? user.permissions : parse(user?.permissions, []),
  };
  const pages = PAGE_KEYS.filter((page) => canAccessPageByServerRule(sourceUser, page));
  const operations = Object.keys(OPERATION_ACCESS_RULES).filter((operation) =>
    canAccessOperationByServerRule(sourceUser, operation),
  );
  return {
    pages,
    operations,
    permissions: sourceUser.permissions,
    role: normalizeRole(sourceUser.role),
  };
}

function normalizeRole(role) {
  return SYSTEM_ROLES.includes(role) ? role : "dev";
}

function isSystemRole(role) {
  return SYSTEM_ROLES.includes(role);
}

function roleScopeForUser(user) {
  const role = normalizeRole(user?.role);
  if (role === "admin") return ["admin", "pm", "pdm", "dev", "qa"];
  if (role === "pm") return ["pm", "pdm", "dev", "qa"];
  if (role === "pdm") return ["pdm"];
  if (role === "dev") return ["dev"];
  return ["qa"];
}

function canManageDocumentRole(user, targetRole) {
  return roleScopeForUser(user).includes(normalizeRole(targetRole));
}

function visibleDocumentsForUser(user, documents) {
  if (!user || user.role === "admin") return documents;
  return documents.filter((item) => item.ownerRole ? canManageDocumentRole(user, item.ownerRole) : true);
}

function canSubmitDailyLog(user) {
  return Boolean(user && normalizeRole(user.role) !== "admin");
}

function isoDateOnly(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return now().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function weekKeyOf(value) {
  const date = new Date(`${isoDateOnly(value)}T00:00:00.000Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readZipEntry(buffer, targetName) {
  let offset = 0;
  while (offset + 30 < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const fileName = buffer.slice(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) return "";
    if (fileName === targetName) {
      const data = buffer.slice(dataStart, dataEnd);
      if (compression === 0) return data.toString("utf8");
      if (compression === 8) return zlib.inflateRawSync(data).toString("utf8");
      return "";
    }
    offset = dataEnd;
  }
  return "";
}

function extractDocxText(buffer) {
  try {
    const xml = readZipEntry(buffer, "word/document.xml");
    if (!xml) return "";
    return decodeXmlEntities(xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, " "));
  } catch {
    return "";
  }
}

function extractTextFromUpload(fileName, fileType, contentBase64) {
  if (!contentBase64) return "";
  const base64 = String(contentBase64).includes(",") ? String(contentBase64).split(",").pop() : String(contentBase64);
  const buffer = Buffer.from(base64 || "", "base64");
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const mime = String(fileType || "").toLowerCase();
  const cleanText = (value) => String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);

  if (
    ext === ".txt" ||
    ext === ".md" ||
    ext === ".csv" ||
    ext === ".json" ||
    ext === ".xml" ||
    ext === ".yaml" ||
    ext === ".yml" ||
    ext === ".log" ||
    mime.startsWith("text/") ||
    ["application/json", "application/xml", "application/x-yaml"].includes(mime)
  ) {
    return cleanText(buffer.toString("utf8"));
  }
  if (ext === ".pdf" || mime === "application/pdf") {
    const raw = buffer.toString("latin1");
    const chunks = [];
    const literalStrings = raw.matchAll(/\(([^()]{2,500})\)\s*T[jJ]/g);
    for (const match of literalStrings) chunks.push(match[1]);
    const bracketStrings = raw.matchAll(/\[((?:\s*\([^()]{1,300}\)\s*){1,80})\]\s*TJ/g);
    for (const match of bracketStrings) {
      const inner = [...String(match[1]).matchAll(/\(([^()]{1,300})\)/g)].map((item) => item[1]).join("");
      if (inner) chunks.push(inner);
    }
    const decoded = chunks.join("\n")
      .replace(/\\([nrtbf()\\])/g, (_, ch) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" }[ch] || ch))
      .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
    const text = cleanText(decoded);
    if (text.length > 20) return text;
    return "PDF 文件已上传，但未能直接抽取可读正文。建议上传可复制文本的 PDF，或补充 Markdown/TXT 版本以提升 AI 分析质量。";
  }
  if (ext === ".docx") {
    const extractedDocx = extractDocxText(buffer);
    const matches = extractedDocx ? [[null, extractedDocx]] : [];
    if (matches.length) {
      return cleanText(matches.map((item) => item[1]).join(""));
    }
    return "DOCX 文件已上传。当前未安装 Word 解析器，无法稳定抽取正文；建议上传 TXT/Markdown 导出版，或在系统中启用文档解析依赖。";
  }
  if (ext === ".doc") {
    return cleanText(buffer.toString("utf8").replace(/[^\u4e00-\u9fa5\w\s.,;:!?()\-]/g, " "));
  }
  const text = cleanText(buffer.toString("utf8"));
  return text || "文件已上传，但当前格式无法直接抽取正文。";
}

function buildWeeklySummary(logs) {
  const entries = Array.isArray(logs) ? logs : [];
  const completed = [];
  const blockers = [];
  const nextPlans = [];
  const linkedRequirements = new Map();
  for (const item of entries) {
    const analysis = parse(item.analysis, {});
    (analysis.completedItems || []).forEach((text) => completed.push(text));
    (analysis.blockers || []).forEach((text) => blockers.push(text));
    if (item.next_plan) nextPlans.push(item.next_plan);
    (analysis.linkedRequirements || []).forEach((entryItem) => {
      if (entryItem?.id) linkedRequirements.set(entryItem.id, entryItem.title || entryItem.id);
    });
  }
  return {
    summary: [
      `本周共提交 ${entries.length} 篇日报。`,
      completed.length ? `已完成事项聚焦在：${[...new Set(completed)].slice(0, 6).join("；")}。` : "本周暂无结构化完成事项。",
      blockers.length ? `当前阻塞主要包括：${[...new Set(blockers)].slice(0, 5).join("；")}。` : "本周未记录明显阻塞。",
      nextPlans.length ? `下周计划集中在：${[...new Set(nextPlans)].slice(0, 4).join("；")}。` : "下周计划尚未补充完整。",
    ].join("\n"),
    completedItems: [...new Set(completed)],
    blockers: [...new Set(blockers)],
    nextPlans: [...new Set(nextPlans)],
    linkedRequirements: [...linkedRequirements.entries()].map(([id, title]) => ({ id, title })),
  };
}

function canViewTeamLogs(user) {
  const role = normalizeRole(user?.role);
  return role === "admin" || role === "pm";
}

function roleDepartment(role) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") return "平台管理";
  if (normalized === "pm") return "项目管理部";
  if (normalized === "pdm") return "产品部";
  if (normalized === "qa") return "测试部";
  return "研发部";
}

function roleSkills(role) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") return ["权限治理", "平台配置", "流程审计"];
  if (normalized === "pm") return ["项目协调", "风险管理", "交付推进"];
  if (normalized === "pdm") return ["产品规划", "需求分析", "路线图管理"];
  if (normalized === "qa") return ["测试设计", "缺陷跟踪", "质量保障"];
  return ["研发实现", "代码评审", "构建发布"];
}

function derivePresence(userRow, recentAuditRows) {
  if (userRow.status !== "active") return "offline";
  const lastAudit = recentAuditRows
    .filter((item) => item.actor_id === userRow.id || item.actor_name === userRow.name)
    .map((item) => new Date(item.created_at).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  if (!lastAudit) return "offline";
  const minutes = (Date.now() - lastAudit) / 60000;
  if (minutes <= 30) return "online";
  if (minutes <= 24 * 60) return "away";
  return "offline";
}

function buildTeamMembers() {
  const users = rows("SELECT * FROM users ORDER BY created_at DESC");
  const tasks = rows("SELECT * FROM tasks").map(mapTask);
  const projects = rows("SELECT * FROM projects").map(mapProject);
  const projectMembers = rows("SELECT * FROM project_members");
  const requirements = rows("SELECT * FROM requirements").map(mapRequirement);
  const defects = rows("SELECT * FROM defects").map(mapDefect);
  const workLogs = rows("SELECT * FROM work_logs ORDER BY log_date DESC, created_at DESC");
  const auditRows = rows("SELECT actor_id, actor_name, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 500");
  const activeTaskStatuses = new Set(["todo", "in_progress", "blocked", "code_review", "testing", "acceptance"]);
  const closedDefectStatuses = new Set(["closed", "rejected"]);

  return users.map((userRow) => {
    const user = mapUser(userRow);
    const role = normalizeRole(user.role);
    const userTasks = tasks.filter((task) => task.owner === user.name);
    const activeTasks = userTasks.filter((task) => activeTaskStatuses.has(task.status));
    const doneTasks = userTasks.filter((task) => task.status === "done");
    const blockedTasks = userTasks.filter((task) => task.status === "blocked" || Boolean(String(task.blocker || "").trim()));
    const userRequirements = requirements.filter((item) => item.owner === user.name || item.assignee === user.name);
    const userDefects = defects.filter((item) => item.assignee === user.name && !closedDefectStatuses.has(item.status));
    const userLogs = workLogs.filter((item) => item.author === user.name);
    const projectMap = new Map();

    projects
      .filter((project) => project.owner === user.name)
      .forEach((project) => projectMap.set(project.id, { id: project.id, name: project.name, role: "owner", status: project.status, progress: project.progress }));
    projectMembers
      .filter((member) => member.user_name === user.name)
      .forEach((member) => {
        const project = projects.find((item) => item.id === member.project_id);
        if (project) projectMap.set(project.id, { id: project.id, name: project.name, role: normalizeRole(member.role), status: project.status, progress: project.progress });
      });
    tasks
      .filter((task) => task.owner === user.name)
      .forEach((task) => {
        const project = projects.find((item) => item.id === task.projectId);
        if (project && !projectMap.has(project.id)) {
          projectMap.set(project.id, { id: project.id, name: project.name, role, status: project.status, progress: project.progress });
        }
      });
    userRequirements.forEach((requirement) => {
      const project = projects.find((item) => item.id === requirement.projectId);
      if (project && !projectMap.has(project.id)) {
        projectMap.set(project.id, { id: project.id, name: project.name, role, status: project.status, progress: project.progress });
      }
    });

    const recentLogs = userLogs.slice(0, 3).map((item) => ({
      id: item.id,
      projectId: item.project_id || null,
      project: item.project || "",
      content: item.content,
      blockers: item.blockers || "",
      logDate: item.log_date || item.created_at?.slice(0, 10),
      createdAt: item.created_at,
    }));

    return {
      ...user,
      department: user.department || roleDepartment(role),
      presence: derivePresence(userRow, auditRows),
      skills: roleSkills(role),
      stats: {
        totalTasks: userTasks.length,
        activeTasks: activeTasks.length,
        doneTasks: doneTasks.length,
        blockedTasks: blockedTasks.length,
        requirements: userRequirements.length,
        openDefects: userDefects.length,
        workLogs: userLogs.length,
        blockers: userLogs.filter((item) => String(item.blockers || "").trim()).length + blockedTasks.length + userDefects.length,
        estimatedHours: userTasks.reduce((sum, task) => sum + (Number(task.estimatedHours) || 0), 0),
        actualHours: userTasks.reduce((sum, task) => sum + (Number(task.actualHours) || 0), 0),
        remainingHours: userTasks.reduce((sum, task) => sum + (Number(task.remainingHours) || 0), 0),
      },
      projects: [...projectMap.values()],
      recentTasks: activeTasks.slice(0, 5).map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        projectId: task.projectId,
        progress: task.progress,
        dueDate: task.dueDate,
      })),
      recentLogs,
      lastActiveAt: auditRows.find((item) => item.actor_id === userRow.id || item.actor_name === userRow.name)?.created_at || null,
    };
  });
}

function resolveWorkLogProjectFilter(query) {
  const projectId = String(query.projectId || "").trim();
  const projectName = String(query.project || "").trim();
  if (projectId) {
    const project = row("SELECT id, name FROM projects WHERE id = @id", { id: projectId });
    return { id: projectId, name: project?.name || projectName };
  }
  if (projectName) {
    const project = row("SELECT id, name FROM projects WHERE name = @name", { name: projectName });
    return { id: project?.id || "", name: projectName };
  }
  return { id: "", name: "" };
}

function workLogMatchesProject(item, projectFilter) {
  if (!projectFilter.id && !projectFilter.name) return true;
  if (projectFilter.id && item.projectId === projectFilter.id) return true;
  if (projectFilter.name && item.project === projectFilter.name) return true;
  return false;
}

function buildTeamWeeklySummary(logs, missingMembers, weekKey, project) {
  const grouped = new Map();
  logs.forEach((item) => {
    const key = `${item.author}::${item.role || "dev"}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  const members = [...grouped.entries()].map(([key, entries]) => {
    const [author, role] = key.split("::");
    const summary = buildWeeklySummary(entries);
    const markdown = [
      `# ${author} 周报`,
      "",
      `- 项目：${project || "未绑定项目"}`,
      `- 周起始：${weekKey}`,
      `- 日报数量：${entries.length}`,
      "",
      "## AI 总结",
      summary.summary,
    ].join("\n");
    return { author, role, count: entries.length, summary, markdown };
  });
  const overall = buildWeeklySummary(logs);
  return {
    project,
    weekKey,
    submittedCount: members.length,
    missingCount: missingMembers.length,
    members,
    missingMembers,
    overall,
  };
}

function collectProjectMembers(projectFilter) {
  const members = new Map();
  if (!projectFilter?.id && !projectFilter?.name) return [];
  const project = projectFilter.id
    ? row("SELECT * FROM projects WHERE id = @id", { id: projectFilter.id })
    : row("SELECT * FROM projects WHERE name = @name", { name: projectFilter.name });
  if (!project) return [];

  rows("SELECT * FROM project_members WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
    members.set(`${item.user_name}::${normalizeRole(item.role)}`, { name: item.user_name, role: normalizeRole(item.role) });
  });

  if (project.owner) {
    const pmUser = row("SELECT * FROM users WHERE name = @name AND status = 'active'", { name: project.owner });
    if (pmUser) members.set(`${pmUser.name}::${normalizeRole(pmUser.role)}`, { name: pmUser.name, role: normalizeRole(pmUser.role) });
  }

  rows("SELECT * FROM requirements WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
    if (item.assignee && item.assignee_role) {
      members.set(`${item.assignee}::${normalizeRole(item.assignee_role)}`, { name: item.assignee, role: normalizeRole(item.assignee_role) });
    }
  });

  rows("SELECT * FROM tasks WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
    if (item.owner && item.assignee_role) {
      members.set(`${item.owner}::${normalizeRole(item.assignee_role)}`, { name: item.owner, role: normalizeRole(item.assignee_role) });
    }
  });

  rows("SELECT * FROM test_cases WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
    if (item.owner) members.set(`${item.owner}::qa`, { name: item.owner, role: "qa" });
  });

  rows("SELECT * FROM defects WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
    if (item.assignee && item.assignee_role) {
      members.set(`${item.assignee}::${normalizeRole(item.assignee_role)}`, { name: item.assignee, role: normalizeRole(item.assignee_role) });
    }
  });

  return [...members.values()].filter((item) => ["pdm", "dev", "qa"].includes(item.role));
}

function ensureRoleAllowed(targetRole, allowedRoles, fieldName = "role") {
  if (!targetRole || !allowedRoles.includes(targetRole)) {
    return `${fieldName} must be one of: ${allowedRoles.join(", ")}`;
  }
  return null;
}

function defaultPermissionsForRole(role) {
  if (role === "admin") return ["*"];
  if (role === "pm") return ["project:*", "requirement:*", "document:*", "ai:*", "audit:read", "source:read"];
  if (role === "pdm") return ["product:*", "document:*", "project:read", "requirement:*", "audit:read"];
  if (role === "dev") return ["project:read", "project:update", "requirement:read", "build:*", "document:*", "audit:read"];
  if (role === "qa") return ["test:*", "defect:*", "document:read", "audit:read"];
  return [];
}

function syncRequirementTask(requirementRow) {
  const existing = row(
    "SELECT * FROM tasks WHERE source_type = 'requirement' AND source_id = @sourceId",
    { sourceId: requirementRow.id },
  );
  const progress = Number(requirementRow.completion) || 0;
  const completed = progress >= 100;
  const assignee = requirementRow.assignee || requirementRow.owner;
  const taskPayload = {
    title: `需求跟进：${requirementRow.title}`,
    status: completed ? "done" : progress > 0 ? "in_progress" : "todo",
    status_text: completed ? "已完成" : progress > 0 ? "进行中" : "待处理",
    project_id: requirementRow.project_id,
    owner: assignee,
    description: requirementRow.description || "",
    due_date: null,
    requirement_id: requirementRow.id,
    progress,
    blocker: null,
    type: "story",
    parent_id: null,
    wbs_code: existing?.wbs_code || `REQ-${String(requirementRow.id).replace("REQ-", "")}`,
    kanban_column: completed ? "done" : progress > 0 ? "in_progress" : "todo",
    sort_order: existing?.sort_order || Date.now(),
    estimated_hours: existing?.estimated_hours || 8,
    actual_hours: existing?.actual_hours || 0,
    remaining_hours: completed ? 0 : Math.max(0, (existing?.estimated_hours || 8) - (existing?.actual_hours || 0)),
    assignee_role: requirementRow.assignee_role || null,
    source_type: "requirement",
    source_id: requirementRow.id,
  };

  if (existing) {
    run(
      `UPDATE tasks SET
        title = @title,
        status = @status,
        status_text = @status_text,
        project_id = @project_id,
        owner = @owner,
        description = @description,
        requirement_id = @requirement_id,
        progress = @progress,
        remaining_hours = @remaining_hours,
        type = @type,
        kanban_column = @kanban_column,
        assignee_role = @assignee_role
      WHERE id = @id`,
      {
        id: existing.id,
        title: taskPayload.title,
        status: taskPayload.status,
        status_text: taskPayload.status_text,
        project_id: taskPayload.project_id,
        owner: taskPayload.owner,
        description: taskPayload.description,
        requirement_id: taskPayload.requirement_id,
        progress: taskPayload.progress,
        remaining_hours: taskPayload.remaining_hours,
        type: taskPayload.type,
        kanban_column: taskPayload.kanban_column,
        assignee_role: taskPayload.assignee_role,
      },
    );
    return existing.id;
  }

  const taskId = nextId("TASK", "tasks");
  insert("tasks", { id: taskId, ...taskPayload });
  return taskId;
}

function mergeRequirementLinkedTask(requirementId, taskId) {
  if (!requirementId || !taskId) return;
  const requirement = row("SELECT linked_tasks FROM requirements WHERE id = @id", { id: requirementId });
  const linkedTasks = parse(requirement?.linked_tasks, []);
  const merged = [...new Set([...(Array.isArray(linkedTasks) ? linkedTasks : []), taskId])];
  run("UPDATE requirements SET linked_tasks = @tasks WHERE id = @id", { id: requirementId, tasks: json(merged) });
}

function syncTestCaseTask(testCaseRow) {
  const existing = row(
    "SELECT * FROM tasks WHERE source_type = 'test_case' AND source_id = @sourceId",
    { sourceId: testCaseRow.id },
  );
  const passed = Number(testCaseRow.passed_cases) || 0;
  const failed = Number(testCaseRow.failed_cases) || 0;
  const blocked = Number(testCaseRow.blocked_cases) || 0;
  const total = Math.max(Number(testCaseRow.total_cases) || 0, passed + failed + blocked);
  const progress = total > 0 ? Math.min(100, Math.round((passed / total) * 100)) : 0;
  const completed = progress >= 100 && failed === 0 && blocked === 0;
  const taskPayload = {
    title: `测试执行：${testCaseRow.name}`,
    status: completed ? "done" : progress > 0 ? "testing" : "todo",
    status_text: completed ? "已完成" : progress > 0 ? "测试中" : "待处理",
    project_id: testCaseRow.project_id,
    owner: testCaseRow.owner,
    description: testCaseRow.description || "",
    due_date: null,
    requirement_id: testCaseRow.requirement_id,
    progress,
    blocker: blocked > 0 ? "存在阻塞用例待处理" : failed > 0 ? "存在失败用例待修复" : null,
    type: "task",
    parent_id: null,
    wbs_code: existing?.wbs_code || `TC-${String(testCaseRow.id).replace(/^(TC|TEST)-/, "")}`,
    kanban_column: completed ? "done" : progress > 0 ? "testing" : "todo",
    sort_order: existing?.sort_order || Date.now(),
    estimated_hours: existing?.estimated_hours || 6,
    actual_hours: existing?.actual_hours || 0,
    remaining_hours: completed ? 0 : Math.max(0, (existing?.estimated_hours || 6) - (existing?.actual_hours || 0)),
    assignee_role: testCaseRow.assignee_role || "qa",
    source_type: "test_case",
    source_id: testCaseRow.id,
  };

  if (existing) {
    run(
      `UPDATE tasks SET
        title = @title,
        status = @status,
        status_text = @status_text,
        project_id = @project_id,
        owner = @owner,
        description = @description,
        requirement_id = @requirement_id,
        progress = @progress,
        blocker = @blocker,
        remaining_hours = @remaining_hours,
        kanban_column = @kanban_column,
        assignee_role = @assignee_role
      WHERE id = @id`,
      {
        id: existing.id,
        title: taskPayload.title,
        status: taskPayload.status,
        status_text: taskPayload.status_text,
        project_id: taskPayload.project_id,
        owner: taskPayload.owner,
        description: taskPayload.description,
        requirement_id: taskPayload.requirement_id,
        progress: taskPayload.progress,
        blocker: taskPayload.blocker,
        remaining_hours: taskPayload.remaining_hours,
        kanban_column: taskPayload.kanban_column,
        assignee_role: taskPayload.assignee_role,
      },
    );
    return existing.id;
  }

  const taskId = nextId("TASK", "tasks");
  insert("tasks", { id: taskId, ...taskPayload });
  return taskId;
}

function syncDefectTask(defectRow) {
  const existing = row(
    "SELECT * FROM tasks WHERE source_type = 'defect' AND source_id = @sourceId",
    { sourceId: defectRow.id },
  );
  const assignee = defectRow.assignee || defectRow.reporter || "未分配";
  const status = CLOSED_DEFECT_STATUSES.has(defectRow.status)
    ? "done"
    : defectRow.status === "resolved"
      ? "testing"
      : defectRow.status === "in_fix"
        ? "in_progress"
        : "todo";
  const taskPayload = {
    title: `缺陷修复：${defectRow.title}`,
    status,
    status_text: status === "done" ? "已关闭" : status === "testing" ? "待验证" : status === "in_progress" ? "修复中" : "待处理",
    project_id: defectRow.project_id,
    owner: assignee,
    description: defectRow.description || "",
    due_date: null,
    requirement_id: defectRow.requirement_id || null,
    progress: status === "done" ? 100 : status === "testing" ? 85 : status === "in_progress" ? 50 : 0,
    blocker: null,
    type: "bug",
    parent_id: null,
    wbs_code: existing?.wbs_code || `BUG-${String(defectRow.id).replace("BUG-", "")}`,
    kanban_column: status === "done" ? "done" : status === "testing" ? "testing" : status === "in_progress" ? "in_progress" : "todo",
    sort_order: existing?.sort_order || Date.now(),
    estimated_hours: existing?.estimated_hours || 6,
    actual_hours: existing?.actual_hours || 0,
    remaining_hours: status === "done" ? 0 : Math.max(0, (existing?.estimated_hours || 6) - (existing?.actual_hours || 0)),
    assignee_role: defectRow.assignee_role || null,
    source_type: "defect",
    source_id: defectRow.id,
  };

  if (existing) {
    run(
      `UPDATE tasks SET
        title = @title,
        status = @status,
        status_text = @status_text,
        project_id = @project_id,
        owner = @owner,
        description = @description,
        requirement_id = @requirement_id,
        progress = @progress,
        remaining_hours = @remaining_hours,
        type = @type,
        kanban_column = @kanban_column,
        assignee_role = @assignee_role
      WHERE id = @id`,
      {
        id: existing.id,
        title: taskPayload.title,
        status: taskPayload.status,
        status_text: taskPayload.status_text,
        project_id: taskPayload.project_id,
        owner: taskPayload.owner,
        description: taskPayload.description,
        requirement_id: taskPayload.requirement_id,
        progress: taskPayload.progress,
        remaining_hours: taskPayload.remaining_hours,
        type: taskPayload.type,
        kanban_column: taskPayload.kanban_column,
        assignee_role: taskPayload.assignee_role,
      },
    );
    return existing.id;
  }

  const taskId = nextId("TASK", "tasks");
  insert("tasks", { id: taskId, ...taskPayload });
  return taskId;
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
    if (user.status === "disabled") return fail(res, 403, "ACCOUNT_DISABLED", "该账号已被禁用。");
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

function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!permissions.some((permission) => hasPermission(req.user, permission))) {
      return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
    }
    return next();
  };
}

function canOperateRequirement(user, requirementRow) {
  if (!user || !requirementRow) return false;
  if (hasPermission(user, "requirement:*")) return true;
  const role = normalizeRole(user.role);
  if (!["dev", "qa"].includes(role)) return false;
  return requirementRow.assignee === user.name && requirementRow.assignee_role === role;
}

// Global API rate limit (per IP). Windows reset on first request.
function isTrustedSessionRequest(req) {
  const authHeader = req.headers.authorization || "";
  const hasBearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedProto = req.headers["x-forwarded-proto"];
  const userAgent = req.headers["user-agent"] || "";
  const localRequest =
    req.ip === "::1" ||
    req.ip === "127.0.0.1" ||
    req.ip === "::ffff:127.0.0.1" ||
    req.hostname === "localhost" ||
    req.hostname === "127.0.0.1";

  return localRequest && hasBearerToken && !forwardedFor && !forwardedProto && userAgent.includes("Mozilla");
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 600 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !IS_PROD && isTrustedSessionRequest(req),
  message: { errorCode: "RATE_LIMITED", message: "请求过于频繁，请稍后再试。", traceId: crypto.randomUUID() },
});
app.use("/api/", apiLimiter);

// Stricter limit for auth (brute-force protection).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errorCode: "RATE_LIMITED", message: "登录尝试次数过多，请稍后再试。", traceId: crypto.randomUUID() },
});

app.use(authenticate);

function authenticateSocket(req) {
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token") || "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = row("SELECT * FROM users WHERE id = @id", { id: payload.sub });
    return user && user.status === "active" ? publicUser(user) : null;
  } catch {
    return null;
  }
}

async function buildDashboard(scope = {}) {
  const { owner, user } = scope;
  const taskFilter = owner ? " WHERE owner = @owner" : "";
  const reqFilter = owner ? " WHERE (owner = @owner OR assignee = @owner)" : "";
  const tasks = rows(`SELECT * FROM tasks${taskFilter}`, owner ? { owner } : {}).map(mapTask);
  const projects = rows("SELECT * FROM projects").map(mapProject);
  const requirements = rows(`SELECT * FROM requirements${reqFilter}`, owner ? { owner } : {}).map(mapRequirement);
  const tests = rows("SELECT * FROM test_cases");
  const documents = visibleDocumentsForUser(user, rows("SELECT * FROM documents").map(mapDocument));
  // Personal scope adds my defects + my builds.
  const myDefects = owner
    ? rows("SELECT * FROM defects WHERE assignee = @owner", { owner }).map(mapDefect)
    : [];
  const myBuilds = owner
    ? rows("SELECT * FROM builds WHERE creator = @owner", { owner }).map(mapBuild)
    : [];
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

  const metrics = {
    tasks: taskCounts,
    projectHealthAverage,
    requirementCompletionAverage,
    testPassRate: totalCases ? Math.round((passedCases / totalCases) * 100) : 0,
    openRisks: riskyProjects.reduce((sum, project) => sum + project.riskCount, 0),
    documentCount: documents.length,
  };
  const result = {
    metrics: {
      ...metrics,
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
    ai: await createAiSummary("dashboard", {
      ...metrics,
      totalJobs: row("SELECT COUNT(*) AS c FROM ai_jobs")?.c || 0,
      logAnalysis: row("SELECT COUNT(*) AS c FROM work_logs")?.c || 0,
    }, { cacheKey: scope.owner || scope.user?.role || "dashboard", backgroundRefresh: true, timeoutMs: 14000 }),
  };
  // Attach personal-only sections.
  if (owner) {
    result.myDefects = myDefects;
    result.myBuilds = myBuilds;
  }
  return result;
}

function extractSentences(content, keywords) {
  return String(content || "")
    .replace(/\r/g, "\n")
    .split(/[\n.;!?銆傦紱锛侊紵]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)));
}

function localAnalyzeWorkLog(input) {
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
    modelUsed: "local-rule-engine",
  };
}

function normalizeWorkLogAnalysis(value, fallback) {
  const linkedIds = [...new Set((Array.isArray(value?.linkedRequirements) ? value.linkedRequirements : [])
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean)
    .map((id) => String(id).toUpperCase()))];
  return {
    completedItems: Array.isArray(value?.completedItems) && value.completedItems.length
      ? value.completedItems.map(String).slice(0, 8)
      : fallback.completedItems,
    blockers: Array.isArray(value?.blockers) && value.blockers.length
      ? value.blockers.map(String).slice(0, 8)
      : fallback.blockers,
    linkedRequirements: linkedIds.length
      ? linkedIds.map((id) => {
          const requirement = row("SELECT * FROM requirements WHERE id = @id", { id });
          return { id, title: requirement?.title || id, known: Boolean(requirement), currentCompletion: requirement?.completion ?? null };
        })
      : fallback.linkedRequirements,
    progressChange: {
      from: Number.isFinite(Number(value?.progressChange?.from)) ? Number(value.progressChange.from) : fallback.progressChange.from,
      to: Number.isFinite(Number(value?.progressChange?.to)) ? Number(value.progressChange.to) : fallback.progressChange.to,
      delta: Number.isFinite(Number(value?.progressChange?.delta)) ? Number(value.progressChange.delta) : fallback.progressChange.delta,
    },
    confidence: ["low", "medium", "high"].includes(value?.confidence) ? value.confidence : fallback.confidence,
    suggestedActions: Array.isArray(value?.suggestedActions) && value.suggestedActions.length
      ? value.suggestedActions.map(String).slice(0, 8)
      : fallback.suggestedActions,
    modelUsed: value?.modelUsed || resolveAiProviderConfig().model,
  };
}

async function analyzeWorkLog(input) {
  const fallback = localAnalyzeWorkLog(input);
  const normalized = [input?.content, input?.blockers, input?.nextPlan].filter(Boolean).join("\n").trim();
  if (!normalized) return fallback;
  const knownRequirements = rows("SELECT id, title, completion, status FROM requirements ORDER BY id LIMIT 80")
    .map((item) => ({ id: item.id, title: item.title, completion: item.completion, status: item.status }));
  const modelText = await callRealModel(
    [
      "请分析下面的工作日志，只返回严格 JSON，不要 Markdown。",
      "JSON schema:",
      "{",
      '  "completedItems": ["已完成事项"],',
      '  "blockers": ["阻塞/风险，没有则返回空数组"],',
      '  "linkedRequirements": ["REQ-001"],',
      '  "progressChange": {"from": 10, "to": 40, "delta": 30},',
      '  "confidence": "low|medium|high",',
      '  "suggestedActions": ["下一步建议"]',
      "}",
      `已知需求：${JSON.stringify(knownRequirements)}`,
      `日志内容：${normalized}`,
    ].join("\n"),
    { system: "你是项目经理的工作日志分析助手，擅长识别完成项、阻塞项、需求关联和可执行下一步。" },
  ).catch(() => null);
  const parsed = extractJsonPayload(modelText);
  if (!parsed) return fallback;
  return normalizeWorkLogAnalysis({ ...parsed, modelUsed: resolveAiProviderConfig().model }, fallback);
}

function extractResponsesText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const chunks = [];
  output.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part.text === "string") chunks.push(part.text);
      if (typeof part.output_text === "string") chunks.push(part.output_text);
    });
  });
  return chunks.join("\n").trim() || null;
}

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

function normalizeAiChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").trim().slice(0, 6000),
    }))
    .filter((item) => item.content)
    .slice(-12);
}

function normalizeAiChatAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((item) => {
      const mimeType = String(item?.mimeType || "").trim();
      const name = String(item?.name || "闄勪欢").trim().slice(0, 120);
      const size = Number(item?.size) || 0;
      const contentBase64 = String(item?.contentBase64 || "").trim();
      const kind = mimeType.startsWith("image/") ? "image" : "document";
      const extracted = kind === "document" && contentBase64
        ? extractTextFromUpload(name, mimeType, contentBase64)
        : "";
      const contentText = String(item?.contentText || extracted || "").slice(0, 12000);
      return { kind, name, mimeType, size, contentText, contentBase64 };
    })
    .filter((item) => item.name && (item.contentText || item.contentBase64 || item.size))
    .slice(0, 6);
}

function dataUrlForAttachment(attachment) {
  if (!attachment?.mimeType?.startsWith("image/") || !attachment.contentBase64) return null;
  const safeMime = attachment.mimeType.replace(/[^-\w/+.;=]/g, "");
  return `data:${safeMime};base64,${attachment.contentBase64}`;
}

function buildAiChatContext() {
  const projects = rows("SELECT * FROM projects ORDER BY id").map(mapProject);
  const requirements = rows("SELECT * FROM requirements ORDER BY id").map(mapRequirement);
  const tasks = rows("SELECT * FROM tasks ORDER BY id").map(mapTask);
  const defects = rows("SELECT * FROM defects ORDER BY id").map(mapDefect);
  const documents = rows("SELECT * FROM documents ORDER BY updated_at DESC LIMIT 12").map(mapDocument);
  const builds = rows("SELECT * FROM builds ORDER BY build_date DESC LIMIT 10").map(mapBuild);
  const releases = rows("SELECT * FROM releases ORDER BY release_date DESC LIMIT 10").map(mapRelease);
  const activeProjects = projects.filter((item) => !["done", "archived"].includes(item.status));
  const riskyProjects = projects.filter((item) => item.riskCount > 0 || item.healthScore < 70);
  const openDefects = defects.filter((item) => !["closed", "rejected", "verified"].includes(item.status));
  const blockedTasks = tasks.filter((item) => item.status === "blocked");
  return {
    metrics: {
      projects: projects.length,
      activeProjects: activeProjects.length,
      riskyProjects: riskyProjects.length,
      requirements: requirements.length,
      tasks: tasks.length,
      blockedTasks: blockedTasks.length,
      openDefects: openDefects.length,
      documents: documents.length,
      builds: builds.length,
      releases: releases.length,
    },
    projects: projects.slice(0, 20).map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      owner: item.owner,
      progress: item.progress,
      healthScore: item.healthScore,
      riskCount: item.riskCount,
    })),
    requirements: requirements.slice(0, 25).map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority,
      completion: item.completion,
      owner: item.owner,
      projectId: item.projectId,
    })),
    blockedTasks: blockedTasks.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      assignee: item.assignee,
      projectId: item.projectId,
      requirementId: item.requirementId,
      remainingHours: item.remainingHours,
    })),
    openDefects: openDefects.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      status: item.status,
      assignee: item.assignee,
      projectId: item.projectId,
    })),
    recentDocuments: documents.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      category: item.category,
      aiStatus: item.aiStatus,
      updatedAt: item.updatedAt,
    })),
    delivery: {
      builds: builds.map((item) => ({ id: item.id, name: item.name, status: item.status, projectId: item.projectId, version: item.version })),
      releases: releases.map((item) => ({ id: item.id, name: item.name, status: item.status, productId: item.productId, version: item.version })),
    },
  };
}

function buildAiChatPrompt({ messages, attachments, scope, currentPage }) {
  const context = buildAiChatContext();
  const attachmentSummaries = attachments.map((item, index) => ({
    index: index + 1,
    name: item.name,
    kind: item.kind,
    mimeType: item.mimeType,
    size: item.size,
    textPreview: item.contentText ? item.contentText.slice(0, 4000) : "",
    hasImagePayload: item.kind === "image" && Boolean(item.contentBase64),
  }));
  return [
    "你是公司项目管理平台内置 AI 助手。请直接用中文回答用户问题，给出可执行建议。",
    "回答原则：",
    "1. 结合平台当前项目、需求、任务、缺陷、文档、构建和发布数据。",
    "2. 如果用户上传文档，先概括内容，再指出可落地事项和风险。",
    "3. 如果用户上传图片，识别画面或界面问题，并给出改进建议。",
    "4. 不要输出固定的摘要/风险/建议三段模板，按对话自然回答。",
    "5. 数据不足时说明缺口，并给下一步需要补充的信息。",
    `当前页面：${currentPage || "未知"}`,
    `对话范围：${scope || "project-management"}`,
    `平台上下文：${JSON.stringify(context)}`,
    `附件：${JSON.stringify(attachmentSummaries)}`,
    `最近对话：${JSON.stringify(messages)}`,
    `用户最新问题：${messages[messages.length - 1]?.content || ""}`,
  ].join("\n");
}

function localAiChatReply({ messages, attachments }) {
  const latest = messages[messages.length - 1]?.content || "";
  const context = buildAiChatContext();
  const attachmentLine = attachments.length
    ? `我已收到 ${attachments.length} 个附件：${attachments.map((item) => item.name).join("、")}。`
    : "当前没有附件。";
  return [
    "当前 AI Provider 未配置或调用失败，下面是基于平台数据的规则兜底分析：",
    attachmentLine,
    `当前共有 ${context.metrics.projects} 个项目、${context.metrics.requirements} 条需求、${context.metrics.blockedTasks} 个阻塞任务、${context.metrics.openDefects} 个未关闭缺陷。`,
    latest ? `围绕你的问题“${latest.slice(0, 80)}”，建议先检查高风险项目、阻塞任务和未关闭缺陷，再补充文档内容后重新让 AI 做深度判断。` : "你可以继续输入问题，或上传图片/文档让我分析。",
  ].join("\n\n");
}

function localAiChatReplyV2({ messages, attachments }) {
  const latest = messages[messages.length - 1]?.content || "";
  const context = buildAiChatContext();
  const documentAttachments = attachments.filter((item) => item.kind === "document");
  const imageAttachments = attachments.filter((item) => item.kind === "image");
  const documentNotes = documentAttachments
    .map((item, index) => {
      const preview = String(item.contentText || "").replace(/\s+/g, " ").trim().slice(0, 600);
      return preview
        ? `${index + 1}. ${item.name}: ${preview}`
        : `${index + 1}. ${item.name}: 已收到文件，但当前格式未提取到可读正文。`;
    })
    .join("\n");
  const imageNotes = imageAttachments.length
    ? `已收到 ${imageAttachments.length} 张图片：${imageAttachments.map((item) => item.name).join("、")}。当前规则兜底无法识别图片内容，需要真实多模态模型完成视觉分析。`
    : "";
  return [
    "当前 AI Provider 调用失败，下面先给出规则兜底结果。请在系统设置里重新测试连接后，可切回真实模型分析。",
    `平台快照：${context.metrics.projects} 个项目、${context.metrics.requirements} 条需求、${context.metrics.blockedTasks} 个阻塞任务、${context.metrics.openDefects} 个未关闭缺陷。`,
    documentNotes ? `我已读取到文档附件正文预览：\n${documentNotes}` : "",
    imageNotes,
    latest
      ? `围绕你的问题“${latest.slice(0, 120)}”，建议先核对高风险项目、阻塞任务、未关闭缺陷和附件里的验收口径，再补齐缺失负责人、截止时间和交付证据。`
      : "你可以继续输入问题，或上传截图、需求文档、测试记录让我分析。",
  ].filter(Boolean).join("\n\n");
}

async function callRealModel(prompt, options = {}) {
  const config = resolveAiProviderConfig();
  if (!config.enabled) {
    return null;
  }
  if (!config.apiKey || !config.baseUrl || !config.model) {
    return null;
  }
  const system = options.system || "你是企业项目管理平台的分析助手，输出简洁、可审核、可落地的中文内容。";
  const imageAttachments = normalizeAiChatAttachments(options.attachments || []).filter((item) => item.kind === "image");
  const responseUserContent = [
    { type: "input_text", text: prompt },
    ...imageAttachments.map((item) => ({ type: "input_image", image_url: dataUrlForAttachment(item) })).filter((item) => item.image_url),
  ];
  const chatUserContent = [
    { type: "text", text: prompt },
    ...imageAttachments.map((item) => ({ type: "image_url", image_url: { url: dataUrlForAttachment(item) } })).filter((item) => item.image_url.url),
  ];
  const buildBody = (wireApi) => wireApi === "responses"
    ? {
        model: config.model,
        input: [
          { role: "system", content: system },
          { role: "user", content: responseUserContent.length > 1 ? responseUserContent : prompt },
        ],
        temperature: options.temperature ?? 0.2,
        ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
        store: !config.disableResponseStorage,
      }
    : {
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: chatUserContent.length > 1 ? chatUserContent : prompt },
        ],
        temperature: options.temperature ?? 0.2,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      };

  async function requestModel(wireApi) {
    const attemptStarted = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || process.env.AI_TIMEOUT_MS || 30000));
    const endpoint = wireApi === "responses" ? "responses" : "chat/completions";
    let response;
    try {
      response = await fetch(`${config.baseUrl}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(buildBody(wireApi)),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const error = new Error(`AI model request failed: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      recordAiProviderSuccess({ wireApi, latencyMs: Date.now() - attemptStarted });
      return wireApi === "responses"
        ? extractResponsesText(data)
        : data.choices?.[0]?.message?.content || null;
    } catch (error) {
      recordAiProviderFailure(error, { wireApi, latencyMs: Date.now() - attemptStarted });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const requestedWireApi = normalizeAiWireApi(options.wireApi || config.wireApi);
  const primaryWireApi = requestedWireApi === "responses" ? "responses" : "chat_completions";
  try {
    return await requestModel(primaryWireApi);
  } catch (error) {
    const fallbackWireApi = primaryWireApi === "responses" ? "chat_completions" : "responses";
    console.warn(`AI ${primaryWireApi} request failed, retrying ${fallbackWireApi}:`, error.message);
    return requestModel(fallbackWireApi);
  }
}

async function createAiDocumentResult(document) {
  const modelText = await callRealModel(
    [
      "请分析下面的项目文档，只返回严格 JSON，不要 Markdown。",
      "JSON schema:",
      "{",
      '  "summary": "一句话摘要",',
      '  "requirements": [{"title": "需求标题", "priority": "high|medium|low", "acceptanceCriteria": ["验收标准"]}],',
      '  "wbs": [{"title": "任务标题", "estimatedHours": 8, "wbsCode": "1.1"}],',
      '  "apis": [{"method": "GET|POST|PATCH|DELETE", "path": "/api/example", "purpose": "用途"}],',
      '  "risks": ["风险"]',
      "}",
      `文档标题：${document.title}`,
      `文档类型：${document.type}`,
      `内容：${document.content || ""}`,
    ].join("\n"),
    { system: "你是企业项目管理平台的文档分析助手，擅长从需求、设计、标书和测试文档中抽取结构化工作项。" },
  ).catch(() => null);
  if (modelText) {
    const parsed = extractJsonPayload(modelText);
    if (parsed?.summary || parsed?.requirements) return { ...parsed, modelUsed: resolveAiProviderConfig().model };
  }
  // Rule-engine fallback: derive requirements from document title/type/content.
  const docType = document.type || "requirement";
  const docContent = document.content || "";
  const hasContent = docContent.length > 20;
  const estimateByType = { requirement: 16, design: 24, bid: 40, test: 12 };
  const baseHours = estimateByType[docType] || 16;
  return {
    summary: `${document.title} - 基于文档类型“${docType}”的规则引擎分析完成。${hasContent ? `检测到 ${docContent.length} 字内容。` : "文档内容为空或不足。"}建议人工审核后写入正式需求。`,
    modelUsed: "local-rule-engine",
    requirements: [
      {
        title: `${document.title} - ${docType === "bid" ? "投标" : "功能"}需求`,
        priority: docType === "bid" ? "high" : "medium",
        acceptanceCriteria: [
          hasContent ? "提取文档关键目标并确认对齐业务方向" : "补充文档内容后重新分析",
          `验证与现有${docType === "test" ? "测试用例" : "需求"}的关联性`,
          "输出结构化描述供后续任务拆分",
        ],
      },
    ],
    wbs: [
      { title: `${document.title} 需求梳理与分析`, estimatedHours: Math.round(baseHours * 0.25), wbsCode: "1.1" },
      { title: `${document.title} 方案设计`, estimatedHours: Math.round(baseHours * 0.35), wbsCode: "1.2" },
      { title: `${document.title} 开发与测试`, estimatedHours: Math.round(baseHours * 0.4), wbsCode: "1.3" },
    ],
    apis: hasContent
      ? [{ method: "POST", path: "/api/ai/documents/analyze", purpose: "提交文档分析 Job" }]
      : [],
    risks: hasContent
      ? ["分析结果基于规则引擎生成，建议人工核实后写入正式需求。" + (docType === "bid" ? "标书类文档需额外评估合规性。" : "")]
      : ["文档内容为空，分析结果不完整。请上传完整文档后重新分析。"],
  };
}

/**
 * Execute AI document analysis for a job that is already in "queued" state.
 * Transitions: queued -> running -> awaiting_review (success) or failed (error).
 * Also updates the source document's ai_status.
 */
async function runDocumentAnalysis(jobId, document) {
  try {
    run("UPDATE ai_jobs SET status = 'running', progress = 30, current_step = '文档解析中', started_at = @started WHERE job_id = @id", { id: jobId, started: now() });
    const result = await createAiDocumentResult(document);
    const evidence = [{ documentId: document.id, pageNo: 1, quote: document.title }];
    run("UPDATE ai_jobs SET status = 'awaiting_review', progress = 100, current_step = '结构化结果已生成', result = @result, evidence = @evidence, failed_at = NULL, error_message = NULL WHERE job_id = @id", { id: jobId, result: json(result), evidence: json(evidence) });
    run("UPDATE documents SET ai_status = 'awaiting_review' WHERE id = @id", { id: document.id });
    return { status: "awaiting_review", result, evidence };
  } catch (error) {
    run("UPDATE ai_jobs SET status = 'failed', progress = 0, current_step = '分析失败', error_message = @msg, failed_at = @failed WHERE job_id = @id", { id: jobId, msg: error.message || "Unknown error", failed: now() });
    throw error;
  }
}

function requirementScore(requirementId) {
  const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: requirementId });
  if (!requirement) return null;
  // 1) Task completion rate 脳 0.40
  const linkedTasks = rows("SELECT * FROM tasks WHERE requirement_id = @id", { id: requirementId });
  const taskScore = linkedTasks.length ? Math.round(linkedTasks.reduce((sum, task) => sum + task.progress, 0) / linkedTasks.length) : 0;

  // 2) Test pass rate 脳 0.30
  const linkedTests = rows("SELECT * FROM test_cases WHERE requirement_id = @id", { id: requirementId });
  const testScore = linkedTests.length
    ? Math.round(linkedTests.reduce((sum, test) => sum + (test.total_cases > 0 ? (test.passed_cases / test.total_cases) * 100 : 0), 0) / linkedTests.length)
    : 0;

  // 3) Work log progress 脳 0.20 鈥?scan work_logs whose analysis references this requirement
  const allLogs = rows("SELECT analysis FROM work_logs WHERE analysis != ''");
  const matchingLogs = allLogs.filter((log) => {
    const parsed = parse(log.analysis, {});
    const linked = parsed.linkedRequirements || [];
    return linked.some((lr) => (typeof lr === 'object' ? lr.id === requirementId : lr === requirementId));
  });
  const logScore = matchingLogs.length ? Math.min(100, matchingLogs.length * 20) : 0;

  // 4) Manual confirmation 脳 0.10 (stored completion as proxy)
  const manualScore = requirement.completion || 0;

  // Weighted score
  const score = Math.round(taskScore * 0.40 + testScore * 0.30 + logScore * 0.20 + manualScore * 0.10);

  // Hard rules (design doc 搂5)
  const hardRules = [];
  if (linkedTests.length === 0 && score > 80) {
    hardRules.push("No linked tests 鈥?max completion is 80%");
  }
  const openBlockingDefects = rows("SELECT * FROM defects WHERE requirement_id = @id AND status NOT IN ('closed', 'verified', 'rejected')", { id: requirementId });
  if (openBlockingDefects.length > 0 && score > 70) {
    hardRules.push(`Has ${openBlockingDefects.length} open defect(s) 鈥?max completion is 70%`);
  }

  let adjustedScore = score;
  if (linkedTests.length === 0) adjustedScore = Math.min(adjustedScore, 80);
  if (openBlockingDefects.length > 0) adjustedScore = Math.min(adjustedScore, 70);

  return { requirementId, score: adjustedScore, taskScore, testScore, logScore, declaredCompletion: requirement.completion, hardRules: hardRules.length ? hardRules : undefined };
}

function compactText(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function collectAiBusinessSnapshot(scope = "dashboard") {
  return {
    scope,
    projects: rows("SELECT id, name, status, health_score, progress, risk_count, owner FROM projects ORDER BY risk_count DESC, health_score ASC LIMIT 12")
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        healthScore: item.health_score,
        progress: item.progress,
        riskCount: item.risk_count,
        owner: item.owner,
      })),
    requirements: rows("SELECT id, title, status, priority, completion, project_id, owner, assignee FROM requirements WHERE priority = 'high' OR completion < 80 ORDER BY priority ASC, completion ASC LIMIT 25")
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        completion: item.completion,
        projectId: item.project_id,
        owner: item.owner,
        assignee: item.assignee,
      })),
    tasks: rows("SELECT id, title, status, project_id, requirement_id, owner, progress, blocker, due_date FROM tasks WHERE status NOT IN ('done', 'cancelled') ORDER BY CASE WHEN blocker IS NULL OR blocker = '' THEN 1 ELSE 0 END, due_date ASC LIMIT 25")
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        projectId: item.project_id,
        requirementId: item.requirement_id,
        owner: item.owner,
        progress: item.progress,
        blocker: item.blocker,
        dueDate: item.due_date,
      })),
    defects: rows("SELECT id, title, severity, status, project_id, requirement_id, assignee FROM defects WHERE status NOT IN ('closed', 'verified', 'rejected') ORDER BY severity DESC, id LIMIT 25")
      .map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        status: item.status,
        projectId: item.project_id,
        requirementId: item.requirement_id,
        assignee: item.assignee,
      })),
    workLogs: rows("SELECT author, project, content, blockers, next_plan, created_at FROM work_logs ORDER BY created_at DESC LIMIT 10")
      .map((item) => ({
        author: item.author,
        project: item.project,
        content: compactText(item.content),
        blockers: compactText(item.blockers),
        nextPlan: compactText(item.next_plan),
        createdAt: item.created_at,
      })),
    aiJobs: rows("SELECT job_id, scene, status, progress, current_step, error_message, created_at FROM ai_jobs ORDER BY created_at DESC LIMIT 10")
      .map((item) => ({
        jobId: item.job_id,
        scene: item.scene,
        status: item.status,
        progress: item.progress,
        currentStep: item.current_step,
        errorMessage: item.error_message,
        createdAt: item.created_at,
      })),
    builds: rows("SELECT id, name, version, status, project_id, build_date, notes FROM builds ORDER BY created_at DESC LIMIT 10")
      .map((item) => ({
        id: item.id,
        name: item.name,
        version: item.version,
        status: item.status,
        projectId: item.project_id,
        buildDate: item.build_date,
        notes: compactText(item.notes),
      })),
    releases: rows("SELECT id, name, version, status, product_id, release_date, release_notes FROM releases ORDER BY created_at DESC LIMIT 10")
      .map((item) => ({
        id: item.id,
        name: item.name,
        version: item.version,
        status: item.status,
        productId: item.product_id,
        releaseDate: item.release_date,
        releaseNotes: compactText(item.release_notes),
      })),
  };
}

function buildLocalAiSummary(scope, metrics, snapshot) {
  const riskyProjects = snapshot.projects.filter((item) => (item.riskCount || 0) > 0 || item.healthScore < 70);
  const blockedTasks = snapshot.tasks.filter((item) => item.status === "blocked" || item.blocker);
  const openDefects = snapshot.defects.filter((item) => !["closed", "verified", "rejected"].includes(item.status));
  const lowCompletionReqs = snapshot.requirements.filter((item) => item.priority === "high" && item.completion < 70);
  const risks = [
    ...riskyProjects.slice(0, 2).map((item) => `${item.name} 健康度 ${item.healthScore}，风险数 ${item.riskCount}，需要关注交付稳定性。`),
    ...blockedTasks.slice(0, 2).map((item) => `${item.title} 存在阻塞：${item.blocker || item.status}`),
    ...openDefects.slice(0, 2).map((item) => `${item.id} ${item.severity} 缺陷仍未关闭：${item.title}`),
    ...lowCompletionReqs.slice(0, 2).map((item) => `${item.id} 高优先级需求完成度仅 ${item.completion}%。`),
  ].slice(0, 5);
  const recommendations = [
    blockedTasks.length ? "优先为阻塞任务明确责任人与解决时限。" : "",
    openDefects.length ? "发布前先收敛未关闭缺陷，并补齐回归验证记录。" : "",
    lowCompletionReqs.length ? "高优先级需求需要补充拆解任务、测试证据和验收标准。" : "",
    metrics.awaitingReview ? "及时审核 AI 结构化结果，避免分析结果停留在待确认状态。" : "",
  ].filter(Boolean);
  return {
    title: scope === "requirements" ? "需求智能分析" : scope === "projects" ? "项目智能分析" : "AI 实时分析",
    summary: `基于当前 ${snapshot.projects.length} 个项目、${snapshot.requirements.length} 条需求、${snapshot.tasks.length} 个任务、${openDefects.length} 个未关闭缺陷生成。${risks.length ? "系统检测到需要人工介入的风险点。" : "当前未检测到明显高风险项。"}`,
    risks: risks.length ? risks : ["当前数据未显示明显阻塞，建议持续维护工作日志和测试证据。"],
    recommendations: recommendations.length ? recommendations : ["保持需求、任务、缺陷与日志数据同步，便于 AI 持续识别风险。"],
    generatedBy: "local-rule-engine",
    modelUsed: "local-rule-engine",
  };
}

function normalizeAiSummaryPayload(value, fallback) {
  return {
    title: value?.title ? String(value.title).slice(0, 60) : fallback.title,
    summary: value?.summary ? String(value.summary).slice(0, 800) : fallback.summary,
    risks: Array.isArray(value?.risks) && value.risks.length ? value.risks.map(String).slice(0, 6) : fallback.risks,
    recommendations: Array.isArray(value?.recommendations) && value.recommendations.length
      ? value.recommendations.map(String).slice(0, 6)
      : fallback.recommendations,
    generatedBy: value?.generatedBy || "real-model",
    modelUsed: value?.modelUsed || resolveAiProviderConfig().model,
  };
}

const aiSummaryCache = new Map();

function buildAiSummarySignals(snapshot) {
  return {
    riskyProjects: snapshot.projects
      .filter((item) => (item.riskCount || 0) > 0 || item.healthScore < 75)
      .slice(0, 5)
      .map((item) => `${item.id || item.name} ${item.name}: 健康度${item.healthScore}, 进度${item.progress}%, 风险${item.riskCount}, 状态${item.status}`),
    blockedTasks: snapshot.tasks
      .filter((item) => item.status === "blocked" || item.blocker)
      .slice(0, 5)
      .map((item) => `${item.id} ${item.title}: ${item.blocker || item.status}, 负责人${item.owner || "未指定"}`),
    weakRequirements: snapshot.requirements
      .filter((item) => item.priority === "high" || item.completion < 70)
      .slice(0, 6)
      .map((item) => `${item.id} ${item.title}: ${item.priority}, 完成${item.completion}%, 状态${item.status}`),
    openDefects: snapshot.defects
      .slice(0, 6)
      .map((item) => `${item.id} ${item.title}: ${item.severity}, ${item.status}, 负责人${item.assignee || "未指定"}`),
    recentLogs: snapshot.workLogs
      .slice(0, 5)
      .map((item) => `${item.author}/${item.project || "未关联项目"}: ${compactText([item.content, item.blockers, item.nextPlan].filter(Boolean).join("；"), 120)}`),
    delivery: [
      ...snapshot.builds.slice(0, 3).map((item) => `构建 ${item.id} ${item.name} ${item.version || ""}: ${item.status}`),
      ...snapshot.releases.slice(0, 3).map((item) => `发布 ${item.id} ${item.name} ${item.version || ""}: ${item.status}`),
    ],
  };
}

async function createAiSummary(scope, metrics, options = {}) {
  const cacheKey = `${scope || "dashboard"}:${options.cacheKey || "global"}`;
  const cached = aiSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 90 * 1000) return cached.value;
  const snapshot = options.snapshot || collectAiBusinessSnapshot(scope);
  const fallback = buildLocalAiSummary(scope, metrics, snapshot);
  const signals = buildAiSummarySignals(snapshot);
  const prompt = [
    "只返回 JSON，不要 Markdown。",
    '格式：{"title":"短标题","summary":"80字以内中文摘要","risks":["风险1","风险2","风险3"],"recommendations":["建议1","建议2","建议3"]}',
    `范围：${scope || "dashboard"}`,
    `指标：${JSON.stringify(metrics)}`,
    `信号：${JSON.stringify(signals)}`,
  ].join("\n");
  const modelOptions = {
    system: "你是项目管理 AI 分析官。必须依据输入的真实系统信号输出，不编造编号。",
    maxTokens: 500,
    timeoutMs: options.timeoutMs || 12000,
  };
  const resolveValue = async () => {
    const modelText = await callRealModel(prompt, modelOptions).catch(() => null);
    const parsed = extractJsonPayload(modelText);
    return parsed
      ? normalizeAiSummaryPayload({ ...parsed, modelUsed: resolveAiProviderConfig().model }, fallback)
      : fallback;
  };
  if (options.backgroundRefresh) {
    setTimeout(() => {
      resolveValue()
        .then((value) => aiSummaryCache.set(cacheKey, { createdAt: Date.now(), value }))
        .catch(() => aiSummaryCache.set(cacheKey, { createdAt: Date.now(), value: fallback }));
    }, 0);
    return { ...fallback, generatedBy: "local-rule-engine", refreshing: true };
  }
  const value = await resolveValue();
  aiSummaryCache.set(cacheKey, { createdAt: Date.now(), value });
  return value;
}

async function createAiRequirementRecommendation(score) {
  const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: score.requirementId });
  if (!requirement) return "需求不存在，无法生成 AI 建议。";
  const tasks = rows("SELECT id, title, status, progress, blocker FROM tasks WHERE requirement_id = @id", { id: score.requirementId });
  const tests = rows("SELECT id, name, status, total_cases, passed_cases, failed_cases, blocked_cases FROM test_cases WHERE requirement_id = @id", { id: score.requirementId });
  const defects = rows("SELECT id, title, severity, status FROM defects WHERE requirement_id = @id", { id: score.requirementId });
  const fallback = "请结合任务进度、测试通过率、缺陷关闭情况和日志证据后再确认完成度。";
  const modelText = await callRealModel(
    [
      "请基于需求完成度评分数据生成一段中文建议，只返回严格 JSON。",
      'JSON schema: {"recommendation": "80字以内建议"}',
      `需求：${JSON.stringify(mapRequirement(requirement))}`,
      `评分：${JSON.stringify(score)}`,
      `任务：${JSON.stringify(tasks)}`,
      `测试：${JSON.stringify(tests)}`,
      `缺陷：${JSON.stringify(defects)}`,
    ].join("\n"),
    { system: "你是需求验收和质量分析助手，输出可执行、简洁的完成度建议。" },
  ).catch(() => null);
  const parsed = extractJsonPayload(modelText);
  return parsed?.recommendation ? String(parsed.recommendation).slice(0, 240) : fallback;
}

function normalizeBusinessAdvicePayload(value, fallback) {
  const arrayOfText = (input, limit = 6) => Array.isArray(input)
    ? input.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
    : [];
  return {
    title: value?.title ? String(value.title).slice(0, 80) : fallback.title,
    summary: value?.summary ? String(value.summary).slice(0, 1200) : fallback.summary,
    risks: arrayOfText(value?.risks).length ? arrayOfText(value.risks) : fallback.risks,
    suggestions: arrayOfText(value?.suggestions).length ? arrayOfText(value.suggestions) : fallback.suggestions,
    nextActions: arrayOfText(value?.nextActions).length ? arrayOfText(value.nextActions) : fallback.nextActions,
    missingInfo: arrayOfText(value?.missingInfo, 5),
    modelUsed: value?.modelUsed || fallback.modelUsed,
    generatedBy: value?.generatedBy || fallback.generatedBy,
    fallback: Boolean(value?.fallback ?? fallback.fallback),
  };
}

function loadBusinessAdviceContext(targetType, targetId) {
  if (targetType === "requirement") {
    const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: targetId });
    if (!requirement) return null;
    return {
      target: mapRequirement(requirement),
      score: requirementScore(targetId),
      tasks: rows("SELECT * FROM tasks WHERE requirement_id = @id ORDER BY sort_order", { id: targetId }).map(mapTask),
      tests: rows("SELECT * FROM test_cases WHERE requirement_id = @id ORDER BY id", { id: targetId }).map(mapTestCase),
      defects: rows("SELECT * FROM defects WHERE requirement_id = @id ORDER BY id", { id: targetId }).map(mapDefect),
      project: requirement.project_id ? (() => {
        const project = row("SELECT * FROM projects WHERE id = @id", { id: requirement.project_id });
        return project ? mapProject(project) : null;
      })() : null,
    };
  }
  if (targetType === "project") {
    const project = row("SELECT * FROM projects WHERE id = @id", { id: targetId });
    if (!project) return null;
    return {
      target: mapProject(project),
      requirements: rows("SELECT * FROM requirements WHERE project_id = @id ORDER BY id", { id: targetId }).map(mapRequirement),
      tasks: rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: targetId }).map(mapTask),
      tests: rows("SELECT * FROM test_cases WHERE project_id = @id ORDER BY id", { id: targetId }).map(mapTestCase),
      defects: rows("SELECT * FROM defects WHERE project_id = @id ORDER BY id", { id: targetId }).map(mapDefect),
      builds: rows("SELECT * FROM builds WHERE project_id = @id ORDER BY created_at DESC", { id: targetId }).map(mapBuild),
    };
  }
  if (targetType === "defect") {
    const defect = row("SELECT * FROM defects WHERE id = @id", { id: targetId });
    if (!defect) return null;
    return {
      target: mapDefect(defect),
      requirement: defect.requirement_id ? (() => {
        const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: defect.requirement_id });
        return requirement ? mapRequirement(requirement) : null;
      })() : null,
      build: defect.found_in_build ? (() => {
        const build = row("SELECT * FROM builds WHERE id = @id", { id: defect.found_in_build });
        return build ? mapBuild(build) : null;
      })() : null,
      relatedTasks: rows("SELECT * FROM tasks WHERE source_type = 'defect' AND source_id = @id", { id: targetId }).map(mapTask),
    };
  }
  if (targetType === "test_case") {
    const testCase = row("SELECT * FROM test_cases WHERE id = @id", { id: targetId });
    if (!testCase) return null;
    return {
      target: mapTestCase(testCase),
      requirement: testCase.requirement_id ? (() => {
        const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: testCase.requirement_id });
        return requirement ? mapRequirement(requirement) : null;
      })() : null,
      defects: testCase.requirement_id
        ? rows("SELECT * FROM defects WHERE requirement_id = @id ORDER BY id", { id: testCase.requirement_id }).map(mapDefect)
        : [],
      runs: rows("SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC LIMIT 12", { id: targetId }).map(mapTestRun),
      relatedTasks: rows("SELECT * FROM tasks WHERE source_type = 'test_case' AND source_id = @id", { id: targetId }).map(mapTask),
    };
  }
  if (targetType === "build") {
    const build = row("SELECT * FROM builds WHERE id = @id", { id: targetId });
    if (!build) return null;
    return {
      target: mapBuild(build),
      gates: evaluateBuildDeliveryGates(build),
      readiness: loadRequirementReadiness(normalizeIdList(build.linked_stories)),
      linkedDefects: loadLinkedDefects(normalizeIdList(build.linked_bugs)),
    };
  }
  if (targetType === "release") {
    const release = row("SELECT * FROM releases WHERE id = @id", { id: targetId });
    if (!release) return null;
    return {
      target: mapRelease(release),
      gates: evaluateReleaseDeliveryGates(release),
      report: buildReleaseReport(release),
    };
  }
  if (targetType === "document") {
    const document = row("SELECT * FROM documents WHERE id = @id", { id: targetId });
    if (!document) return null;
    return {
      target: mapDocument(document),
      contentPreview: compactText(document.content, 5000),
      aiJobs: rows("SELECT * FROM ai_jobs WHERE source_type = 'document' AND source_id = @id ORDER BY created_at DESC LIMIT 5", { id: targetId }),
    };
  }
  return null;
}

function compactBusinessAdviceContext(targetType, context) {
  const compactTask = (item) => ({
    id: item.id,
    title: compactText(item.title, 120),
    status: item.status,
    progress: item.progress,
    remainingHours: item.remainingHours,
    blocker: compactText(item.blocker, 120),
    requirementId: item.requirementId,
  });
  const compactDefect = (item) => ({
    id: item.id,
    title: compactText(item.title, 120),
    severity: item.severity,
    status: item.status,
    requirementId: item.requirementId,
    foundInBuild: item.foundInBuild,
    assignee: item.assignee,
  });
  const compactTest = (item) => ({
    id: item.id,
    name: compactText(item.name || item.title, 120),
    status: item.status,
    totalCases: item.totalCases,
    passedCases: item.passedCases,
    failedCases: item.failedCases,
    blockedCases: item.blockedCases,
    requirementId: item.requirementId,
  });

  if (targetType === "requirement") {
    return {
      target: context.target,
      score: context.score,
      project: context.project ? { id: context.project.id, name: context.project.name, status: context.project.status, healthScore: context.project.healthScore } : null,
      tasks: context.tasks.slice(0, 12).map(compactTask),
      tests: context.tests.slice(0, 12).map(compactTest),
      defects: context.defects.slice(0, 12).map(compactDefect),
    };
  }
  if (targetType === "project") {
    return {
      target: context.target,
      requirements: context.requirements.slice(0, 15).map((item) => ({ id: item.id, title: compactText(item.title, 120), status: item.status, priority: item.priority, completion: item.completion })),
      tasks: context.tasks.slice(0, 15).map(compactTask),
      tests: context.tests.slice(0, 15).map(compactTest),
      defects: context.defects.slice(0, 15).map(compactDefect),
      builds: context.builds.slice(0, 8).map((item) => ({ id: item.id, name: compactText(item.name, 120), status: item.status, version: item.version })),
    };
  }
  if (targetType === "defect") {
    return {
      target: context.target,
      requirement: context.requirement ? { id: context.requirement.id, title: compactText(context.requirement.title, 120), status: context.requirement.status, completion: context.requirement.completion } : null,
      build: context.build ? { id: context.build.id, name: compactText(context.build.name, 120), status: context.build.status, version: context.build.version } : null,
      relatedTasks: context.relatedTasks.slice(0, 8).map(compactTask),
    };
  }
  if (targetType === "test_case") {
    return {
      target: context.target,
      requirement: context.requirement ? { id: context.requirement.id, title: compactText(context.requirement.title, 120), status: context.requirement.status, completion: context.requirement.completion } : null,
      defects: context.defects.slice(0, 8).map(compactDefect),
      runs: context.runs.slice(0, 8).map((item) => ({ id: item.id, result: item.result, notes: compactText(item.notes, 120), executedBy: item.executedBy, createdAt: item.createdAt })),
      relatedTasks: context.relatedTasks.slice(0, 8).map(compactTask),
    };
  }
  if (targetType === "build") {
    return {
      target: context.target,
      gate: {
        ready: context.gates.ready,
        score: context.gates.score,
        summary: context.gates.summary,
        blocked: context.gates.gates.filter((item) => !item.passed).map((item) => ({ id: item.id, label: item.label, message: item.message })),
      },
      readiness: {
        notReady: context.readiness.notReady?.map((item) => ({ id: item.id, status: item.status })) || [],
        unfinishedTasks: context.readiness.unfinishedTasks?.map(compactTask) || [],
        missingTests: context.readiness.missingTests || [],
        testsWithIssues: context.readiness.testsWithIssues?.map(compactTest) || [],
        openDefects: context.readiness.openDefects?.map(compactDefect) || [],
      },
      linkedDefects: context.linkedDefects,
    };
  }
  if (targetType === "release") {
    return {
      target: context.target,
      gate: {
        ready: context.gates.ready,
        score: context.gates.score,
        summary: context.gates.summary,
        blocked: context.gates.gates.filter((item) => !item.passed).map((item) => ({ id: item.id, label: item.label, message: item.message })),
      },
      report: context.report ? {
        metrics: context.report.metrics,
        summary: context.report.summary,
        recommendations: context.report.recommendations,
        build: context.report.build ? { id: context.report.build.id, name: compactText(context.report.build.name, 120), status: context.report.build.status } : null,
      } : null,
    };
  }
  if (targetType === "document") {
    return {
      target: {
        id: context.target.id,
        title: compactText(context.target.title, 160),
        type: context.target.type,
        category: context.target.category,
        aiStatus: context.target.aiStatus,
        owner: context.target.owner,
        projectId: context.target.projectId,
        linkedRequirements: context.target.linkedRequirements,
        risks: context.target.risks,
      },
      contentPreview: compactText(context.contentPreview, 1600),
      aiJobs: context.aiJobs.slice(0, 5).map((item) => ({ jobId: item.job_id, status: item.status, currentStep: item.current_step, errorMessage: compactText(item.error_message, 160) })),
    };
  }
  return context;
}

function buildLocalBusinessAdvice(targetType, targetId, context) {
  const risks = [];
  const suggestions = [];
  const nextActions = [];
  if (targetType === "requirement") {
    const score = context.score;
    const openDefects = context.defects.filter((item) => !CLOSED_DEFECT_STATUSES.has(item.status));
    const unfinishedTasks = context.tasks.filter((item) => !CLOSED_TASK_STATUSES.has(item.status) || Number(item.remainingHours || 0) > 0 || item.blocker);
    const failingTests = context.tests.filter((item) => item.failedCases > 0 || item.blockedCases > 0 || item.status === "failed" || item.status === "blocked");
    if (score?.hardRules?.length) risks.push(...score.hardRules);
    if (openDefects.length) risks.push(`仍有 ${openDefects.length} 个未关闭缺陷。`);
    if (unfinishedTasks.length) risks.push(`仍有 ${unfinishedTasks.length} 个任务未闭环。`);
    if (failingTests.length) risks.push(`仍有 ${failingTests.length} 个测试失败或阻塞。`);
    suggestions.push("先补齐验收标准、测试证据和任务剩余工时，再推进验收。");
    nextActions.push("确认需求状态、关闭阻塞任务、补充通过测试记录。");
  } else if (targetType === "build" || targetType === "release") {
    const blocked = context.gates?.gates?.filter((item) => !item.passed) || [];
    risks.push(...blocked.slice(0, 5).map((item) => `${item.label}：${item.message}`));
    suggestions.push(blocked.length ? "优先处理未通过门禁，再进入下一状态。" : "门禁已通过，保留审批、回滚和验证记录。");
    nextActions.push(blocked.length ? `处理 ${blocked.length} 项阻断门禁。` : "执行发布后验证并记录结论。");
  } else if (targetType === "test_case") {
    const hasFailed = Number(context.target.failedCases || 0) > 0 || context.target.status === "failed";
    const hasBlocked = Number(context.target.blockedCases || 0) > 0 || context.target.status === "blocked";
    if (hasFailed) risks.push("测试用例存在失败记录，需要关联缺陷或补充修复验证。");
    if (hasBlocked) risks.push("测试用例存在阻塞记录，需要明确阻塞原因和责任人。");
    if (!context.runs.length) risks.push("测试用例还没有执行记录。");
    suggestions.push("补齐测试步骤、预期结果、执行记录和缺陷关联，确保验收证据完整。");
    nextActions.push("执行一次最新测试，并把失败/阻塞结果同步到缺陷闭环。");
  } else if (targetType === "project") {
    const openDefects = context.defects.filter((item) => !CLOSED_DEFECT_STATUSES.has(item.status));
    const blockedTasks = context.tasks.filter((item) => item.status === "blocked" || item.blocker);
    if (openDefects.length) risks.push(`项目仍有 ${openDefects.length} 个未关闭缺陷。`);
    if (blockedTasks.length) risks.push(`项目仍有 ${blockedTasks.length} 个阻塞任务。`);
    suggestions.push("按需求优先级收敛任务、测试和缺陷，避免交付阶段集中暴露风险。");
    nextActions.push("召开一次需求-测试-缺陷对齐会，确认本周交付边界。");
  } else {
    suggestions.push("补充所属项目、负责人、验收证据和关联工作项，提升 AI 分析质量。");
    nextActions.push("把该对象关联到需求、任务、测试或发布链路中。");
  }
  return {
    title: `${targetId} 业务 AI 建议`,
    summary: `基于 ${targetType} 对象和当前平台数据生成规则兜底分析。`,
    risks: risks.length ? risks : ["当前未发现明显阻断，但仍需保持数据同步。"],
    suggestions,
    nextActions,
    missingInfo: [],
    modelUsed: "local-rule-engine",
    generatedBy: "local-rule-engine",
    fallback: true,
  };
}

async function createBusinessAdvice({ targetType, targetId, question, draft }) {
  const context = loadBusinessAdviceContext(targetType, targetId);
  if (!context) return null;
  const fallback = buildLocalBusinessAdvice(targetType, targetId, context);
  const modelContext = compactBusinessAdviceContext(targetType, context);
  const prompt = [
    "请基于真实业务对象生成项目管理建议，只返回严格 JSON，不要 Markdown。",
    'JSON schema: {"title":"短标题","summary":"分析摘要","risks":["风险"],"suggestions":["建议"],"nextActions":["下一步动作"],"missingInfo":["缺少的信息"]}',
    "要求：建议必须具体、可执行，不编造不存在的编号；如果数据不足，放入 missingInfo。",
    `对象类型：${targetType}`,
    `对象 ID：${targetId}`,
    `用户问题：${question || "请分析当前对象的交付风险和下一步动作"}`,
    `当前草稿：${JSON.stringify(draft || {})}`,
    `业务上下文：${JSON.stringify(modelContext)}`,
  ].join("\n");
  const modelText = await callRealModel(prompt, {
    system: "你是嵌入项目管理系统的业务分析 AI，必须依据输入数据输出可审计的中文建议。",
    maxTokens: 900,
    timeoutMs: 60000,
    wireApi: "chat_completions",
  }).catch((error) => {
    console.warn(`AI business advice fallback for ${targetType}:${targetId}:`, error.message);
    return null;
  });
  const plainModelText = modelText ? null : await callRealModel([
    "请作为项目管理系统内嵌 AI，用中文直接给出简短、可执行的业务建议。",
    "不要输出代码或 JSON。请覆盖：当前判断、主要风险、建议动作、缺少信息。",
    `对象类型：${targetType}`,
    `对象 ID：${targetId}`,
    `用户问题：${question || "请分析当前对象的交付风险和下一步动作"}`,
    `上下文摘要：${compactText(JSON.stringify(modelContext), 2800)}`,
  ].join("\n"), {
    system: "你是项目管理业务分析助手，回答要务实、具体、可审计。",
    maxTokens: 700,
    timeoutMs: 60000,
  }).catch((error) => {
    console.warn(`AI business advice plain fallback for ${targetType}:${targetId}:`, error.message);
    return null;
  });
  const parsed = extractJsonPayload(modelText);
  if (!parsed && modelText) {
    return normalizeBusinessAdvicePayload({
      title: fallback.title,
      summary: String(modelText).slice(0, 1200),
      risks: fallback.risks,
      suggestions: fallback.suggestions,
      nextActions: fallback.nextActions,
      missingInfo: [],
      modelUsed: resolveAiProviderConfig().model,
      generatedBy: resolveAiProviderConfig().provider,
      fallback: false,
    }, fallback);
  }
  if (!parsed && plainModelText) {
    return normalizeBusinessAdvicePayload({
      title: fallback.title,
      summary: String(plainModelText).slice(0, 1200),
      risks: fallback.risks,
      suggestions: fallback.suggestions,
      nextActions: fallback.nextActions,
      missingInfo: [],
      modelUsed: resolveAiProviderConfig().model,
      generatedBy: resolveAiProviderConfig().provider,
      fallback: false,
    }, fallback);
  }
  return normalizeBusinessAdvicePayload(
    parsed ? { ...parsed, modelUsed: resolveAiProviderConfig().model, generatedBy: resolveAiProviderConfig().provider, fallback: false } : fallback,
    fallback,
  );
}

app.get("/api/health", (req, res) => res.json(ok({ status: "ok", service: "company-project-management-api", database: "sqlite", uptime: Math.round(process.uptime()) })));

app.post("/api/auth/login", authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = row("SELECT * FROM users WHERE email = @email", { email });
  if (!user || !bcrypt.compareSync(String(password || ""), user.password_hash)) {
    audit(null, "auth.login_failed", "user", email, null, { email }, req.ip);
    return fail(res, 401, "INVALID_CREDENTIALS", "账号或密码错误。");
  }
  if (user.status === "disabled") {
    audit(null, "auth.login_disabled", "user", email, null, { email }, req.ip);
    return fail(res, 403, "ACCOUNT_DISABLED", "该账号已被禁用，请联系管理员。");
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  audit(publicUser(user), "auth.login", "user", user.id, null, { email }, req.ip);
  res.json(ok({ token, user: publicUser(user) }));
});

app.get("/api/auth/me", (req, res) => res.json(ok(req.user)));
app.get("/api/auth/capabilities", (req, res) => res.json(ok(req.user.capabilities || buildCapabilities(req.user))));
app.patch("/api/auth/me", (req, res) => {
  const before = row("SELECT * FROM users WHERE id = @id", { id: req.user.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : before.name;
  const email = req.body?.email !== undefined ? String(req.body.email).trim() : before.email;
  const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : before.phone || "";
  const position = req.body?.position !== undefined ? String(req.body.position).trim() : before.position || "";
  const department = req.body?.department !== undefined ? String(req.body.department).trim() : before.department || "";
  const bio = req.body?.bio !== undefined ? String(req.body.bio).trim() : before.bio || "";

  if (!name) return fail(res, 400, "VALIDATION_FAILED", "姓名不能为空。");
  if (!email) return fail(res, 400, "VALIDATION_FAILED", "邮箱不能为空。");
  const duplicate = row("SELECT id FROM users WHERE email = @email AND id != @id", { email, id: req.user.id });
  if (duplicate) return fail(res, 409, "CONFLICT", "该邮箱已被其他用户使用。");

  run(
    `UPDATE users
     SET name = @name, email = @email, phone = @phone, position = @position, department = @department, bio = @bio
     WHERE id = @id`,
    { id: req.user.id, name, email, phone, position, department, bio },
  );
  const after = row("SELECT * FROM users WHERE id = @id", { id: req.user.id });
  audit(publicUser(after), "user.profile_update", "user", req.user.id, publicUser(before), publicUser(after), req.ip);
  res.json(ok(publicUser(after)));
});
app.get("/api/audit-logs", requirePermission("audit:read"), (req, res) => {
  const {
    keyword,
    actor,
    action,
    resourceType,
    dateFrom,
    dateTo,
    includePageViews,
  } = req.query;
  const clauses = [];
  const params = {};
  if (actor) {
    clauses.push("actor_name = @actor");
    params.actor = String(actor);
  }
  if (action) {
    clauses.push("action LIKE @action");
    params.action = `${String(action)}%`;
  }
  if (resourceType) {
    clauses.push("resource_type = @resourceType");
    params.resourceType = String(resourceType);
  }
  if (dateFrom) {
    clauses.push("created_at >= @dateFrom");
    params.dateFrom = `${String(dateFrom).slice(0, 10)}T00:00:00.000Z`;
  }
  if (dateTo) {
    clauses.push("created_at <= @dateTo");
    params.dateTo = `${String(dateTo).slice(0, 10)}T23:59:59.999Z`;
  }
  if (includePageViews !== "1") {
    clauses.push("action != 'page.view'");
  }
  if (keyword) {
    clauses.push("(actor_name LIKE @keyword OR action LIKE @keyword OR resource_type LIKE @keyword OR resource_id LIKE @keyword)");
    params.keyword = `%${String(keyword).trim()}%`;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const allItems = rows(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 1000`, params)
    .map((item) => ({ ...item, before: parse(item.before_json), after: parse(item.after_json) }));
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});

app.get("/api/dashboard", async (req, res, next) => {
  try {
    res.json(ok(await buildDashboard({ user: req.user })));
  } catch (error) {
    next(error);
  }
});
app.get("/api/dashboard/personal", async (req, res, next) => {
  try {
    res.json(ok(await buildDashboard({ owner: req.user?.name, user: req.user })));
  } catch (error) {
    next(error);
  }
});

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
  const { name, owner, status, progress, programId, productId, processMode, code, description, startDate, endDate, sourcePath } = req.body || {};
  if (!name || !owner) return fail(res, 400, "VALIDATION_FAILED", "Project name and owner are required.");
  const project = {
    id: nextId("PRJ", "projects"),
    name: String(name).trim(),
    code: code || null,
    description: description || null,
    status: status || "planning",
    health_score: 80,
    owner: String(owner).trim(),
    program_id: programId || null,
    product_id: productId || null,
    process_mode: processMode || "scrum",
    progress: Number(progress) || 0,
    risk_count: 0,
    milestones: json([{ name: "Project kickoff", status: "planned", date: now().slice(0, 10) }]),
    start_date: startDate || null,
    end_date: endDate || null,
    source_path: sourcePath || null,
    updated_at: now(),
  };
  insert("projects", project);
  audit(req.user, "project.create", "project", project.id, null, project, req.ip);
  res.status(201).json(ok(mapProject(row("SELECT * FROM projects WHERE id = @id", { id: project.id }))));
});
app.patch("/api/projects/:id/status", requirePermission("project:*"), (req, res) => {
  if (!req.body.status || !PROJECT_STATUSES.includes(req.body.status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${PROJECT_STATUSES.join(", ")}`);
  }
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  run("UPDATE projects SET status = @status, updated_at = @updatedAt WHERE id = @id", { id: req.params.id, status: req.body.status, updatedAt: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.status_update", "project", req.params.id, before, after, req.ip);
  res.json(ok(mapProject(after)));
});

app.patch("/api/projects/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const { name, code, description, owner, status, progress, processMode, programId, productId, milestones, startDate, endDate, sourcePath } = req.body || {};
  if (status !== undefined) {
    if (!PROJECT_STATUSES.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${PROJECT_STATUSES.join(", ")}`);
    }
  }
  if (name !== undefined) run("UPDATE projects SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (code !== undefined) run("UPDATE projects SET code = @code WHERE id = @id", { id: req.params.id, code: code || null });
  if (description !== undefined) run("UPDATE projects SET description = @desc WHERE id = @id", { id: req.params.id, desc: description || null });
  if (owner !== undefined) run("UPDATE projects SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (status !== undefined) run("UPDATE projects SET status = @status WHERE id = @id", { id: req.params.id, status });
  if (progress !== undefined) run("UPDATE projects SET progress = @progress WHERE id = @id", { id: req.params.id, progress: Number(progress) });
  if (processMode !== undefined) run("UPDATE projects SET process_mode = @mode WHERE id = @id", { id: req.params.id, mode: processMode });
  if (programId !== undefined) run("UPDATE projects SET program_id = @pid WHERE id = @id", { id: req.params.id, pid: programId || null });
  if (productId !== undefined) run("UPDATE projects SET product_id = @pid WHERE id = @id", { id: req.params.id, pid: productId || null });
  if (milestones !== undefined) run("UPDATE projects SET milestones = @ms WHERE id = @id", { id: req.params.id, ms: JSON.stringify(milestones) });
  if (startDate !== undefined) run("UPDATE projects SET start_date = @sd WHERE id = @id", { id: req.params.id, sd: startDate || null });
  if (endDate !== undefined) run("UPDATE projects SET end_date = @ed WHERE id = @id", { id: req.params.id, ed: endDate || null });
  if (sourcePath !== undefined) run("UPDATE projects SET source_path = @sp WHERE id = @id", { id: req.params.id, sp: sourcePath || null });
  run("UPDATE projects SET updated_at = @updated WHERE id = @id", { id: req.params.id, updated: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.update", "project", req.params.id, before, after, req.ip);
  res.json(ok(mapProject(after)));
});

app.delete("/api/projects/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  run("DELETE FROM tasks WHERE project_id = @id", { id: req.params.id });
  run("DELETE FROM sprints WHERE project_id = @id", { id: req.params.id });
  run("DELETE FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.delete", "project", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
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

app.get("/api/projects/:id/members", (req, res) => {
  const project = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const members = rows("SELECT * FROM project_members WHERE project_id = @projectId ORDER BY created_at DESC", { projectId: req.params.id })
    .map((item) => ({
      id: item.id,
      projectId: item.project_id,
      userName: item.user_name,
      role: item.role,
      source: item.source,
      createdAt: item.created_at,
    }));
  res.json(ok(members));
});

app.post("/api/projects/:id/members", requirePermission("project:*"), (req, res) => {
  const project = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const userName = String(req.body?.userName || "").trim();
  const role = normalizeRole(req.body?.role);
  if (!userName) return fail(res, 400, "VALIDATION_FAILED", "userName is required.");
  if (!["pdm", "dev", "qa"].includes(role)) return fail(res, 400, "VALIDATION_FAILED", "role must be pdm, dev, or qa.");
  const existing = row(
    "SELECT * FROM project_members WHERE project_id = @projectId AND user_name = @userName AND role = @role",
    { projectId: req.params.id, userName, role },
  );
  if (existing) {
    return res.json(ok({
      id: existing.id,
      projectId: existing.project_id,
      userName: existing.user_name,
      role: existing.role,
      source: existing.source,
      createdAt: existing.created_at,
    }));
  }
  const member = {
    id: nextId("PMEM", "project_members"),
    project_id: req.params.id,
    user_name: userName,
    role,
    source: "manual",
    created_at: now(),
  };
  insert("project_members", member);
  audit(req.user, "project.member_add", "project", req.params.id, null, member, req.ip);
  res.status(201).json(ok({
    id: member.id,
    projectId: member.project_id,
    userName: member.user_name,
    role: member.role,
    source: member.source,
    createdAt: member.created_at,
  }));
});

app.delete("/api/projects/:id/members/:memberId", requirePermission("project:*"), (req, res) => {
  const member = row("SELECT * FROM project_members WHERE id = @id AND project_id = @projectId", { id: req.params.memberId, projectId: req.params.id });
  if (!member) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project member not found.");
  run("DELETE FROM project_members WHERE id = @id", { id: req.params.memberId });
  audit(req.user, "project.member_remove", "project", req.params.id, member, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.memberId }));
});

app.get("/api/programs", (req, res) => {
  const projects = rows("SELECT * FROM projects").map(mapProject);
  const grouped = new Map();
  projects.forEach((project) => {
    const key = project.programId || "unassigned";
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key === "unassigned" ? "PROG-UNASSIGNED" : key,
        name: key === "unassigned" ? "未归档项目集" : `项目集 ${key}`,
        owner: project.owner || "未设置",
        status: project.status,
        healthScores: [],
        progresses: [],
        projectIds: [],
        risks: [],
        updatedAt: project.updatedAt,
      });
    }
    const bucket = grouped.get(key);
    bucket.projectIds.push(project.id);
    bucket.healthScores.push(project.healthScore || 0);
    bucket.progresses.push(project.progress || 0);
    if ((project.riskCount || 0) > 0) bucket.risks.push(`${project.name} 有 ${project.riskCount} 个风险项`);
    if (new Date(project.updatedAt).getTime() > new Date(bucket.updatedAt).getTime()) bucket.updatedAt = project.updatedAt;
    if (project.owner) bucket.owner = project.owner;
    if (project.status === "active") bucket.status = "active";
  });
  const programs = [...grouped.values()].map((item) => ({
    id: item.id,
    name: item.name,
    owner: item.owner,
    status: item.status || "planning",
    healthScore: item.healthScores.length ? Math.round(item.healthScores.reduce((sum, score) => sum + score, 0) / item.healthScores.length) : 0,
    progress: item.progresses.length ? Math.round(item.progresses.reduce((sum, score) => sum + score, 0) / item.progresses.length) : 0,
    projectIds: item.projectIds,
    risks: item.risks,
    updatedAt: item.updatedAt || now(),
  }));
  res.json(ok(programs));
});
app.get("/api/portfolios", (req, res) => {
  const products = rows("SELECT * FROM products").map(mapProduct);
  const grouped = new Map();
  products.forEach((product) => {
    const key = product.id.split("-")[1]?.slice(0, 1) ? `PORT-${product.id.split("-")[1].slice(0, 1)}` : "PORT-UNASSIGNED";
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: key === "PORT-UNASSIGNED" ? "默认产品组合" : `产品组合 ${key.replace("PORT-", "")}`,
        owner: product.owner || "未设置",
        status: product.stage || "planned",
        productIds: [],
        roadmap: [],
      });
    }
    const bucket = grouped.get(key);
    bucket.productIds.push(product.id);
    bucket.owner = bucket.owner || product.owner || "未设置";
    bucket.roadmap.push(...(product.roadmap || []));
    if (["released", "maintenance"].includes(product.stage)) bucket.status = "released";
    else if (["development", "mvp"].includes(product.stage) && bucket.status !== "released") bucket.status = "development";
  });
  const portfolios = [...grouped.values()].map((item) => ({
    id: item.id,
    name: item.name,
    owner: item.owner,
    status: item.status || "planned",
    productIds: item.productIds,
    roadmap: item.roadmap.slice(0, 12),
  }));
  res.json(ok(portfolios));
});
app.get("/api/products", (req, res) => res.json(ok(rows("SELECT * FROM products").map(mapProduct))));
function normalizeProductImageUrls(body) {
  if (Array.isArray(body?.imageUrls)) {
    return body.imageUrls.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
  }
  const single = String(body?.imageUrl || "").trim();
  return single ? [single] : [];
}

app.post("/api/products", requirePermission("product:*"), (req, res) => {
  const {
    name, owner, version, stage, description, systemName, systemVersion,
    applicationVersion, modules, roadmap, hardwareInfo, systemInfo, applicationInfo,
    hardwareMetrics, systemMetrics, appMetrics,
  } = req.body || {};
  const imageUrls = normalizeProductImageUrls(req.body);
  if (!name || !owner) return fail(res, 400, "VALIDATION_FAILED", "Product name and owner are required.");
  const product = {
    id: nextId("PROD", "products"),
    name: String(name).trim(),
    owner: String(owner).trim(),
    version: version || "1.0.0",
    stage: stage || "design",
    description: description || "",
    image_url: imageUrls.length ? json(imageUrls) : null,
    system_name: systemName || "",
    system_version: systemVersion || "",
    application_version: applicationVersion || "",
    modules: json(Array.isArray(modules) ? modules : []),
    roadmap: json(Array.isArray(roadmap) ? roadmap : []),
    hardware_info: json(hardwareInfo || {}),
    system_info: json(systemInfo || {}),
    application_info: json(applicationInfo || {}),
    hardware_metrics: json(Array.isArray(hardwareMetrics) ? hardwareMetrics : []),
    system_metrics: json(Array.isArray(systemMetrics) ? systemMetrics : []),
    app_metrics: json(Array.isArray(appMetrics) ? appMetrics : []),
  };
  insert("products", product);
  audit(req.user, "product.create", "product", product.id, null, product, req.ip);
  res.status(201).json(ok(mapProduct(row("SELECT * FROM products WHERE id = @id", { id: product.id }))));
});
app.patch("/api/products/:id", requirePermission("product:*"), (req, res) => {
  const before = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
  const hasImageUrls = Array.isArray(req.body?.imageUrls) || req.body?.imageUrl !== undefined;
  const fields = {
    name: req.body?.name,
    owner: req.body?.owner,
    version: req.body?.version,
    stage: req.body?.stage,
    description: req.body?.description,
    image_url: hasImageUrls ? json(normalizeProductImageUrls(req.body)) : undefined,
    system_name: req.body?.systemName,
    system_version: req.body?.systemVersion,
    application_version: req.body?.applicationVersion,
    modules: req.body?.modules ? json(req.body.modules) : undefined,
    roadmap: req.body?.roadmap ? json(req.body.roadmap) : undefined,
    hardware_info: req.body?.hardwareInfo ? json(req.body.hardwareInfo) : undefined,
    system_info: req.body?.systemInfo ? json(req.body.systemInfo) : undefined,
    application_info: req.body?.applicationInfo ? json(req.body.applicationInfo) : undefined,
    hardware_metrics: req.body?.hardwareMetrics ? json(req.body.hardwareMetrics) : undefined,
    system_metrics: req.body?.systemMetrics ? json(req.body.systemMetrics) : undefined,
    app_metrics: req.body?.appMetrics ? json(req.body.appMetrics) : undefined,
  };
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) run(`UPDATE products SET ${key} = @value WHERE id = @id`, { id: req.params.id, value });
  });
  const after = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
  audit(req.user, "product.update", "product", req.params.id, before, after, req.ip);
  res.json(ok(mapProduct(after)));
});
app.delete("/api/products/:id", requirePermission("product:*"), (req, res) => {
  const before = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
  run("DELETE FROM products WHERE id = @id", { id: req.params.id });
  audit(req.user, "product.delete", "product", req.params.id, before, null, req.ip);
  res.json(ok({ success: true }));
});

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
  const { title, projectId, owner, priority, description, acceptanceCriteria, productId, portfolioId, parentId, assignee, assigneeRole } = req.body || {};
  if (!title || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Requirement title and projectId are required.");
  if (assigneeRole) {
    const roleError = ensureRoleAllowed(assigneeRole, ["dev", "qa"], "assigneeRole");
    if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
  }
  const requirement = {
    id: nextId("REQ", "requirements"),
    title: String(title).trim(),
    description: description || "",
    status: "draft",
    priority: priority || "medium",
    project_id: projectId,
    product_id: productId || null,
    portfolio_id: portfolioId || null,
    parent_id: parentId || null,
    owner: owner || "Product Office",
    assignee: assignee || null,
    assignee_role: assigneeRole || null,
    assignment_status: assignee ? "assigned" : "unassigned",
    completion: 0,
    linked_tasks: json([]),
    acceptance_criteria: json(Array.isArray(acceptanceCriteria) ? acceptanceCriteria : []),
  };
  insert("requirements", requirement);
  const taskId = syncRequirementTask(requirement);
  mergeRequirementLinkedTask(requirement.id, taskId);
  audit(req.user, "requirement.create", "requirement", requirement.id, null, requirement, req.ip);
  res.status(201).json(ok(mapRequirement(row("SELECT * FROM requirements WHERE id = @id", { id: requirement.id }))));
});
app.get("/api/requirements/:id/completion-score", (req, res) => {
  const score = requirementScore(req.params.id);
  if (!score) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  res.json(ok(score));
});
app.get("/api/requirements/:id", (req, res) => {
  const requirement = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  res.json(ok(mapRequirement(requirement)));
});
app.patch("/api/requirements/:id", (req, res) => {
  const before = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  if (!canOperateRequirement(req.user, before)) {
    return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
  }
  const { title, description, priority, acceptanceCriteria, parentId, assignee, assigneeRole, assignmentStatus, completion } = req.body || {};
  if (priority !== undefined) {
    if (!REQUIREMENT_PRIORITIES.includes(priority)) {
      return fail(res, 400, "VALIDATION_FAILED", `Priority must be one of: ${REQUIREMENT_PRIORITIES.join(", ")}`);
    }
  }
  if (assigneeRole !== undefined && assigneeRole !== null && assigneeRole !== "") {
    const roleError = ensureRoleAllowed(assigneeRole, ["dev", "qa"], "assigneeRole");
    if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
  }
  if (parentId !== undefined && parentId !== before.parent_id) {
    // Prevent making a requirement its own ancestor (simple self-loop guard).
    if (parentId === req.params.id) {
      return fail(res, 400, "VALIDATION_FAILED", "A requirement cannot be its own parent.");
    }
    run("UPDATE requirements SET parent_id = @pid WHERE id = @id", { id: req.params.id, pid: parentId || null });
  }
  if (title !== undefined) run("UPDATE requirements SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (description !== undefined) run("UPDATE requirements SET description = @desc WHERE id = @id", { id: req.params.id, desc: description });
  if (priority !== undefined) run("UPDATE requirements SET priority = @priority WHERE id = @id", { id: req.params.id, priority });
  if (acceptanceCriteria !== undefined) run("UPDATE requirements SET acceptance_criteria = @ac WHERE id = @id", { id: req.params.id, ac: json(acceptanceCriteria) });
  if (assignee !== undefined) run("UPDATE requirements SET assignee = @assignee WHERE id = @id", { id: req.params.id, assignee: assignee || null });
  if (assigneeRole !== undefined) run("UPDATE requirements SET assignee_role = @role WHERE id = @id", { id: req.params.id, role: assigneeRole || null });
  if (assignmentStatus !== undefined) run("UPDATE requirements SET assignment_status = @status WHERE id = @id", { id: req.params.id, status: assignmentStatus || "unassigned" });
  if (completion !== undefined) run("UPDATE requirements SET completion = @completion WHERE id = @id", { id: req.params.id, completion: Number(completion) || 0 });
  const after = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  const taskId = syncRequirementTask(after);
  mergeRequirementLinkedTask(req.params.id, taskId);
  audit(req.user, "requirement.update", "requirement", req.params.id, before, after, req.ip);
  res.json(ok(mapRequirement(row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id }))));
});
// Direct children of a requirement (for hierarchy/tree display).
app.get("/api/requirements/:id/children", (req, res) => {
  const requirement = row("SELECT id FROM requirements WHERE id = @id", { id: req.params.id });
  if (!requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  const children = rows("SELECT * FROM requirements WHERE parent_id = @pid ORDER BY id", { pid: req.params.id }).map(mapRequirement);
  res.json(ok(children));
});
app.patch("/api/requirements/:id/status", (req, res) => {
  const before = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  if (!canOperateRequirement(req.user, before)) {
    return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
  }
  const { status } = req.body || {};
  if (!status || !REQUIREMENT_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Requirement status must be one of: ${REQUIREMENT_STATUSES.join(", ")}`);
  }
  run("UPDATE requirements SET status = @status WHERE id = @id", { id: req.params.id, status });
  if (RELEASE_READY_REQUIREMENT_STATUSES.has(status)) {
    run("UPDATE requirements SET completion = 100 WHERE id = @id", { id: req.params.id });
  }
  const after = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  syncRequirementTask(after);
  audit(req.user, "requirement.status_update", "requirement", req.params.id, before, after, req.ip);
  res.json(ok(mapRequirement(after)));
});

app.delete("/api/requirements/:id", requirePermission("requirement:*"), (req, res) => {
  const before = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  run("DELETE FROM requirements WHERE id = @id", { id: req.params.id });
  audit(req.user, "requirement.delete", "requirement", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
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
  const columns = ["todo", "in_progress", "blocked", "code_review", "testing", "acceptance", "done", "cancelled"];
  const tasks = rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: req.params.id }).map(mapTask);
  res.json(ok(columns.map((id) => ({ id, title: id.replace("_", " "), tasks: tasks.filter((task) => task.kanbanColumn === id) }))));
});
app.post("/api/projects/:id/wbs/tasks", requirePermission("project:*"), (req, res) => {
  if (!req.body.title || !String(req.body.title).trim()) {
    return fail(res, 400, "VALIDATION_FAILED", "Task title is required and cannot be empty.");
  }
  if (req.body.type !== undefined && req.body.type !== null && req.body.type !== "" && !TASK_TYPES.includes(req.body.type)) {
    return fail(res, 400, "VALIDATION_FAILED", `Task type must be one of: ${TASK_TYPES.join(", ")}`);
  }
  const task = {
    id: nextId("TASK", "tasks"),
    title: req.body.title,
    status: "todo",
    status_text: "To Do",
    project_id: req.params.id,
    owner: req.body.owner || req.body.assigneeId || "Unassigned",
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
    remaining_hours: Number(req.body.remainingHours ?? req.body.estimatedHours) || 0,
    sprint_id: req.body.sprintId || null,
    assignee_id: req.body.assigneeId || null,
    dependency_ids: json(req.body.dependencyIds || []),
  };
  insert("tasks", task);
  if (task.sprint_id) recordBurndownSnapshot(task.sprint_id);
  audit(req.user, "task.create", "task", task.id, null, task, req.ip);
  res.status(201).json(ok(mapTask(row("SELECT * FROM tasks WHERE id = @id", { id: task.id }))));
});
app.patch("/api/tasks/:id/kanban-position", requirePermission("project:*"), (req, res) => {
  if (!req.body.kanbanColumn || !TASK_STATUSES.includes(req.body.kanbanColumn)) {
    return fail(res, 400, "VALIDATION_FAILED", `kanbanColumn must be one of: ${TASK_STATUSES.join(", ")}`);
  }
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  run("UPDATE tasks SET kanban_column = @column, status = @column, sort_order = @sortOrder WHERE id = @id", { id: req.params.id, column: req.body.kanbanColumn, sortOrder: Number(req.body.sortOrder) || Date.now() });
  if (CLOSED_TASK_STATUSES.has(req.body.kanbanColumn)) {
    run("UPDATE tasks SET remaining_hours = 0 WHERE id = @id", { id: req.params.id });
  }
  if (req.body.kanbanColumn === "done") {
    run("UPDATE tasks SET progress = 100 WHERE id = @id", { id: req.params.id });
  }
  const after = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  audit(req.user, "task.kanban_move", "task", req.params.id, before, after, req.ip);
  res.json(ok(mapTask(after)));
});
app.get("/api/tasks/:id", (req, res) => {
  const task = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  res.json(ok(mapTask(task)));
});

app.patch("/api/tasks/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  const { title, owner, progress, status, type, estimatedHours, actualHours, remainingHours, dueDate, sprintId, assigneeId, dependencyIds } = req.body || {};
  if (status !== undefined) {
    if (!TASK_STATUSES.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${TASK_STATUSES.join(", ")}`);
    }
  }
  if (type !== undefined) {
    if (!TASK_TYPES.includes(type)) {
      return fail(res, 400, "VALIDATION_FAILED", `Task type must be one of: ${TASK_TYPES.join(", ")}`);
    }
  }
  if (title !== undefined) run("UPDATE tasks SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (owner !== undefined) run("UPDATE tasks SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (progress !== undefined) run("UPDATE tasks SET progress = @progress WHERE id = @id", { id: req.params.id, progress: Number(progress) });
  if (status !== undefined) run("UPDATE tasks SET status = @status, status_text = @statusText, kanban_column = @status WHERE id = @id", { id: req.params.id, status, statusText: status.replace("_", " ") });
  if (type !== undefined) run("UPDATE tasks SET type = @type WHERE id = @id", { id: req.params.id, type });
  if (estimatedHours !== undefined) run("UPDATE tasks SET estimated_hours = @hours WHERE id = @id", { id: req.params.id, hours: Number(estimatedHours) });
  if (actualHours !== undefined) run("UPDATE tasks SET actual_hours = @hours WHERE id = @id", { id: req.params.id, hours: Number(actualHours) });
  if (remainingHours !== undefined) run("UPDATE tasks SET remaining_hours = @hours WHERE id = @id", { id: req.params.id, hours: Number(remainingHours) });
  if (dueDate !== undefined) run("UPDATE tasks SET due_date = @date WHERE id = @id", { id: req.params.id, date: dueDate });
  if (sprintId !== undefined) run("UPDATE tasks SET sprint_id = @sid WHERE id = @id", { id: req.params.id, sid: sprintId || null });
  if (assigneeId !== undefined) run("UPDATE tasks SET assignee_id = @aid WHERE id = @id", { id: req.params.id, aid: assigneeId || null });
  if (dependencyIds !== undefined) run("UPDATE tasks SET dependency_ids = @dids WHERE id = @id", { id: req.params.id, dids: json(dependencyIds || []) });
  const after = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  // Record a burndown snapshot whenever hours/progress/sprint change.
  if (after.sprint_id && (estimatedHours !== undefined || actualHours !== undefined || remainingHours !== undefined || sprintId !== undefined)) {
    recordBurndownSnapshot(after.sprint_id);
  }
  audit(req.user, "task.update", "task", req.params.id, before, after, req.ip);
  res.json(ok(mapTask(after)));
});

// G-5: Dedicated task status endpoint 鈥?docs/10 搂3.3, docs/00 搂6.
app.patch("/api/tasks/:id/status", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  const { status, progress } = req.body || {};
  if (!status) return fail(res, 400, "VALIDATION_FAILED", "status is required.");
  if (!TASK_STATUSES.includes(status)) return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${TASK_STATUSES.join(", ")}`);
  run("UPDATE tasks SET status = @status, status_text = @statusText, kanban_column = @status WHERE id = @id", {
    id: req.params.id,
    status,
    statusText: status.replace("_", " "),
  });
  if (CLOSED_TASK_STATUSES.has(status)) {
    run("UPDATE tasks SET remaining_hours = 0 WHERE id = @id", { id: req.params.id });
  }
  if (status === "done" && progress === undefined) {
    run("UPDATE tasks SET progress = 100 WHERE id = @id", { id: req.params.id });
  }
  if (progress !== undefined) {
    run("UPDATE tasks SET progress = @progress WHERE id = @id", { id: req.params.id, progress: Number(progress) });
  }
  const after = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  audit(req.user, "task.status_update", "task", req.params.id, before, after, req.ip);
  res.json(ok(mapTask(after)));
});

app.delete("/api/tasks/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  run("DELETE FROM tasks WHERE id = @id", { id: req.params.id });
  audit(req.user, "task.delete", "task", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});

// Sprint update/delete

app.patch("/api/sprints/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  const { name, goal, status, startDate, endDate } = req.body || {};
  if (status !== undefined) {
    if (!SPRINT_STATUSES.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Status must be one of: ${SPRINT_STATUSES.join(", ")}`);
    }
  }
  if (name !== undefined) run("UPDATE sprints SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (goal !== undefined) run("UPDATE sprints SET goal = @goal WHERE id = @id", { id: req.params.id, goal });
  if (status !== undefined) run("UPDATE sprints SET status = @status WHERE id = @id", { id: req.params.id, status });
  if (startDate !== undefined) run("UPDATE sprints SET start_date = @date WHERE id = @id", { id: req.params.id, date: startDate });
  if (endDate !== undefined) run("UPDATE sprints SET end_date = @date WHERE id = @id", { id: req.params.id, date: endDate });
  const after = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  audit(req.user, "sprint.update", "sprint", req.params.id, before, after, req.ip);
  res.json(ok(mapSprint(after)));
});

app.delete("/api/sprints/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  run("DELETE FROM sprints WHERE id = @id", { id: req.params.id });
  audit(req.user, "sprint.delete", "sprint", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});

// G-2: Add a task to a sprint backlog.
app.post("/api/sprints/:id/tasks", requirePermission("project:*"), (req, res) => {
  const sprint = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  if (!sprint) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  const { taskId } = req.body || {};
  if (!taskId) return fail(res, 400, "VALIDATION_FAILED", "taskId is required.");
  const task = row("SELECT * FROM tasks WHERE id = @id", { id: taskId });
  if (!task) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  if (task.project_id !== sprint.project_id) {
    return fail(res, 400, "VALIDATION_FAILED", "Task must belong to the same project as the sprint.");
  }
  run("UPDATE tasks SET sprint_id = @sid WHERE id = @id", { id: taskId, sid: req.params.id });
  const updated = row("SELECT * FROM tasks WHERE id = @id", { id: taskId });
  recordBurndownSnapshot(req.params.id);
  audit(req.user, "sprint.add_task", "task", taskId, task, updated, req.ip);
  res.json(ok(mapTask(updated)));
});

// Burndown chart data for a sprint (ideal line + actual remaining line).
app.get("/api/sprints/:id/burndown", (req, res) => {
  const data = buildSprintBurndown(req.params.id);
  if (!data) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  res.json(ok(data));
});

// ---------------------------------------------------------------------------
// Project flow: aggregates a project's requirements/tasks/defects/tests/docs
// into a 7-stage pipeline with auto-evaluated quality gates + a defect funnel.
// Pure read-only computation 鈥?no state mutation.
// ---------------------------------------------------------------------------

const FLOW_STAGES = [
  { stage: "initiation", label: "立项" },
  { stage: "requirement", label: "需求" },
  { stage: "design", label: "设计" },
  { stage: "development", label: "开发" },
  { stage: "testing", label: "测试" },
  { stage: "acceptance", label: "验收" },
  { stage: "release", label: "发布" },
];

/**
 * Evaluate the quality gates for one project. Returns an array of gate
 * objects, each with { stage, label, state, checks:[{name,passed,detail?}] }.
 * state 鈭?{ done, passed, in_progress, blocked, pending }.
 */
function evaluateProjectFlow(projectId) {
  const project = row("SELECT * FROM projects WHERE id = @id", { id: projectId });
  if (!project) return null;

  const reqs = rows("SELECT status FROM requirements WHERE project_id = @pid", { pid: projectId });
  const tasks = rows("SELECT status, estimated_hours, actual_hours, remaining_hours FROM tasks WHERE project_id = @pid", { pid: projectId });
  const defects = rows("SELECT status, severity FROM defects WHERE project_id = @pid", { pid: projectId });
  const tests = rows("SELECT total_cases, passed_cases, failed_cases, blocked_cases FROM test_cases WHERE project_id = @pid", { pid: projectId });
  const docs = rows("SELECT type, ai_status FROM documents", {}); // docs are global; filter by type presence
  const designDocs = docs.filter((d) => d.type === "design");
  const testDocs = docs.filter((d) => d.type === "test");

  // --- Requirement stage ---
  const reqTotal = reqs.length;
  const reqApproved = reqs.filter((r) => ["approved", "in_dev", "testing", "accepted", "closed"].includes(r.status)).length;
  const reqApprovedRatio = reqTotal > 0 ? reqApproved / reqTotal : 0;

  // --- Development stage ---
  const taskTotal = tasks.length;
  const taskDone = tasks.filter((t) => t.status === "done").length;
  const taskBlocked = tasks.filter((t) => t.status === "blocked").length;
  const taskCompletion = taskTotal > 0 ? taskDone / taskTotal : 0;
  const estSum = tasks.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
  const consumedSum = tasks.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0);
  const leftSum = tasks.reduce((s, t) => s + (Number(t.remaining_hours) || 0), 0);

  // --- Testing stage ---
  const defTotal = defects.length;
  const defBlocked = defects.filter((d) => ["new", "confirmed", "in_fix"].includes(d.status)).length;
  const defCritical = defects.filter((d) => d.severity === "critical" && d.status !== "closed" && d.status !== "rejected").length;
  const defClosed = defects.filter((d) => d.status === "closed" || d.status === "verified").length;
  const testCaseCount = tests.length;
  const plannedCaseTotal = tests.reduce((s, t) => s + (Number(t.total_cases) || 0), 0);
  const executedCaseTotal = tests.reduce((s, t) => s + (Number(t.passed_cases) || 0) + (Number(t.failed_cases) || 0) + (Number(t.blocked_cases) || 0), 0);
  const tcTotal = plannedCaseTotal > 0 ? plannedCaseTotal : executedCaseTotal;
  const tcPassed = tests.reduce((s, t) => s + (Number(t.passed_cases) || 0), 0);
  const testPassRate = tcTotal > 0 ? tcPassed / tcTotal : 0;

  // --- Build gates ---
  const gates = [
    {
      stage: "initiation", label: "立项",
      state: project.status !== "planning" ? "done" : "in_progress",
      checks: [{ name: "项目已立项", passed: project.status !== "planning" }],
    },
    {
      stage: "requirement", label: "需求",
      state: reqTotal === 0 ? "pending" : reqApprovedRatio >= 0.5 ? "passed" : "blocked",
      checks: [{
        name: ">= 50% 需求已批准",
        passed: reqTotal > 0 && reqApprovedRatio >= 0.5,
        detail: reqTotal > 0 ? `${reqApproved}/${reqTotal} 已批准` : "无需求",
      }],
    },
    {
      stage: "design", label: "设计",
      state: designDocs.length > 0 ? "passed" : "pending",
      checks: [{ name: "设计文档存在", passed: designDocs.length > 0, detail: designDocs.length > 0 ? `${designDocs.length} 份` : "未上传" }],
    },
    {
      stage: "development", label: "开发",
      state: taskTotal === 0 ? "pending" : taskCompletion >= 0.8 ? "passed" : taskCompletion < 0.5 || taskBlocked > 0 ? "blocked" : "in_progress",
      checks: [
        { name: "任务完成率 >= 80%", passed: taskTotal > 0 && taskCompletion >= 0.8, detail: taskTotal > 0 ? `${Math.round(taskCompletion * 100)}% (${taskDone}/${taskTotal})` : "无任务" },
        { name: "无阻塞任务", passed: taskBlocked === 0, detail: taskBlocked > 0 ? `${taskBlocked} 个阻塞` : "无阻塞" },
      ],
    },
    {
      stage: "testing", label: "测试",
      state: defTotal === 0 && tcTotal === 0 ? "pending" : defBlocked === 0 && defCritical === 0 ? "passed" : "blocked",
      checks: [
        { name: "阻塞缺陷 = 0", passed: defBlocked === 0, detail: defBlocked > 0 ? `${defBlocked} 个未关闭` : "已清零" },
        { name: "无未关闭严重缺陷", passed: defCritical === 0, detail: defCritical > 0 ? `${defCritical} 个严重` : "无" },
      ],
    },
    {
      stage: "acceptance", label: "验收",
      state: testDocs.length === 0 ? "pending" : testPassRate >= 0.8 ? "passed" : "in_progress",
      checks: [
        { name: "验收文档存在", passed: testDocs.length > 0, detail: testDocs.length > 0 ? `${testDocs.length} 份` : "未上传" },
        { name: "测试通过率 >= 80%", passed: testPassRate >= 0.8, detail: tcTotal > 0 ? `${Math.round(testPassRate * 100)}%` : "无测试数据" },
      ],
    },
    {
      stage: "release", label: "发布",
      state: "pending",
      checks: [
        { name: "前置门禁全部通过", passed: false, detail: "待前置阶段完成" },
        { name: "存在已发布记录", passed: false, detail: "无发布记录" },
      ],
    },
  ];

  // Release gate: recompute after the other gates are known.
  const priorPassed = gates.slice(0, 6).every((g) => g.state === "passed" || g.state === "done");
  // Check for a real released release linked to this project's product.
  const releasedRel = project.product_id
    ? row("SELECT id FROM releases WHERE product_id = @pid AND status = 'released' LIMIT 1", { pid: project.product_id })
    : row("SELECT id FROM releases WHERE status = 'released' LIMIT 1", {});
  const hasRelease = !!releasedRel;
  gates[6].checks[0].passed = priorPassed;
  gates[6].checks[0].detail = priorPassed ? "全部前置门禁已通过" : "前置阶段未全部通过";
  gates[6].checks[1].passed = hasRelease;
  gates[6].checks[1].detail = hasRelease ? `存在已发布记录 ${releasedRel.id}` : "无已发布记录";
  gates[6].state = priorPassed && hasRelease ? "passed" : priorPassed ? "in_progress" : "pending";

  // Defect funnel (closure visibility).
  const defectFunnel = {
    new: defects.filter((d) => d.status === "new").length,
    confirmed: defects.filter((d) => d.status === "confirmed").length,
    in_fix: defects.filter((d) => d.status === "in_fix").length,
    resolved: defects.filter((d) => d.status === "resolved").length,
    closed: defClosed,
    total: defTotal,
  };

  // Work-hour summary (like ZenTao's est/consumed/left trio).
  const hours = { estimated: estSum, consumed: consumedSum, remaining: leftSum };

  return {
    projectId,
    projectName: project.name,
    status: project.status,
    healthScore: project.health_score,
    gates,
    defectFunnel,
    hours,
    counts: { requirements: reqTotal, tasks: taskTotal, defects: defTotal, testCases: testCaseCount },
  };
}

// Single-project flow pipeline.
// Source code browsing endpoint: lists directory / returns file content.
// 搂3.6 of 12-缁煎悎鍗囩骇璁捐鏂规.md
const HIDDEN_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", ".DS_Store", ".cache"]);
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_LINES = 5000;
const EXT_LANGUAGE_MAP = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", java: "java", rb: "ruby", go: "go", rs: "rust",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  php: "php", swift: "swift", kt: "kotlin", scala: "scala",
  html: "html", css: "css", scss: "scss", less: "less",
  json: "json", xml: "xml", yaml: "yaml", yml: "yaml",
  md: "markdown", sql: "sql", sh: "bash", bash: "bash",
  dockerfile: "dockerfile", vue: "vue", svelte: "svelte",
};
function guessLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  if (path.basename(filePath).toLowerCase() === "dockerfile") return "dockerfile";
  if (ext === "") return "text";
  return EXT_LANGUAGE_MAP[ext] || "text";
}
function isBinary(buf) {
  // Check for null bytes in first 8KB as binary heuristic
  const checkLen = Math.min(buf.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
function isPathWithinBase(basePath, targetPath) {
  const baseReal = fs.realpathSync.native(basePath);
  const targetReal = fs.realpathSync.native(targetPath);
  const compareBase = process.platform === "win32" ? baseReal.toLowerCase() : baseReal;
  const compareTarget = process.platform === "win32" ? targetReal.toLowerCase() : targetReal;
  const relative = path.relative(compareBase, compareTarget);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

app.get("/api/projects/:id/sources", requirePermission("source:read"), (req, res) => {
  const project = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const basePath = project.source_path;
  if (!basePath) return fail(res, 400, "SOURCE_PATH_NOT_CONFIGURED", "Project source_path not set.");
  if (!fs.existsSync(basePath)) return fail(res, 404, "SOURCE_PATH_NOT_FOUND", `Source path does not exist: ${basePath}`);

  const relPath = (req.query.path || "").replace(/^\/+/, "");
  // Path traversal protection
  const absPath = path.resolve(basePath, relPath);
  if (!fs.existsSync(absPath)) {
    return fail(res, 404, "FILE_NOT_FOUND", `Path not found: ${relPath}`);
  }
  if (!isPathWithinBase(basePath, absPath)) {
    return fail(res, 403, "PATH_TRAVERSAL_DETECTED", "Access denied.");
  }

  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    // List directory contents
    const entries = fs.readdirSync(absPath, { withFileTypes: true });
    const items = entries
      .filter((entry) => !entry.name.startsWith(".") && !HIDDEN_DIRS.has(entry.name))
      .sort((a, b) => {
        // Directories first, then alphabetically
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => ({
        name: entry.name,
        path: relPath ? `${relPath}/${entry.name}` : entry.name,
        type: entry.isDirectory() ? "dir" : "file",
      }));
    return res.json(ok(items));
  }

  // File content mode 鈥?only when ?content=1 is specified
  if (req.query.content !== "1") {
    return res.json(ok({
      name: path.basename(absPath),
      path: relPath,
      type: "file",
    }));
  }

  // Read and return file content
  const stat2 = fs.statSync(absPath);
  if (stat2.size > MAX_FILE_SIZE) {
    // Truncate: read first MAX_FILE_SIZE bytes
    const fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(MAX_FILE_SIZE);
    fs.readSync(fd, buf, 0, MAX_FILE_SIZE, 0);
    fs.closeSync(fd);
    if (isBinary(buf)) return fail(res, 400, "BINARY_FILE", "Cannot display binary file.");
    const raw = buf.toString("utf-8");
    const lines = raw.split("\n").slice(0, MAX_LINES);
    return res.json(ok({ content: lines.join("\n"), language: guessLanguage(absPath), truncated: stat2.size > MAX_FILE_SIZE, lineCount: lines.length }));
  }

  const buf = fs.readFileSync(absPath);
  if (isBinary(buf)) return fail(res, 400, "BINARY_FILE", "Cannot display binary file.");
  const raw = buf.toString("utf-8");
  const lines = raw.split("\n").slice(0, MAX_LINES);
  res.json(ok({ content: lines.join("\n"), language: guessLanguage(absPath), truncated: lines.length >= MAX_LINES, lineCount: lines.length }));
});

app.get("/api/projects/:id/flow", (req, res) => {
  const flow = evaluateProjectFlow(req.params.id);
  if (!flow) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  res.json(ok(flow));
});

// Cross-project flow overview (all projects 脳 7 stages).
app.get("/api/flow/overview", (req, res) => {
  const projects = rows("SELECT id, name, status, health_score FROM projects ORDER BY name", {});
  const overview = projects.map((p) => {
    const flow = evaluateProjectFlow(p.id);
    if (!flow) return null;
    // Determine the "current" stage = first non-passed gate, or release if all passed.
    const currentGate = flow.gates.find((g) => g.state !== "passed" && g.state !== "done");
    return {
      projectId: p.id,
      projectName: p.name,
      status: p.status,
      healthScore: p.health_score,
      currentStage: currentGate ? currentGate.stage : "release",
      gates: flow.gates.map((g) => ({ stage: g.stage, state: g.state })),
    };
  }).filter(Boolean);
  res.json(ok(overview));
});

// ---------------------------------------------------------------------------
// Delivery gates
// ---------------------------------------------------------------------------

const CLOSED_DEFECT_STATUSES = new Set(["verified", "closed", "rejected"]);

function normalizeIdList(value) {
  return parse(value, [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function uniqueIds(ids) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function bindIds(ids) {
  return {
    placeholders: ids.map((_, index) => `@id${index}`).join(", "),
    params: Object.fromEntries(ids.map((id, index) => [`id${index}`, id])),
  };
}

function loadLinkedDefects(ids) {
  const defectIds = uniqueIds(ids);
  if (defectIds.length === 0) return { missing: [], open: [] };
  const bound = bindIds(defectIds);
  const found = rows(
    `SELECT id, title, status, severity FROM defects WHERE id IN (${bound.placeholders})`,
    bound.params,
  );
  const foundIds = new Set(found.map((item) => item.id));
  return {
    missing: defectIds.filter((id) => !foundIds.has(id)),
    open: found.filter((item) => !CLOSED_DEFECT_STATUSES.has(item.status)),
  };
}

function loadLinkedRequirements(ids) {
  const requirementIds = uniqueIds(ids);
  if (requirementIds.length === 0) return { missing: [], items: [] };
  const bound = bindIds(requirementIds);
  const found = rows(
    `SELECT id, title, status, completion, project_id FROM requirements WHERE id IN (${bound.placeholders})`,
    bound.params,
  );
  const foundIds = new Set(found.map((item) => item.id));
  return {
    missing: requirementIds.filter((id) => !foundIds.has(id)),
    items: found,
  };
}

function loadRequirementReadiness(ids) {
  const requirements = loadLinkedRequirements(ids);
  const requirementIds = requirements.items.map((item) => item.id);
  if (requirementIds.length === 0) {
    return {
      ...requirements,
      notReady: [],
      unfinishedTasks: [],
      missingTests: [],
      testsWithIssues: [],
      testsWithoutPass: [],
      openDefects: [],
    };
  }

  const bound = bindIds(requirementIds);
  const tasks = rows(
    `SELECT id, title, status, progress, remaining_hours, blocker, requirement_id
     FROM tasks
     WHERE requirement_id IN (${bound.placeholders})`,
    bound.params,
  );
  const tests = rows(
    `SELECT id, name, status, total_cases, passed_cases, failed_cases, blocked_cases, requirement_id
     FROM test_cases
     WHERE requirement_id IN (${bound.placeholders})`,
    bound.params,
  );
  const defects = rows(
    `SELECT id, title, status, severity, requirement_id, found_in_build
     FROM defects
     WHERE requirement_id IN (${bound.placeholders})`,
    bound.params,
  );
  const testsByRequirement = tests.reduce((map, item) => {
    if (!map.has(item.requirement_id)) map.set(item.requirement_id, []);
    map.get(item.requirement_id).push(item);
    return map;
  }, new Map());

  return {
    ...requirements,
    notReady: requirements.items.filter((item) => !RELEASE_READY_REQUIREMENT_STATUSES.has(item.status)),
    unfinishedTasks: tasks.filter((item) => {
      const remaining = Number(item.remaining_hours) || 0;
      return !CLOSED_TASK_STATUSES.has(item.status) || remaining > 0 || Boolean(String(item.blocker || "").trim());
    }),
    missingTests: requirementIds.filter((id) => !testsByRequirement.has(id)),
    testsWithIssues: tests.filter((item) => {
      const failed = Number(item.failed_cases) || 0;
      const blocked = Number(item.blocked_cases) || 0;
      return failed > 0 || blocked > 0 || item.status === "failed" || item.status === "blocked";
    }),
    testsWithoutPass: tests.filter((item) => (Number(item.passed_cases) || 0) === 0 && item.status !== "passed"),
    openDefects: defects.filter((item) => !CLOSED_DEFECT_STATUSES.has(item.status)),
  };
}

function deliveryGateFailure(message, details = {}) {
  return { ok: false, message, details };
}

function deliveryGatePassed(details = {}) {
  return { ok: true, details };
}

function validateBuildStatusTransition(build, nextStatus) {
  if (build.status === nextStatus || nextStatus === "building" || nextStatus === "testing" || nextStatus === "failed") {
    return deliveryGatePassed();
  }
  if (nextStatus !== "released") return deliveryGatePassed();

  const linkedStories = normalizeIdList(build.linked_stories);
  const linkedBugs = normalizeIdList(build.linked_bugs);
  if (linkedStories.length === 0) {
    return deliveryGateFailure("构建进入可发布前必须至少关联一个需求或故事。", { gate: "linkedStories" });
  }
  if (!String(build.notes || "").trim()) {
    return deliveryGateFailure("构建进入可发布前必须填写构建备注，说明变更内容和验证范围。", { gate: "notes" });
  }

  const readiness = loadRequirementReadiness(linkedStories);
  if (readiness.missing.length > 0) {
    return deliveryGateFailure(`构建关联的需求不存在：${readiness.missing.join(", ")}。`, { gate: "linkedStories", missing: readiness.missing });
  }
  if (readiness.notReady.length > 0) {
    return deliveryGateFailure(
      `仍有需求未验收：${readiness.notReady.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "requirementReadiness", notReady: readiness.notReady },
    );
  }
  if (readiness.unfinishedTasks.length > 0) {
    return deliveryGateFailure(
      `仍有需求任务未闭环：${readiness.unfinishedTasks.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "taskClosure", unfinishedTasks: readiness.unfinishedTasks },
    );
  }
  if (readiness.missingTests.length > 0) {
    return deliveryGateFailure(
      `需求缺少测试用例：${readiness.missingTests.join(", ")}。`,
      { gate: "testClosure", missingTests: readiness.missingTests },
    );
  }
  if (readiness.testsWithIssues.length > 0 || readiness.testsWithoutPass.length > 0) {
    return deliveryGateFailure(
      `测试尚未全部通过：${[...readiness.testsWithIssues, ...readiness.testsWithoutPass].map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "testClosure", testsWithIssues: readiness.testsWithIssues, testsWithoutPass: readiness.testsWithoutPass },
    );
  }
  if (readiness.openDefects.length > 0) {
    return deliveryGateFailure(
      `关联需求仍有未关闭缺陷：${readiness.openDefects.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "requirementDefects", openDefects: readiness.openDefects },
    );
  }

  const defects = loadLinkedDefects(linkedBugs);
  if (defects.missing.length > 0) {
    return deliveryGateFailure(`构建关联的缺陷不存在：${defects.missing.join(", ")}。`, { gate: "linkedBugs", missing: defects.missing });
  }
  if (defects.open.length > 0) {
    return deliveryGateFailure(
      `构建仍有关联缺陷未关闭：${defects.open.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "linkedBugs", open: defects.open },
    );
  }

  return deliveryGatePassed({ linkedStories, linkedBugs });
}

function hasApprovedRelease(releaseId) {
  const approval = row(
    "SELECT id FROM release_approvals WHERE release_id = @id AND decision = 'approve' ORDER BY created_at DESC LIMIT 1",
    { id: releaseId },
  );
  return Boolean(approval);
}

function validateReleaseStatusTransition(release, nextStatus) {
  if (release.status === nextStatus || nextStatus === "draft" || nextStatus === "rollback") {
    return deliveryGatePassed();
  }
  if (nextStatus !== "staging" && nextStatus !== "released") return deliveryGatePassed();

  if (nextStatus === "released") {
    if (release.status !== "staging") {
      return deliveryGateFailure("正式发布前必须先进入预发布状态。", { gate: "status", currentStatus: release.status });
    }
    if (!hasApprovedRelease(release.id)) {
      return deliveryGateFailure("正式发布前必须至少有一条审批通过记录。", { gate: "approval" });
    }
  }

  if (!String(release.release_notes || "").trim()) {
    return deliveryGateFailure("发布进入预发布或正式发布前必须填写发布说明。", { gate: "releaseNotes" });
  }

  const linkedBuild = release.build_id
    ? row("SELECT * FROM builds WHERE id = @id", { id: release.build_id })
    : null;
  if (!linkedBuild) {
    return deliveryGateFailure("发布进入预发布或正式发布前必须关联一个已可发布的构建。", { gate: "build" });
  }
  if (linkedBuild.status !== "released") {
    return deliveryGateFailure(`关联构建 ${linkedBuild.id} 当前状态为 ${linkedBuild.status}，必须先进入可发布。`, { gate: "build", buildStatus: linkedBuild.status });
  }

  const linkedStories = uniqueIds([
    ...normalizeIdList(release.linked_stories),
    ...normalizeIdList(linkedBuild.linked_stories),
  ]);
  const linkedBugs = uniqueIds([
    ...normalizeIdList(release.linked_bugs),
    ...normalizeIdList(linkedBuild.linked_bugs),
  ]);

  if (linkedStories.length === 0) {
    return deliveryGateFailure("发布进入预发布或正式发布前必须至少关联一个需求或故事。", { gate: "linkedStories" });
  }

  const readiness = loadRequirementReadiness(linkedStories);
  if (readiness.missing.length > 0) {
    return deliveryGateFailure(`发布关联的需求不存在：${readiness.missing.join(", ")}。`, { gate: "linkedStories", missing: readiness.missing });
  }
  if (readiness.notReady.length > 0) {
    return deliveryGateFailure(
      `发布仍有需求未验收：${readiness.notReady.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "requirementReadiness", notReady: readiness.notReady },
    );
  }
  if (readiness.unfinishedTasks.length > 0) {
    return deliveryGateFailure(
      `发布仍有需求任务未闭环：${readiness.unfinishedTasks.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "taskClosure", unfinishedTasks: readiness.unfinishedTasks },
    );
  }
  if (readiness.missingTests.length > 0) {
    return deliveryGateFailure(
      `发布需求缺少测试用例：${readiness.missingTests.join(", ")}。`,
      { gate: "testClosure", missingTests: readiness.missingTests },
    );
  }
  if (readiness.testsWithIssues.length > 0 || readiness.testsWithoutPass.length > 0) {
    return deliveryGateFailure(
      `发布测试尚未全部通过：${[...readiness.testsWithIssues, ...readiness.testsWithoutPass].map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "testClosure", testsWithIssues: readiness.testsWithIssues, testsWithoutPass: readiness.testsWithoutPass },
    );
  }
  if (readiness.openDefects.length > 0) {
    return deliveryGateFailure(
      `发布关联需求仍有未关闭缺陷：${readiness.openDefects.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "requirementDefects", openDefects: readiness.openDefects },
    );
  }

  const defects = loadLinkedDefects(linkedBugs);
  if (defects.missing.length > 0) {
    return deliveryGateFailure(`发布关联的缺陷不存在：${defects.missing.join(", ")}。`, { gate: "linkedBugs", missing: defects.missing });
  }
  if (defects.open.length > 0) {
    return deliveryGateFailure(
      `发布仍有关联缺陷未关闭：${defects.open.map((item) => `${item.id}(${item.status})`).join(", ")}。`,
      { gate: "linkedBugs", open: defects.open },
    );
  }

  return deliveryGatePassed({ buildId: linkedBuild.id, linkedStories, linkedBugs });
}

function gateLine(id, label, passed, message, details = {}) {
  return {
    id,
    label,
    passed: Boolean(passed),
    state: passed ? "passed" : "blocked",
    message,
    details,
  };
}

function evaluateBuildDeliveryGates(build) {
  const linkedStories = normalizeIdList(build.linked_stories);
  const linkedBugs = normalizeIdList(build.linked_bugs);
  const readiness = loadRequirementReadiness(linkedStories);
  const defects = loadLinkedDefects(linkedBugs);
  const storyPassed = linkedStories.length > 0 && readiness.missing.length === 0;
  const requirementPassed = storyPassed && readiness.notReady.length === 0;
  const taskPassed = storyPassed && readiness.unfinishedTasks.length === 0;
  const testPassed = storyPassed
    && readiness.missingTests.length === 0
    && readiness.testsWithIssues.length === 0
    && readiness.testsWithoutPass.length === 0;
  const requirementDefectPassed = storyPassed && readiness.openDefects.length === 0;
  const bugPassed = defects.missing.length === 0 && defects.open.length === 0;
  const notesPassed = Boolean(String(build.notes || "").trim());
  const gates = [
    gateLine(
      "linkedStories",
      "需求覆盖",
      storyPassed,
      linkedStories.length === 0
        ? "至少关联一个需求或故事。"
        : readiness.missing.length > 0
          ? `存在无效需求：${readiness.missing.join(", ")}。`
          : `已关联 ${linkedStories.length} 个需求。`,
      { linkedStories, missing: readiness.missing },
    ),
    gateLine(
      "requirementReadiness",
      "需求验收",
      requirementPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.notReady.length > 0
          ? `仍有 ${readiness.notReady.length} 个需求未验收。`
          : "关联需求均已验收或关闭。",
      { notReady: readiness.notReady },
    ),
    gateLine(
      "taskClosure",
      "任务闭环",
      taskPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.unfinishedTasks.length > 0
          ? `仍有 ${readiness.unfinishedTasks.length} 个需求任务未完成、未清工时或存在阻塞。`
          : "关联需求任务已闭环。",
      { unfinishedTasks: readiness.unfinishedTasks },
    ),
    gateLine(
      "testClosure",
      "测试通过",
      testPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.missingTests.length > 0
          ? `仍有 ${readiness.missingTests.length} 个需求缺少测试用例。`
          : readiness.testsWithIssues.length > 0
            ? `仍有 ${readiness.testsWithIssues.length} 个测试失败或阻塞。`
            : readiness.testsWithoutPass.length > 0
              ? `仍有 ${readiness.testsWithoutPass.length} 个测试尚未产生通过记录。`
              : "关联需求测试均已通过。",
      {
        missingTests: readiness.missingTests,
        testsWithIssues: readiness.testsWithIssues,
        testsWithoutPass: readiness.testsWithoutPass,
      },
    ),
    gateLine(
      "requirementDefects",
      "需求缺陷",
      requirementDefectPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.openDefects.length > 0
          ? `关联需求仍有 ${readiness.openDefects.length} 个缺陷未关闭。`
          : "关联需求缺陷已关闭。",
      { openDefects: readiness.openDefects },
    ),
    gateLine(
      "linkedBugs",
      "缺陷门禁",
      bugPassed,
      defects.missing.length > 0
        ? `存在无效缺陷：${defects.missing.join(", ")}。`
        : defects.open.length > 0
          ? `仍有 ${defects.open.length} 个关联缺陷未关闭。`
          : linkedBugs.length > 0 ? "关联缺陷已全部关闭。" : "无阻断缺陷。",
      { linkedBugs, missing: defects.missing, open: defects.open },
    ),
    gateLine(
      "notes",
      "构建说明",
      notesPassed,
      notesPassed ? "构建备注已补充。" : "需要说明变更内容和验证范围。",
    ),
  ];
  const blocked = gates.filter((item) => !item.passed);
  return {
    kind: "build",
    id: build.id,
    targetStatus: "released",
    ready: blocked.length === 0,
    score: Math.round(((gates.length - blocked.length) / gates.length) * 100),
    summary: blocked.length === 0 ? "构建满足可发布门禁。" : `构建还有 ${blocked.length} 项门禁未通过。`,
    gates,
  };
}

function evaluateReleaseDeliveryGates(release) {
  const linkedBuild = release.build_id
    ? row("SELECT * FROM builds WHERE id = @id", { id: release.build_id })
    : null;
  const linkedStories = uniqueIds([
    ...normalizeIdList(release.linked_stories),
    ...(linkedBuild ? normalizeIdList(linkedBuild.linked_stories) : []),
  ]);
  const linkedBugs = uniqueIds([
    ...normalizeIdList(release.linked_bugs),
    ...(linkedBuild ? normalizeIdList(linkedBuild.linked_bugs) : []),
  ]);
  const readiness = loadRequirementReadiness(linkedStories);
  const defects = loadLinkedDefects(linkedBugs);
  const notesPassed = Boolean(String(release.release_notes || "").trim());
  const buildPassed = Boolean(linkedBuild && linkedBuild.status === "released");
  const approvalPassed = hasApprovedRelease(release.id);
  const storyPassed = linkedStories.length > 0 && readiness.missing.length === 0;
  const requirementPassed = storyPassed && readiness.notReady.length === 0;
  const taskPassed = storyPassed && readiness.unfinishedTasks.length === 0;
  const testPassed = storyPassed
    && readiness.missingTests.length === 0
    && readiness.testsWithIssues.length === 0
    && readiness.testsWithoutPass.length === 0;
  const requirementDefectPassed = storyPassed && readiness.openDefects.length === 0;
  const bugPassed = defects.missing.length === 0 && defects.open.length === 0;
  const gates = [
    gateLine(
      "releaseNotes",
      "发布说明",
      notesPassed,
      notesPassed ? "发布说明已补充。" : "需要填写发布内容、影响范围和回滚方案。",
    ),
    gateLine(
      "build",
      "关联构建",
      buildPassed,
      !linkedBuild
        ? "必须关联一个已可发布的构建。"
        : linkedBuild.status === "released"
          ? `构建 ${linkedBuild.id} 已可发布。`
          : `构建 ${linkedBuild.id} 当前为 ${linkedBuild.status}，需要先进入可发布。`,
      { buildId: linkedBuild?.id || null, buildStatus: linkedBuild?.status || null },
    ),
    gateLine(
      "approval",
      "发布审批",
      approvalPassed,
      approvalPassed ? "已有审批通过记录。" : "正式发布前需要审批通过。",
    ),
    gateLine(
      "linkedStories",
      "需求覆盖",
      storyPassed,
      linkedStories.length === 0
        ? "至少关联一个需求或故事。"
        : readiness.missing.length > 0
          ? `存在无效需求：${readiness.missing.join(", ")}。`
          : `已覆盖 ${linkedStories.length} 个需求。`,
      { linkedStories, missing: readiness.missing },
    ),
    gateLine(
      "requirementReadiness",
      "需求验收",
      requirementPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.notReady.length > 0
          ? `仍有 ${readiness.notReady.length} 个需求未验收。`
          : "关联需求均已验收或关闭。",
      { notReady: readiness.notReady },
    ),
    gateLine(
      "taskClosure",
      "任务闭环",
      taskPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.unfinishedTasks.length > 0
          ? `仍有 ${readiness.unfinishedTasks.length} 个需求任务未完成、未清工时或存在阻塞。`
          : "关联需求任务已闭环。",
      { unfinishedTasks: readiness.unfinishedTasks },
    ),
    gateLine(
      "testClosure",
      "测试通过",
      testPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.missingTests.length > 0
          ? `仍有 ${readiness.missingTests.length} 个需求缺少测试用例。`
          : readiness.testsWithIssues.length > 0
            ? `仍有 ${readiness.testsWithIssues.length} 个测试失败或阻塞。`
            : readiness.testsWithoutPass.length > 0
              ? `仍有 ${readiness.testsWithoutPass.length} 个测试尚未产生通过记录。`
              : "关联需求测试均已通过。",
      {
        missingTests: readiness.missingTests,
        testsWithIssues: readiness.testsWithIssues,
        testsWithoutPass: readiness.testsWithoutPass,
      },
    ),
    gateLine(
      "requirementDefects",
      "需求缺陷",
      requirementDefectPassed,
      !storyPassed
        ? "请先完成需求覆盖。"
        : readiness.openDefects.length > 0
          ? `关联需求仍有 ${readiness.openDefects.length} 个缺陷未关闭。`
          : "关联需求缺陷已关闭。",
      { openDefects: readiness.openDefects },
    ),
    gateLine(
      "linkedBugs",
      "缺陷门禁",
      bugPassed,
      defects.missing.length > 0
        ? `存在无效缺陷：${defects.missing.join(", ")}。`
        : defects.open.length > 0
          ? `仍有 ${defects.open.length} 个关联缺陷未关闭。`
          : linkedBugs.length > 0 ? "关联缺陷已全部关闭。" : "无阻塞缺陷。",
      { linkedBugs, missing: defects.missing, open: defects.open },
    ),
  ];
  const blocked = gates.filter((item) => !item.passed);
  return {
    kind: "release",
    id: release.id,
    targetStatus: "released",
    ready: blocked.length === 0,
    score: Math.round(((gates.length - blocked.length) / gates.length) * 100),
    summary: blocked.length === 0 ? "发布满足正式发布门禁。" : `发布还有 ${blocked.length} 项门禁未通过。`,
    gates,
  };
}

function listDeliveryGateResults() {
  const buildResults = rows("SELECT * FROM builds ORDER BY created_at DESC").map(evaluateBuildDeliveryGates);
  const releaseResults = rows("SELECT * FROM releases ORDER BY release_date DESC").map(evaluateReleaseDeliveryGates);
  return [...buildResults, ...releaseResults];
}

function mapReleaseApproval(item) {
  return {
    id: item.id,
    releaseId: item.release_id,
    decision: item.decision,
    comment: item.comment || "",
    approverId: item.approver_id || null,
    approverName: item.approver_name || "",
    createdAt: item.created_at,
  };
}

function mapRollbackRecord(item) {
  return {
    id: item.id,
    releaseId: item.release_id,
    reason: item.reason,
    impact: item.impact || "",
    plan: item.plan || "",
    operatorId: item.operator_id || null,
    operatorName: item.operator_name || "",
    createdAt: item.created_at,
  };
}

function mapDeliveryAudit(item) {
  return {
    id: item.id,
    action: item.action,
    actorName: item.actor_name || "",
    resourceType: item.resource_type,
    resourceId: item.resource_id,
    createdAt: item.created_at,
  };
}

function loadRequirementsByIds(ids) {
  const requirementIds = uniqueIds(ids);
  if (!requirementIds.length) return [];
  return rows(
    `SELECT * FROM requirements WHERE id IN (${requirementIds.map((_, index) => `@id${index}`).join(", ")}) ORDER BY id`,
    Object.fromEntries(requirementIds.map((id, index) => [`id${index}`, id])),
  ).map(mapRequirement);
}

function loadDefectsByIds(ids) {
  const defectIds = uniqueIds(ids);
  if (!defectIds.length) return [];
  return rows(
    `SELECT * FROM defects WHERE id IN (${defectIds.map((_, index) => `@id${index}`).join(", ")}) ORDER BY id`,
    Object.fromEntries(defectIds.map((id, index) => [`id${index}`, id])),
  ).map(mapDefect);
}

function buildReleaseReport(releaseRow) {
  const buildRow = releaseRow.build_id ? row("SELECT * FROM builds WHERE id = @id", { id: releaseRow.build_id }) : null;
  const release = mapRelease(releaseRow);
  const build = buildRow ? mapBuild(buildRow) : null;
  const linkedStories = uniqueIds([
    ...normalizeIdList(releaseRow.linked_stories),
    ...(buildRow ? normalizeIdList(buildRow.linked_stories) : []),
  ]);
  const linkedBugs = uniqueIds([
    ...normalizeIdList(releaseRow.linked_bugs),
    ...(buildRow ? normalizeIdList(buildRow.linked_bugs) : []),
  ]);
  const requirements = loadRequirementsByIds(linkedStories);
  const defects = loadDefectsByIds(linkedBugs);
  const approvals = rows("SELECT * FROM release_approvals WHERE release_id = @id ORDER BY created_at DESC", { id: releaseRow.id }).map(mapReleaseApproval);
  const rollbacks = rows("SELECT * FROM rollback_records WHERE release_id = @id ORDER BY created_at DESC", { id: releaseRow.id }).map(mapRollbackRecord);
  const gate = evaluateReleaseDeliveryGates(releaseRow);
  const resourceIds = [releaseRow.id, buildRow?.id].filter(Boolean);
  const auditTrail = resourceIds.length
    ? rows(
        `SELECT * FROM audit_logs WHERE resource_id IN (${resourceIds.map((_, index) => `@id${index}`).join(", ")}) ORDER BY created_at DESC LIMIT 50`,
        Object.fromEntries(resourceIds.map((id, index) => [`id${index}`, id])),
      ).map(mapDeliveryAudit)
    : [];
  const openDefects = defects.filter((item) => !CLOSED_DEFECT_STATUSES.has(item.status));
  const approved = approvals.some((item) => item.decision === "approve");
  const rejected = approvals.some((item) => item.decision === "reject");
  const summary = [
    `发布 ${release.name}${release.version ? `（${release.version}）` : ""} 当前状态为 ${release.status}。`,
    gate.ready ? "全部发布门禁已通过。" : gate.summary,
    approved ? "已有审批通过记录。" : rejected ? "存在审批驳回记录，需要重新确认。" : "尚未审批通过。",
    rollbacks.length ? `已登记 ${rollbacks.length} 条回滚记录。` : "暂无回滚记录。",
  ].join(" ");
  return {
    release,
    build,
    gate,
    requirements,
    defects,
    approvals,
    rollbacks,
    auditTrail,
    metrics: {
      requirementCount: requirements.length,
      defectCount: defects.length,
      openDefectCount: openDefects.length,
      approvalCount: approvals.length,
      rollbackCount: rollbacks.length,
      auditCount: auditTrail.length,
      readyScore: gate.score,
    },
    summary,
    recommendations: [
      !gate.ready ? "先处理未通过的发布门禁，再进入正式发布。" : "",
      !approved ? "正式发布前补齐审批通过记录。" : "",
      openDefects.length ? `关闭或确认豁免 ${openDefects.length} 个关联缺陷。` : "",
      !String(release.releaseNotes || "").trim() ? "补充发布说明、影响范围和回滚方案。" : "",
      release.status === "released" && !rollbacks.length ? "发布后保留验证结论；如发生异常，及时登记回滚影响和处理计划。" : "",
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Builds (鏋勫缓绠＄悊)
// ---------------------------------------------------------------------------

app.get("/api/delivery/gates", (req, res) => {
  const { kind, id, ready } = req.query;
  let results = listDeliveryGateResults();
  if (kind) results = results.filter((item) => item.kind === kind);
  if (id) results = results.filter((item) => item.id === id);
  if (ready === "true") results = results.filter((item) => item.ready);
  if (ready === "false") results = results.filter((item) => !item.ready);
  res.json(ok(results));
});

app.get("/api/builds", (req, res) => {
  const { projectId, status, keyword } = req.query;
  let sql = "SELECT * FROM builds";
  const clauses = [];
  const params = {};
  if (projectId) { clauses.push("project_id = @projectId"); params.projectId = projectId; }
  if (status) { clauses.push("status = @status"); params.status = status; }
  if (keyword) { clauses.push("(name LIKE @kw OR version LIKE @kw)"); params.kw = `%${keyword}%`; }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
  sql += " ORDER BY created_at DESC";
  res.json(ok(rows(sql, params).map(mapBuild)));
});

app.post("/api/builds", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
  const { projectId, name, version, buildDate, linkedStories, linkedBugs, scmHash, notes } = req.body || {};
  if (!projectId || !name) return fail(res, 400, "VALIDATION_FAILED", "Build projectId and name are required.");
  const build = {
    id: nextId("BLD", "builds"),
    project_id: projectId,
    name: String(name).trim(),
    version: version || null,
    build_date: buildDate || now().slice(0, 10),
    status: "building",
    linked_stories: json(linkedStories || []),
    linked_bugs: json(linkedBugs || []),
    scm_hash: scmHash || null,
    creator: req.user.name,
    notes: notes || null,
    created_at: now(),
  };
  insert("builds", build);
  audit(req.user, "build.create", "build", build.id, null, build, req.ip);
  res.status(201).json(ok(mapBuild(row("SELECT * FROM builds WHERE id = @id", { id: build.id }))));
});

app.patch("/api/builds/:id", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
  const before = row("SELECT * FROM builds WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
  const { name, version, buildDate, linkedStories, linkedBugs, scmHash, notes } = req.body || {};
  if (name !== undefined) run("UPDATE builds SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (version !== undefined) run("UPDATE builds SET version = @version WHERE id = @id", { id: req.params.id, version });
  if (buildDate !== undefined) run("UPDATE builds SET build_date = @d WHERE id = @id", { id: req.params.id, d: buildDate });
  if (linkedStories !== undefined) run("UPDATE builds SET linked_stories = @s WHERE id = @id", { id: req.params.id, s: json(linkedStories) });
  if (linkedBugs !== undefined) run("UPDATE builds SET linked_bugs = @b WHERE id = @id", { id: req.params.id, b: json(linkedBugs) });
  if (scmHash !== undefined) run("UPDATE builds SET scm_hash = @h WHERE id = @id", { id: req.params.id, h: scmHash });
  if (notes !== undefined) run("UPDATE builds SET notes = @n WHERE id = @id", { id: req.params.id, n: notes });
  const after = row("SELECT * FROM builds WHERE id = @id", { id: req.params.id });
  audit(req.user, "build.update", "build", req.params.id, before, after, req.ip);
  res.json(ok(mapBuild(after)));
});

app.patch("/api/builds/:id/status", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
  const before = row("SELECT * FROM builds WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
  const { status } = req.body || {};
  if (!BUILD_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Build status must be one of: ${BUILD_STATUSES.join(", ")}`);
  }
  const gate = validateBuildStatusTransition(before, status);
  if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
  run("UPDATE builds SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM builds WHERE id = @id", { id: req.params.id });
  audit(req.user, "build.status_update", "build", req.params.id, before, after, req.ip);
  res.json(ok(mapBuild(after)));
});

app.delete("/api/builds/:id", requireAnyPermission(["project:*", "build:*"]), (req, res) => {
  const before = row("SELECT * FROM builds WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Build not found.");
  run("DELETE FROM builds WHERE id = @id", { id: req.params.id });
  audit(req.user, "build.delete", "build", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: req.params.id }));
});

// ---------------------------------------------------------------------------
// Releases (鍙戝竷绠＄悊)
// ---------------------------------------------------------------------------

app.get("/api/releases", (req, res) => {
  const { productId, status } = req.query;
  let sql = "SELECT * FROM releases";
  const clauses = [];
  const params = {};
  if (productId) { clauses.push("product_id = @pid"); params.pid = productId; }
  if (status) { clauses.push("status = @status"); params.status = status; }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
  sql += " ORDER BY release_date DESC";
  res.json(ok(rows(sql, params).map(mapRelease)));
});

app.post("/api/releases", requirePermission("project:*"), (req, res) => {
  const { productId, name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes } = req.body || {};
  if (!name) return fail(res, 400, "VALIDATION_FAILED", "Release name is required.");
  if (releaseType && !RELEASE_TYPES.includes(releaseType)) {
    return fail(res, 400, "VALIDATION_FAILED", `Release type must be one of: ${RELEASE_TYPES.join(", ")}`);
  }
  const release = {
    id: nextId("REL", "releases"),
    product_id: productId || null,
    name: String(name).trim(),
    version: version || null,
    release_date: releaseDate || now().slice(0, 10),
    build_id: buildId || null,
    release_type: releaseType || "official",
    linked_stories: json(linkedStories || []),
    linked_bugs: json(linkedBugs || []),
    release_notes: releaseNotes || null,
    creator: req.user.name,
    status: "draft",
    created_at: now(),
  };
  insert("releases", release);
  audit(req.user, "release.create", "release", release.id, null, release, req.ip);
  res.status(201).json(ok(mapRelease(row("SELECT * FROM releases WHERE id = @id", { id: release.id }))));
});

app.patch("/api/releases/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  const { name, version, releaseDate, buildId, releaseType, linkedStories, linkedBugs, releaseNotes } = req.body || {};
  if (name !== undefined) run("UPDATE releases SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (version !== undefined) run("UPDATE releases SET version = @v WHERE id = @id", { id: req.params.id, v: version });
  if (releaseDate !== undefined) run("UPDATE releases SET release_date = @d WHERE id = @id", { id: req.params.id, d: releaseDate });
  if (buildId !== undefined) run("UPDATE releases SET build_id = @b WHERE id = @id", { id: req.params.id, b: buildId });
  if (releaseType !== undefined) run("UPDATE releases SET release_type = @t WHERE id = @id", { id: req.params.id, t: releaseType });
  if (linkedStories !== undefined) run("UPDATE releases SET linked_stories = @s WHERE id = @id", { id: req.params.id, s: json(linkedStories) });
  if (linkedBugs !== undefined) run("UPDATE releases SET linked_bugs = @b WHERE id = @id", { id: req.params.id, b: json(linkedBugs) });
  if (releaseNotes !== undefined) run("UPDATE releases SET release_notes = @n WHERE id = @id", { id: req.params.id, n: releaseNotes });
  const after = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  audit(req.user, "release.update", "release", req.params.id, before, after, req.ip);
  res.json(ok(mapRelease(after)));
});

app.patch("/api/releases/:id/status", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  const { status } = req.body || {};
  if (!RELEASE_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Release status must be one of: ${RELEASE_STATUSES.join(", ")}`);
  }
  const gate = validateReleaseStatusTransition(before, status);
  if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
  run("UPDATE releases SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  audit(req.user, "release.status_update", "release", req.params.id, before, after, req.ip);
  res.json(ok(mapRelease(after)));
});

app.get("/api/releases/:id/approvals", (req, res) => {
  const release = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  res.json(ok(rows("SELECT * FROM release_approvals WHERE release_id = @id ORDER BY created_at DESC", { id: req.params.id }).map(mapReleaseApproval)));
});

app.post("/api/releases/:id/approvals", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  const { decision, comment } = req.body || {};
  if (!["approve", "reject"].includes(decision)) {
    return fail(res, 400, "VALIDATION_FAILED", "Approval decision must be approve or reject.");
  }

  if (decision === "approve") {
    const gate = validateReleaseStatusTransition(before, "staging");
    if (!gate.ok) return fail(res, 400, "DELIVERY_GATE_BLOCKED", gate.message);
  }

  const approval = {
    id: nextId("APR", "release_approvals"),
    release_id: req.params.id,
    decision,
    comment: String(comment || "").trim(),
    approver_id: req.user.id,
    approver_name: req.user.name,
    created_at: now(),
  };
  insert("release_approvals", approval);

  if (decision === "approve" && before.status === "draft") {
    run("UPDATE releases SET status = @status WHERE id = @id", { id: req.params.id, status: "staging" });
  }
  const after = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  audit(req.user, `release.approval_${decision}`, "release", req.params.id, before, { release: after, approval }, req.ip);
  res.status(201).json(ok({ approval: mapReleaseApproval(approval), release: mapRelease(after) }));
});

app.get("/api/releases/:id/rollbacks", (req, res) => {
  const release = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  res.json(ok(rows("SELECT * FROM rollback_records WHERE release_id = @id ORDER BY created_at DESC", { id: req.params.id }).map(mapRollbackRecord)));
});

app.post("/api/releases/:id/rollbacks", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  const { reason, impact, plan } = req.body || {};
  if (!String(reason || "").trim()) {
    return fail(res, 400, "VALIDATION_FAILED", "Rollback reason is required.");
  }
  const rollback = {
    id: nextId("RBK", "rollback_records"),
    release_id: req.params.id,
    reason: String(reason).trim(),
    impact: String(impact || "").trim(),
    plan: String(plan || "").trim(),
    operator_id: req.user.id,
    operator_name: req.user.name,
    created_at: now(),
  };
  insert("rollback_records", rollback);
  run("UPDATE releases SET status = @status WHERE id = @id", { id: req.params.id, status: "rollback" });
  const after = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  audit(req.user, "release.rollback_create", "release", req.params.id, before, { release: after, rollback }, req.ip);
  res.status(201).json(ok({ rollback: mapRollbackRecord(rollback), release: mapRelease(after) }));
});

app.get("/api/releases/:id/report", (req, res) => {
  const release = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!release) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  res.json(ok(buildReleaseReport(release)));
});

app.delete("/api/releases/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM releases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Release not found.");
  run("DELETE FROM release_approvals WHERE release_id = @id", { id: req.params.id });
  run("DELETE FROM rollback_records WHERE release_id = @id", { id: req.params.id });
  run("DELETE FROM releases WHERE id = @id", { id: req.params.id });
  audit(req.user, "release.delete", "release", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: req.params.id }));
});

// Milestones

app.post("/api/projects/:id/milestones", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const { name, status, date } = req.body || {};
  if (!name) return fail(res, 400, "VALIDATION_FAILED", "Milestone name is required.");
  const milestones = parse(before.milestones, []);
  milestones.push({ name: String(name).trim(), status: status || "planned", date: date || now().slice(0, 10) });
  run("UPDATE projects SET milestones = @milestones, updated_at = @updated WHERE id = @id", { id: req.params.id, milestones: json(milestones), updated: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.milestone_add", "project", req.params.id, before, after, req.ip);
  res.status(201).json(ok({ milestones }));
});

app.delete("/api/projects/:id/milestones/:index", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const index = parseInt(req.params.index, 10);
  const milestones = parse(before.milestones, []);
  if (index < 0 || index >= milestones.length) return fail(res, 400, "VALIDATION_FAILED", "Invalid milestone index.");
  milestones.splice(index, 1);
  run("UPDATE projects SET milestones = @milestones, updated_at = @updated WHERE id = @id", { id: req.params.id, milestones: json(milestones), updated: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.milestone_remove", "project", req.params.id, before, after, req.ip);
  res.json(ok({ milestones }));
});

app.get("/api/test-cases", (req, res) => {
  const { requirementId, projectId } = req.query;
  let sql = "SELECT * FROM test_cases WHERE 1=1";
  const params = {};
  if (requirementId) {
    sql += " AND requirement_id = @rid";
    params.rid = requirementId;
  }
  if (projectId) {
    sql += " AND project_id = @projectId";
    params.projectId = projectId;
  }
  sql += " ORDER BY id";
  const allItems = rows(sql, params).map(mapTestCase);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});

app.post("/api/test-cases", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
  const { requirementId, projectId, title, description, steps, expectedResult, owner, assigneeRole } = req.body || {};
  if (!title || (!requirementId && !projectId)) return fail(res, 400, "VALIDATION_FAILED", "title and requirementId or projectId are required.");
  if (assigneeRole) {
    const roleError = ensureRoleAllowed(assigneeRole, ["qa", "dev"], "assigneeRole");
    if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
  }
  const testCase = {
    id: nextId("TC", "test_cases"),
    name: String(title).trim(),
    requirement_id: requirementId || null,
    project_id: projectId || null,
    status: "active",
    owner: owner || req.user.name,
    assignee_role: assigneeRole || "qa",
    total_cases: 0,
    passed_cases: 0,
    failed_cases: 0,
    blocked_cases: 0,
    description: String(description || ""),
    steps: JSON.stringify(steps || []),
    expected_result: String(expectedResult || ""),
  };
  insert("test_cases", testCase);
  syncTestCaseTask(testCase);
  audit(req.user, "test_case.create", "test_case", testCase.id, null, testCase, req.ip);
  res.status(201).json(ok(mapTestCase(testCase)));
});

app.patch("/api/test-cases/:id/status", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
  const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  const { status } = req.body || {};
  if (!status || !TEST_CASE_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Test case status must be one of: ${TEST_CASE_STATUSES.join(", ")}`);
  }
  run("UPDATE test_cases SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  syncTestCaseTask(after);
  audit(req.user, "test_case.status_update", "test_case", req.params.id, before, after, req.ip);
  res.json(ok(mapTestCase(after)));
});

app.patch("/api/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
  const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  const { name, owner, description, steps, expectedResult, requirementId, assigneeRole } = req.body || {};
  if (name !== undefined) run("UPDATE test_cases SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (owner !== undefined) run("UPDATE test_cases SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (assigneeRole !== undefined) run("UPDATE test_cases SET assignee_role = @role WHERE id = @id", { id: req.params.id, role: assigneeRole || null });
  if (description !== undefined) run("UPDATE test_cases SET description = @desc WHERE id = @id", { id: req.params.id, desc: description });
  if (steps !== undefined) run("UPDATE test_cases SET steps = @steps WHERE id = @id", { id: req.params.id, steps: JSON.stringify(steps) });
  if (expectedResult !== undefined) run("UPDATE test_cases SET expected_result = @result WHERE id = @id", { id: req.params.id, result: expectedResult });
  if (requirementId !== undefined) run("UPDATE test_cases SET requirement_id = @rid WHERE id = @id", { id: req.params.id, rid: requirementId });
  const after = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  syncTestCaseTask(after);
  audit(req.user, "test_case.update", "test_case", req.params.id, before, after, req.ip);
  res.json(ok(mapTestCase(after)));
});

app.delete("/api/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
  const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  run("DELETE FROM test_cases WHERE id = @id", { id: req.params.id });
  audit(req.user, "test_case.delete", "test_case", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});

app.get("/api/tests", (req, res) => res.json(ok(rows("SELECT * FROM test_cases").map(mapTestCase))));
app.post("/api/tests", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
  const { name, requirementId, projectId, owner, totalCases } = req.body || {};
  if (!name || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Test name and projectId are required.");
  const testCase = {
    id: nextId("TEST", "test_cases"),
    name: String(name).trim(),
    requirement_id: requirementId || null,
    project_id: projectId,
    status: "active",
    owner: owner || req.user.name,
    total_cases: Number(totalCases) || 0,
    passed_cases: 0,
    failed_cases: 0,
    blocked_cases: 0,
  };
  insert("test_cases", testCase);
  audit(req.user, "test_case.create", "test_case", testCase.id, null, testCase, req.ip);
  res.status(201).json(ok(mapTestCase(testCase)));
});

// G-3: Test run recording 鈥?docs/00 搂2.4.2, docs/10 搂3.4.
app.post("/api/test-runs", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
  const { testCaseId, result, notes } = req.body || {};
  if (!testCaseId || !result) return fail(res, 400, "VALIDATION_FAILED", "testCaseId and result are required.");
  if (!["passed", "failed", "blocked"].includes(result)) return fail(res, 400, "VALIDATION_FAILED", "result must be one of: passed, failed, blocked.");
  const testCase = row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
  if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  const id = nextId("TR", "test_runs");
  const testRun = {
    id,
    test_case_id: testCaseId,
    result,
    notes: notes || "",
    executed_by: req.user.name || "Unknown",
    created_at: now(),
  };
  insert("test_runs", testRun);
  // Recalculate execution counters and reflect the latest result as status.
  // Keep total_cases as the planned case count; test_runs is the execution log.
  run(`UPDATE test_cases SET
    passed_cases = passed_cases + CASE WHEN @result = 'passed' THEN 1 ELSE 0 END,
    failed_cases = failed_cases + CASE WHEN @result = 'failed' THEN 1 ELSE 0 END,
    blocked_cases = blocked_cases + CASE WHEN @result = 'blocked' THEN 1 ELSE 0 END,
    status = @result
  WHERE id = @id`, { id: testCaseId, result });
  const after = row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
  syncTestCaseTask(after);
  audit(req.user, "test_run.create", "test_run", id, null, testRun, req.ip);
  res.status(201).json(ok(mapTestRun(testRun)));
});

// G-3 companion: read runs by test case 鈥?closes the execution loop.
app.get("/api/test-cases/:id/runs", (req, res) => {
  const testCase = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  const runs = rows("SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC", { id: req.params.id });
  res.json(ok(runs.map(mapTestRun)));
});

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
  if (req.query.category) {
    sql += " AND category = @category";
    params.category = req.query.category;
  }
  if (req.query.projectId) {
    sql += " AND project_id = @projectId";
    params.projectId = req.query.projectId;
  }
  if (req.query.ownerRole) {
    sql += " AND owner_role = @ownerRole";
    params.ownerRole = req.query.ownerRole;
  }
  sql += " ORDER BY updated_at DESC";
  let allItems = rows(sql, params).map(mapDocument);
  if (req.user?.role !== "admin") {
    allItems = allItems.filter((item) => item.ownerRole ? canManageDocumentRole(req.user, item.ownerRole) : true);
  }
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/activity/page-view", (req, res) => {
  const page = String(req.body?.page ?? "").trim();
  const pageTitle = String(req.body?.pageTitle ?? page).trim();
  if (!page) return fail(res, 400, "VALIDATION_FAILED", "Page is required.");
  audit(req.user, "page.view", "page", page, null, { page, pageTitle }, req.ip);
  res.status(201).json(ok({ page, pageTitle }));
});
app.post("/api/documents", requirePermission("document:*"), (req, res) => {
  const { title, type, category, owner, ownerRole, projectId, fileName, fileSize, fileType, contentBase64 } = req.body || {};
  if (!title || !type || !owner || !fileName) return fail(res, 400, "VALIDATION_FAILED", "Document title, type, owner, and fileName are required.");
  if (category && !DOCUMENT_CATEGORIES.includes(category)) {
    return fail(res, 400, "VALIDATION_FAILED", `Document category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`);
  }
  if (ownerRole && !canManageDocumentRole(req.user, ownerRole)) {
    return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
  }
  const id = nextId("DOC", "documents");
  const storageKey = `${id}_${String(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}`;
  let content = "";
  if (contentBase64) {
    const base64 = String(contentBase64).includes(",") ? String(contentBase64).split(",").pop() : String(contentBase64);
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(path.join(STORAGE_DIR, storageKey), buffer);
    content = extractTextFromUpload(fileName, fileType, contentBase64);
    insert("objects", { id: `OBJ-${id}`, bucket: "documents", storage_key: storageKey, original_name: fileName, mime_type: fileType || "application/octet-stream", size: buffer.length, created_by: req.user.id, created_at: now() });
  }
  const document = {
    id,
    title,
    type,
    category: category || "project",
    version: "v1.0",
    ai_status: "uploaded",
    owner,
    owner_role: ownerRole || normalizeRole(req.user.role),
    project_id: projectId || null,
    updated_at: now(),
    linked_requirements: json([]),
    risks: json([]),
    file_name: fileName,
    file_size: Number(fileSize) || 0,
    file_type: fileType || "application/octet-stream",
    storage_key: storageKey,
    content,
  };
  insert("documents", document);
  audit(req.user, "document.upload", "document", id, null, document, req.ip);
  res.status(201).json(ok(mapDocument(row("SELECT * FROM documents WHERE id = @id", { id }))));
});
app.get("/api/documents/:id", (req, res) => {
  const document = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  res.json(ok(mapDocument(document)));
});
app.post("/api/documents/:id/object", requirePermission("document:*"), upload.single("file"), (req, res) => {
  const document = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  insert("objects", { id: `OBJ-${Date.now()}`, bucket: "documents", storage_key: req.file.filename, original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size, created_by: req.user.id, created_at: now() });
  run("UPDATE documents SET storage_key = @key, file_name = @name, file_size = @size, file_type = @type, updated_at = @updated WHERE id = @id", { id: req.params.id, key: req.file.filename, name: req.file.originalname, size: req.file.size, type: req.file.mimetype, updated: now() });
  audit(req.user, "object.upload", "document", req.params.id, null, req.file, req.ip);
  res.json(ok({ objectKey: req.file.filename }));
});
app.patch("/api/documents/:id", requirePermission("document:*"), (req, res) => {
  const before = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  const { title, type, category, owner, ownerRole, projectId } = req.body || {};
  if (category !== undefined && !DOCUMENT_CATEGORIES.includes(category)) {
    return fail(res, 400, "VALIDATION_FAILED", `Document category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`);
  }
  if (ownerRole !== undefined && !canManageDocumentRole(req.user, ownerRole)) {
    return fail(res, 403, "PERMISSION_DENIED", "You can only manage documents for allowed roles.");
  }
  if (title !== undefined) run("UPDATE documents SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (type !== undefined) run("UPDATE documents SET type = @type WHERE id = @id", { id: req.params.id, type });
  if (category !== undefined) run("UPDATE documents SET category = @category WHERE id = @id", { id: req.params.id, category });
  if (owner !== undefined) run("UPDATE documents SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (ownerRole !== undefined) run("UPDATE documents SET owner_role = @ownerRole WHERE id = @id", { id: req.params.id, ownerRole });
  if (projectId !== undefined) run("UPDATE documents SET project_id = @projectId WHERE id = @id", { id: req.params.id, projectId: projectId || null });
  run("UPDATE documents SET updated_at = @updated WHERE id = @id", { id: req.params.id, updated: now() });
  const after = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  audit(req.user, "document.update", "document", req.params.id, before, after, req.ip);
  res.json(ok(mapDocument(after)));
});

app.delete("/api/documents/:id", requirePermission("document:*"), (req, res) => {
  const before = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  run("DELETE FROM documents WHERE id = @id", { id: req.params.id });
  if (before.storage_key) {
    try { fs.unlinkSync(path.join(STORAGE_DIR, before.storage_key)); } catch { /* file may not exist */ }
  }
  audit(req.user, "document.delete", "document", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});

app.get("/api/objects/:key", (req, res) => {
  const object = row("SELECT * FROM objects WHERE storage_key = @key", { key: req.params.key });
  if (!object) return fail(res, 404, "RESOURCE_NOT_FOUND", "Object not found.");
  if (object.bucket === "documents") {
    const document = row("SELECT * FROM documents WHERE storage_key = @key", { key: req.params.key });
    if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document object not found.");
    if (!visibleDocumentsForUser(req.user, [mapDocument(document)]).length) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot access this document object.");
    }
  } else if (!hasPermission(req.user, "document:*")) {
    return fail(res, 403, "PERMISSION_DENIED", "You cannot access this object.");
  }
  res.download(path.join(STORAGE_DIR, object.storage_key), object.original_name);
});

app.post("/api/ai/documents/analyze", requirePermission("ai:*"), async (req, res, next) => {
  let document;
  let jobId = null;
  try {
    document = row("SELECT * FROM documents WHERE id = @id", { id: req.body.documentId });
    if (!document) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
    jobId = nextId("JOB", "ai_jobs", "job_id");
    // Step 1: create job in queued state
    const jobBase = { job_id: jobId, scene: "document_analysis", status: "queued", progress: 0, current_step: "排队中", source_type: "document", source_id: document.id, goals: json(req.body.analysisGoals || []), result: json({}), evidence: json([]), written_requirement_id: null, created_at: now(), confirmed_at: null, error_message: null, retry_count: 0, started_at: null, failed_at: null, rejected_at: null, rejected_reason: null };
    insert("ai_jobs", jobBase);
    // Step 2+3+4: run analysis with proper state transitions
    await runDocumentAnalysis(jobId, mapDocument(document));
    const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: jobId });
    audit(req.user, "ai.document_analyze", "ai_job", jobId, jobBase, job, req.ip);
    res.status(202).json(ok({
      jobId: job.job_id, scene: job.scene,
      status: job.status, progress: job.progress, currentStep: job.current_step,
      result: parse(job.result, {}), evidence: parse(job.evidence, []),
      writtenRequirementId: job.written_requirement_id,
      errorMessage: job.error_message, retryCount: job.retry_count,
      startedAt: job.started_at, failedAt: job.failed_at,
      rejectedAt: job.rejected_at, rejectedReason: job.rejected_reason,
      createdAt: job.created_at, confirmedAt: job.confirmed_at,
    }));
  } catch (error) {
    // Safety net: if a job was created in the DB but runDocumentAnalysis didn't
    // catch (e.g. error before runDocumentAnalysis was called), mark as failed.
    try { if (jobId) run("UPDATE ai_jobs SET status = 'failed', progress = 0, current_step = '鍒嗘瀽澶辫触', error_message = @msg, failed_at = @failed WHERE job_id = @id", { id: jobId, msg: error.message || "Unknown error", failed: now() }); } catch { /* best-effort */ }
    next(error);
  }
});
app.get("/api/ai/jobs/:id", (req, res) => {
  const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
  res.json(ok({
    jobId: job.job_id, scene: job.scene,
    status: job.status, progress: job.progress, currentStep: job.current_step,
    result: parse(job.result, {}), evidence: parse(job.evidence, []),
    writtenRequirementId: job.written_requirement_id,
    errorMessage: job.error_message, retryCount: job.retry_count,
    startedAt: job.started_at, failedAt: job.failed_at, rejectedAt: job.rejected_at,
    rejectedReason: job.rejected_reason,
    createdAt: job.created_at, confirmedAt: job.confirmed_at,
  }));
});
app.post("/api/ai/jobs/:id/confirm", requirePermission("ai:*"), (req, res) => {
  const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
  if (job.status !== "awaiting_review") return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot confirm job in status "${job.status}". Expected "awaiting_review".`);
  const result = parse(job.result, {});
  const generated = result.requirements?.[0];
  const editedRequirement = req.body?.requirement && typeof req.body.requirement === "object" ? req.body.requirement : null;
  const acceptanceCriteria = editedRequirement && Array.isArray(editedRequirement.acceptanceCriteria)
    ? editedRequirement.acceptanceCriteria.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
    : Array.isArray(generated?.acceptanceCriteria) ? generated.acceptanceCriteria : [];
  const requirementDraft = generated || editedRequirement ? {
    title: String(editedRequirement?.title ?? generated?.title ?? "").trim(),
    description: String(editedRequirement?.description ?? result.summary ?? "").trim(),
    priority: String(editedRequirement?.priority ?? generated?.priority ?? "medium").trim() || "medium",
    acceptanceCriteria,
  } : null;
  if (requirementDraft?.priority && !REQUIREMENT_PRIORITIES.includes(requirementDraft.priority)) {
    return fail(res, 400, "VALIDATION_FAILED", `Priority must be one of: ${REQUIREMENT_PRIORITIES.join(", ")}`);
  }
  let writtenRequirementId = job.written_requirement_id;
  // Resolve the target project from the request body, falling back to the
  // job's source document's project, instead of blindly picking the
  // most-recently-updated project.
  let projectId = req.body?.projectId || null;
  if (!projectId && job.source_type === "document" && job.source_id) {
    const sourceDoc = row("SELECT * FROM documents WHERE id = @id", { id: job.source_id });
    projectId = sourceDoc?.project_id || null;
    const linked = sourceDoc ? parse(sourceDoc.linked_requirements, []) : [];
    if (!projectId && linked.length) {
      const reqRow = row("SELECT project_id FROM requirements WHERE id = @id", { id: linked[0] });
      projectId = reqRow?.project_id || null;
    }
  }
  if (!projectId) {
    const projectCandidates = rows("SELECT id FROM projects ORDER BY id");
    if (projectCandidates.length === 1) projectId = projectCandidates[0].id;
  }
  if (requirementDraft && !projectId) {
    return fail(res, 400, "VALIDATION_FAILED", "确认 AI 结果前需要指定项目。");
  }
  if (requirementDraft && projectId && !writtenRequirementId) {
    if (!requirementDraft.title) return fail(res, 400, "VALIDATION_FAILED", "写入需求前需要填写标题。");
    const project = row("SELECT * FROM projects WHERE id = @id", { id: projectId });
    if (!project) return fail(res, 400, "VALIDATION_FAILED", "projectId does not match a known project.");
    writtenRequirementId = nextId("REQ", "requirements");
    insert("requirements", {
      id: writtenRequirementId,
      title: requirementDraft.title,
      description: requirementDraft.description,
      status: "draft",
      priority: requirementDraft.priority,
      project_id: project.id,
      product_id: null,
      portfolio_id: null,
      owner: req.user.name,
      completion: 0,
      linked_tasks: json([]),
      acceptance_criteria: json(requirementDraft.acceptanceCriteria),
    });
  }
  run("UPDATE ai_jobs SET status = 'confirmed', confirmed_at = @confirmed, written_requirement_id = @rid WHERE job_id = @id", { id: req.params.id, confirmed: now(), rid: writtenRequirementId });
  audit(req.user, "ai.job_confirm", "ai_job", req.params.id, job, { writtenRequirementId, edited: Boolean(editedRequirement) }, req.ip);
  const after = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  res.json(ok({
    jobId: after.job_id, scene: after.scene,
    status: after.status, progress: after.progress, currentStep: after.current_step,
    result: parse(after.result, {}), evidence: parse(after.evidence, []),
    writtenRequirementId: after.written_requirement_id,
    errorMessage: after.error_message, retryCount: after.retry_count,
    startedAt: after.started_at, failedAt: after.failed_at,
    rejectedAt: after.rejected_at, rejectedReason: after.rejected_reason,
    createdAt: after.created_at, confirmedAt: after.confirmed_at,
  }));
});

app.post("/api/ai/jobs/:id/reject", requirePermission("ai:*"), (req, res) => {
  const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
  if (job.status !== "awaiting_review") return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot reject job in status "${job.status}". Expected "awaiting_review".`);
  const reason = req.body?.reason || "未说明驳回原因";
  run("UPDATE ai_jobs SET status = 'rejected', rejected_at = @rejected, rejected_reason = @reason WHERE job_id = @id", { id: req.params.id, rejected: now(), reason });
  audit(req.user, "ai.job_reject", "ai_job", req.params.id, job, { rejectedAt: now(), reason }, req.ip);
  const after = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  res.json(ok({
    jobId: after.job_id, scene: after.scene,
    status: after.status, progress: after.progress, currentStep: after.current_step,
    result: parse(after.result, {}), evidence: parse(after.evidence, []),
    writtenRequirementId: after.written_requirement_id,
    errorMessage: after.error_message, retryCount: after.retry_count,
    startedAt: after.started_at, failedAt: after.failed_at,
    rejectedAt: after.rejected_at, rejectedReason: after.rejected_reason,
    createdAt: after.created_at, confirmedAt: after.confirmed_at,
  }));
});

app.post("/api/ai/jobs/:id/retry", requirePermission("ai:*"), async (req, res, next) => {
  const job = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
  if (!job) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Job not found.");
  const retryable = ["failed", "rejected"];
  if (!retryable.includes(job.status)) return fail(res, 400, "STATE_NOT_ALLOWED", `Cannot retry job in status "${job.status}". Expected one of: ${retryable.join(", ")}.`);
  const retryCount = (job.retry_count || 0) + 1;
  // Step 1: record the retry in history
  run("UPDATE ai_jobs SET status = 'retried', retry_count = @rc WHERE job_id = @id", { id: req.params.id, rc: retryCount });
  // Step 2: re-create as queued
  run("UPDATE ai_jobs SET status = 'queued', progress = 0, current_step = '排队中', error_message = NULL, failed_at = NULL, rejected_at = NULL, rejected_reason = NULL, result = '{}', evidence = '[]' WHERE job_id = @id", { id: req.params.id });
  // Step 3: look up source document and re-run analysis
  const doc = (job.source_type === "document" && job.source_id) ? row("SELECT * FROM documents WHERE id = @id", { id: job.source_id }) : null;
  if (!doc) return fail(res, 400, "SOURCE_MISSING", "Source document no longer exists.");
  try {
    await runDocumentAnalysis(req.params.id, mapDocument(doc));
    audit(req.user, "ai.job_retry", "ai_job", req.params.id, job, { retryCount }, req.ip);
    const after = row("SELECT * FROM ai_jobs WHERE job_id = @id", { id: req.params.id });
    res.json(ok({
      jobId: after.job_id, scene: after.scene,
      status: after.status, progress: after.progress, currentStep: after.current_step,
      result: parse(after.result, {}), evidence: parse(after.evidence, []),
      writtenRequirementId: after.written_requirement_id,
      errorMessage: after.error_message, retryCount: after.retry_count,
      startedAt: after.started_at, failedAt: after.failed_at,
      rejectedAt: after.rejected_at, rejectedReason: after.rejected_reason,
      createdAt: after.created_at, confirmedAt: after.confirmed_at,
    }));
  } catch (error) {
    audit(req.user, "ai.job_retry_failed", "ai_job", req.params.id, job, { retryCount, error: error.message }, req.ip);
    next(error);
  }
});

app.get("/api/work-logs", (req, res) => {
  const allItems = rows("SELECT * FROM work_logs ORDER BY created_at DESC").map((item) => ({
    id: item.id,
    author: item.author,
    role: item.role || "dev",
    projectId: item.project_id || null,
    project: item.project,
    content: item.content,
    blockers: item.blockers,
    nextPlan: item.next_plan,
    analysis: parse(item.analysis, {}),
    logDate: item.log_date || item.created_at?.slice(0, 10),
    sourceDocumentId: item.source_document_id || null,
    fileName: item.file_name || null,
    fileType: item.file_type || null,
    weekKey: item.week_key || weekKeyOf(item.log_date || item.created_at),
    weeklySummary: item.weekly_summary || "",
    createdAt: item.created_at,
  }));
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.get("/api/work-logs/team", (req, res) => {
  if (!canViewTeamLogs(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队日报。");
  const roleFilter = req.query.role ? normalizeRole(req.query.role) : "";
  const authorFilter = String(req.query.author || "").trim();
  const projectFilter = resolveWorkLogProjectFilter(req.query);
  const dateFilter = req.query.date ? isoDateOnly(req.query.date) : "";
  let allItems = rows("SELECT * FROM work_logs ORDER BY log_date DESC, created_at DESC").map((item) => ({
    id: item.id,
    author: item.author,
    role: item.role || "dev",
    projectId: item.project_id || null,
    project: item.project,
    content: item.content,
    blockers: item.blockers,
    nextPlan: item.next_plan,
    analysis: parse(item.analysis, {}),
    logDate: item.log_date || item.created_at?.slice(0, 10),
    sourceDocumentId: item.source_document_id || null,
    fileName: item.file_name || null,
    fileType: item.file_type || null,
    weekKey: item.week_key || weekKeyOf(item.log_date || item.created_at),
    weeklySummary: item.weekly_summary || "",
    createdAt: item.created_at,
  }));
  if (roleFilter) allItems = allItems.filter((item) => normalizeRole(item.role) === roleFilter);
  if (authorFilter) allItems = allItems.filter((item) => item.author === authorFilter);
  allItems = allItems.filter((item) => workLogMatchesProject(item, projectFilter));
  if (dateFilter) allItems = allItems.filter((item) => item.logDate === dateFilter);
  res.json(ok(allItems));
});
app.post("/api/work-logs", async (req, res, next) => {
  try {
  if (!canSubmitDailyLog(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有管理员以外的角色可以提交每日日报。");
  const extractedContent = extractTextFromUpload(req.body?.fileName, req.body?.fileType, req.body?.contentBase64);
  const content = String(req.body?.content ?? extractedContent ?? "").trim();
  if (!content) return fail(res, 400, "VALIDATION_FAILED", "工作日志 content 不能为空。");
  const requestedProjectId = String(req.body?.projectId || "").trim();
  const requestedProjectName = String(req.body?.project || "").trim();
  const matchedProject = requestedProjectId
    ? row("SELECT id, name FROM projects WHERE id = @id", { id: requestedProjectId })
    : requestedProjectName
      ? row("SELECT id, name FROM projects WHERE name = @name", { name: requestedProjectName })
      : null;
  if (requestedProjectId && !matchedProject) return fail(res, 400, "VALIDATION_FAILED", "projectId does not match a known project.");
  const logDate = isoDateOnly(req.body?.logDate);
  const weekKey = weekKeyOf(logDate);
  const analysis = await analyzeWorkLog({ ...req.body, content });
  const id = nextId("LOG", "work_logs");
  insert("work_logs", {
    id,
    author: req.body.author || req.user.name,
    role: normalizeRole(req.user.role),
    project_id: matchedProject?.id || null,
    project: matchedProject?.name || requestedProjectName,
    content,
    blockers: req.body.blockers || "",
    next_plan: req.body.nextPlan || "",
    analysis: json(analysis),
    log_date: logDate,
    source_document_id: req.body.sourceDocumentId || null,
    file_name: req.body.fileName || null,
    file_type: req.body.fileType || null,
    week_key: weekKey,
    weekly_summary: "",
    created_at: now(),
  });
  const after = row("SELECT * FROM work_logs WHERE id = @id", { id });
  audit(req.user, "work_log.create", "work_log", id, null, after, req.ip);
  res.status(201).json(ok({ id, analysis, content, logDate, weekKey, projectId: matchedProject?.id || null }));
  } catch (error) {
    next(error);
  }
});
app.post("/api/work-logs/analyze", async (req, res, next) => {
  try {
    res.json(ok(await analyzeWorkLog(req.body)));
  } catch (error) {
    next(error);
  }
});
app.post("/api/ai/logs/analyze", requirePermission("ai:*"), async (req, res, next) => {
  try {
    res.json(ok(await analyzeWorkLog(req.body)));
  } catch (error) {
    next(error);
  }
});
app.get("/api/work-logs/weekly-summary", (req, res) => {
  const role = normalizeRole(req.user?.role);
  const canReadAll = ["admin", "pm"].includes(role);
  const requestedAuthor = String(req.query.author || "").trim();
  const author = canReadAll ? requestedAuthor || req.user?.name : req.user?.name;
  const weekKey = weekKeyOf(req.query.week || now());
  const logs = rows(
    "SELECT * FROM work_logs WHERE author = @author AND week_key = @weekKey ORDER BY log_date ASC, created_at ASC",
    { author, weekKey },
  );
  const summary = buildWeeklySummary(logs);
  const markdown = [
    `# ${author} 鍛ㄦ姤`,
    "",
    `- 鍛ㄨ捣濮嬶細${weekKey}`,
    `- 日报数量：${logs.length}`,
    "",
    "## AI 鎬荤粨",
    summary.summary,
    "",
    "## 本周完成",
    ...(summary.completedItems.length ? summary.completedItems.map((item) => `- ${item}`) : ["- 暂无结构化记录"]),
    "",
    "## 褰撳墠闃诲",
    ...(summary.blockers.length ? summary.blockers.map((item) => `- ${item}`) : ["- 鏆傛棤闃诲"]),
    "",
    "## 下周计划",
    ...(summary.nextPlans.length ? summary.nextPlans.map((item) => `- ${item}`) : ["- 暂无计划"]),
  ].join("\n");
  res.json(ok({ author, weekKey, count: logs.length, summary, markdown }));
});
app.get("/api/work-logs/team-weekly-summary", (req, res) => {
  if (!canViewTeamLogs(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队周报。");
  const projectFilter = resolveWorkLogProjectFilter(req.query);
  const project = projectFilter.name;
  const weekKey = weekKeyOf(req.query.week || now());
  const roleFilter = req.query.role ? normalizeRole(req.query.role) : "";
  let logs = rows(
    "SELECT * FROM work_logs WHERE week_key = @weekKey ORDER BY log_date ASC, created_at ASC",
    { weekKey },
  );
  logs = logs
    .map((item) => ({ ...item, projectId: item.project_id || null, project: item.project || "" }))
    .filter((item) => workLogMatchesProject(item, projectFilter));
  if (roleFilter) logs = logs.filter((item) => normalizeRole(item.role || "dev") === roleFilter);

  const projectUsers = collectProjectMembers(projectFilter);
  const submitted = new Set(logs.map((item) => `${item.author}::${normalizeRole(item.role || "dev")}`));
  const missingMembers = projectUsers
    .filter((user) => !roleFilter || normalizeRole(user.role) === roleFilter)
    .filter((user) => !submitted.has(`${user.name}::${normalizeRole(user.role)}`))
    .map((user) => ({ name: user.name, role: user.role }));

  res.json(ok(buildTeamWeeklySummary(logs, missingMembers, weekKey, project)));
});
app.post("/api/ai/requirements/:id/score", requirePermission("ai:*"), async (req, res, next) => {
  try {
  const score = requirementScore(req.params.id);
  if (!score) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  const recommendation = await createAiRequirementRecommendation(score);
  res.json(ok({ ...score, recommendation, modelUsed: resolveAiProviderConfig().model }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/business-advice", requirePermission("ai:*"), async (req, res, next) => {
  try {
    const targetType = String(req.body?.targetType || "").trim();
    const targetId = String(req.body?.targetId || "").trim();
    const allowedTypes = ["requirement", "project", "test_case", "defect", "build", "release", "document"];
    if (!allowedTypes.includes(targetType) || !targetId) {
      return fail(res, 400, "VALIDATION_FAILED", `targetType must be one of: ${allowedTypes.join(", ")}，targetId 为必填项。`);
    }
    const advice = await createBusinessAdvice({
      targetType,
      targetId,
      question: req.body?.question,
      draft: req.body?.draft,
    });
    if (!advice) return fail(res, 404, "RESOURCE_NOT_FOUND", "业务对象不存在，无法生成 AI 建议。");
    audit(req.user, "ai.business_advice", targetType, targetId, null, {
      targetType,
      targetId,
      fallback: advice.fallback,
      modelUsed: advice.modelUsed,
    }, req.ip);
    res.json(ok(advice));
  } catch (error) {
    next(error);
  }
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
  if (req.query.assignee) {
    sql += " AND assignee = @assignee";
    params.assignee = req.query.assignee;
  }
  const allItems = rows(sql, params).map(mapDefect);
  const data = paginatedResponse(allItems, req.query);
  res.json(ok(data));
});
app.post("/api/defects", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
  const { title, severity, status, projectId, requirementId, assignee, assigneeRole, foundInBuild, affectedVersion, reporter } = req.body || {};
  if (!title || !String(title).trim()) {
    return fail(res, 400, "VALIDATION_FAILED", "Defect title is required and cannot be empty.");
  }
  if (!projectId) {
    return fail(res, 400, "VALIDATION_FAILED", "Defect projectId is required.");
  }
  if (severity !== undefined && severity !== null && severity !== "" && !DEFECT_SEVERITIES.includes(severity)) {
    return fail(res, 400, "VALIDATION_FAILED", `Severity must be one of: ${DEFECT_SEVERITIES.join(", ")}`);
  }
  const defect = {
    id: nextId("BUG", "defects"),
    title: String(title).trim(),
    severity: severity || "medium",
    status: status || "new",
    project_id: projectId,
    requirement_id: requirementId || null,
    assignee: assignee || null,
    assignee_role: assigneeRole || (assignee ? "dev" : null),
    found_in_build: foundInBuild || null,
    affected_version: affectedVersion || null,
    reporter: reporter || req.user.name,
  };
  insert("defects", defect);
  syncDefectTask(defect);
  audit(req.user, "defect.create", "defect", defect.id, null, defect, req.ip);
  res.status(201).json(ok(mapDefect(row("SELECT * FROM defects WHERE id = @id", { id: defect.id }))));
});
app.patch("/api/defects/:id/status", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
  const before = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
  const { status } = req.body || {};
  if (!status || !DEFECT_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Defect status must be one of: ${DEFECT_STATUSES.join(", ")}`);
  }
  run("UPDATE defects SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  syncDefectTask(after);
  audit(req.user, "defect.status_update", "defect", req.params.id, before, after, req.ip);
  res.json(ok(mapDefect(after)));
});

app.patch("/api/defects/:id", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
  const before = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
  const { title, description, severity, assignee, assigneeRole, requirementId, foundInBuild, affectedVersion, status } = req.body || {};
  if (severity !== undefined && !DEFECT_SEVERITIES.includes(severity)) {
    return fail(res, 400, "VALIDATION_FAILED", `Severity must be one of: ${DEFECT_SEVERITIES.join(", ")}`);
  }
  if (status !== undefined && !DEFECT_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Defect status must be one of: ${DEFECT_STATUSES.join(", ")}`);
  }
  if (title !== undefined) run("UPDATE defects SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (description !== undefined) run("UPDATE defects SET description = @desc WHERE id = @id", { id: req.params.id, desc: description || null });
  if (severity !== undefined) run("UPDATE defects SET severity = @severity WHERE id = @id", { id: req.params.id, severity });
  if (assignee !== undefined) run("UPDATE defects SET assignee = @assignee WHERE id = @id", { id: req.params.id, assignee });
  if (assigneeRole !== undefined) run("UPDATE defects SET assignee_role = @assigneeRole WHERE id = @id", { id: req.params.id, assigneeRole });
  if (requirementId !== undefined) run("UPDATE defects SET requirement_id = @rid WHERE id = @id", { id: req.params.id, rid: requirementId });
  if (foundInBuild !== undefined) run("UPDATE defects SET found_in_build = @fb WHERE id = @id", { id: req.params.id, fb: foundInBuild || null });
  if (affectedVersion !== undefined) run("UPDATE defects SET affected_version = @av WHERE id = @id", { id: req.params.id, av: affectedVersion || null });
  if (status !== undefined) run("UPDATE defects SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  syncDefectTask(after);
  audit(req.user, "defect.update", "defect", req.params.id, before, after, req.ip);
  res.json(ok(mapDefect(after)));
});

app.delete("/api/defects/:id", requireAnyPermission(["project:*", "defect:*"]), (req, res) => {
  const before = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
  run("DELETE FROM defects WHERE id = @id", { id: req.params.id });
  run("DELETE FROM tasks WHERE source_type = 'defect' AND source_id = @id", { id: req.params.id });
  audit(req.user, "defect.delete", "defect", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});

// 鈹€鈹€ Users CRUD (G-4) 鈹€鈹€
app.get("/api/team/members", (req, res) => {
  if (!canViewTeamLogs(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队成员。");
  res.json(ok(buildTeamMembers()));
});

app.get("/api/users", requirePermission("admin:*"), (req, res) => {
  const { keyword, role, status } = req.query;
  let list = rows("SELECT * FROM users").map(mapUser);
  if (role) list = list.filter((u) => u.role === role);
  if (status) list = list.filter((u) => u.status === status);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((u) => u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw));
  }
  res.json(ok(paginatedResponse(list, req.query)));
});

app.get("/api/users/:id", requirePermission("admin:*"), (req, res) => {
  const user = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
  if (!user) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
  res.json(ok(mapUser(user)));
});

app.post("/api/users", requirePermission("admin:*"), (req, res) => {
  const { name, email, password, role, status, phone, position, department, bio } = req.body || {};
  if (!name || !email || !password || !role) {
    return fail(res, 400, "VALIDATION_FAILED", "name、email、password、role 均为必填项。");
  }
  if (!isSystemRole(role)) {
    return fail(res, 400, "VALIDATION_FAILED", `role must be one of: ${SYSTEM_ROLES.join(", ")}`);
  }
  const nextEmail = String(email).trim();
  const existing = row("SELECT id FROM users WHERE email = @email", { email: nextEmail });
  if (existing) return fail(res, 409, "CONFLICT", "该邮箱已被使用。");
  const defaultPermissions = defaultPermissionsForRole(role);
  const user = {
    id: nextId("USR", "users"),
    name: String(name).trim(),
    email: nextEmail,
    password_hash: bcrypt.hashSync(String(password), 10),
    role,
    permissions: json(defaultPermissions),
    status: status || "active",
    phone: phone !== undefined ? String(phone).trim() : "",
    position: position !== undefined ? String(position).trim() : "",
    department: department !== undefined ? String(department).trim() : "",
    bio: bio !== undefined ? String(bio).trim() : "",
    created_at: now(),
  };
  insert("users", user);
  audit(req.user, "user.create", "user", user.id, null, mapUser(user), req.ip);
  res.status(201).json(ok(mapUser(user)));
});

app.patch("/api/users/:id", requirePermission("admin:*"), (req, res) => {
  const before = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
  const { name, email, role, status, password, phone, position, department, bio } = req.body || {};
  if (
    name === undefined &&
    email === undefined &&
    role === undefined &&
    status === undefined &&
    password === undefined &&
    phone === undefined &&
    position === undefined &&
    department === undefined &&
    bio === undefined
  ) {
    return fail(res, 400, "VALIDATION_FAILED", "至少需要提供一个要更新的字段。");
  }
  if (email !== undefined) {
    const nextEmail = String(email).trim();
    if (!nextEmail) return fail(res, 400, "VALIDATION_FAILED", "email must not be empty");
    const duplicate = row("SELECT id FROM users WHERE email = @email AND id != @id", { email: nextEmail, id: req.params.id });
    if (duplicate) return fail(res, 409, "CONFLICT", "该邮箱已被其他用户使用。");
  }
  if (status === "disabled" && before.id === req.user.id) {
    return fail(res, 400, "VALIDATION_FAILED", "不能禁用自己。");
  }
  if (role !== undefined && !isSystemRole(role)) {
    return fail(res, 400, "VALIDATION_FAILED", `role must be one of: ${SYSTEM_ROLES.join(", ")}`);
  }
  if (role !== undefined && before.id === req.user.id && role !== before.role) {
    return fail(res, 400, "VALIDATION_FAILED", "不能修改自己的角色。");
  }
  const sameName = name === undefined || String(name).trim() === before.name;
  const sameEmail = email === undefined || String(email).trim() === before.email;
  const sameRole = role === undefined || role === before.role;
  const sameStatus = status === undefined || status === before.status;
  const samePassword = password === undefined;
  const samePhone = phone === undefined || String(phone).trim() === (before.phone || "");
  const samePosition = position === undefined || String(position).trim() === (before.position || "");
  const sameDepartment = department === undefined || String(department).trim() === (before.department || "");
  const sameBio = bio === undefined || String(bio).trim() === (before.bio || "");
  if (sameName && sameEmail && sameRole && sameStatus && samePassword && samePhone && samePosition && sameDepartment && sameBio) {
    return res.json(ok(mapUser(before)));
  }
  if (name !== undefined) run("UPDATE users SET name = @val WHERE id = @id", { id: req.params.id, val: String(name).trim() });
  if (email !== undefined) run("UPDATE users SET email = @val WHERE id = @id", { id: req.params.id, val: String(email).trim() });
  if (role !== undefined) {
    run("UPDATE users SET role = @val WHERE id = @id", { id: req.params.id, val: role });
    run("UPDATE users SET permissions = @permissions WHERE id = @id", {
      id: req.params.id,
      permissions: json(defaultPermissionsForRole(role)),
    });
  }
  if (status !== undefined) run("UPDATE users SET status = @val WHERE id = @id", { id: req.params.id, val: status });
  if (password !== undefined) run("UPDATE users SET password_hash = @val WHERE id = @id", { id: req.params.id, val: bcrypt.hashSync(String(password), 10) });
  if (phone !== undefined) run("UPDATE users SET phone = @val WHERE id = @id", { id: req.params.id, val: String(phone).trim() });
  if (position !== undefined) run("UPDATE users SET position = @val WHERE id = @id", { id: req.params.id, val: String(position).trim() });
  if (department !== undefined) run("UPDATE users SET department = @val WHERE id = @id", { id: req.params.id, val: String(department).trim() });
  if (bio !== undefined) run("UPDATE users SET bio = @val WHERE id = @id", { id: req.params.id, val: String(bio).trim() });
  const after = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
  audit(req.user, "user.update", "user", req.params.id, mapUser(before), mapUser(after), req.ip);
  res.json(ok(mapUser(after)));
});

app.delete("/api/users/:id", requirePermission("admin:*"), (req, res) => {
  const before = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
  if (before.id === req.user.id) return fail(res, 400, "VALIDATION_FAILED", "不能禁用当前登录用户。");
  if (before.status === "disabled") return res.json(ok({ disabled: true, id: req.params.id }));
  run("UPDATE users SET status = @status WHERE id = @id", { id: req.params.id, status: "disabled" });
  const after = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
  audit(req.user, "user.disable", "user", req.params.id, mapUser(before), mapUser(after), req.ip);
  res.json(ok({ disabled: true, id: req.params.id }));
});

app.get("/api/admin/ai-provider", requirePermission("admin:*"), (req, res) => {
  res.json(ok(publicAiProviderConfig()));
});

app.patch("/api/admin/ai-provider", requirePermission("admin:*"), (req, res) => {
  const before = resolveAiProviderConfig();
  const body = req.body || {};
  const stored = readStoredAiProviderList();
  const existing = body.id ? stored.providers.find((item) => item.id === String(body.id)) : null;
  const active = stored.providers.find((item) => item.id === stored.activeId) || stored.providers[0] || null;
  const base = body.createNew ? {} : existing || active || {};
  const next = normalizeAiProviderEntry({
    id: body.createNew ? providerConfigId() : body.id || base.id || providerConfigId(),
    name: body.name !== undefined ? body.name : base.name || body.provider || DEFAULT_AI_PROVIDER.provider,
    provider: body.provider !== undefined ? body.provider : base.provider || DEFAULT_AI_PROVIDER.provider,
    baseUrl: body.baseUrl !== undefined ? body.baseUrl : base.baseUrl || DEFAULT_AI_PROVIDER.baseUrl,
    model: body.model !== undefined ? body.model : base.model || DEFAULT_AI_PROVIDER.model,
    wireApi: body.wireApi !== undefined ? body.wireApi : base.wireApi || DEFAULT_AI_PROVIDER.wireApi,
    disableResponseStorage: body.disableResponseStorage !== undefined ? body.disableResponseStorage : base.disableResponseStorage,
    enabled: body.enabled !== undefined ? body.enabled : base.enabled !== undefined ? base.enabled : true,
    apiKey: base.apiKey || "",
    createdAt: base.createdAt || now(),
    updatedAt: now(),
  });

  if (body.clearApiKey) {
    next.apiKey = "";
  } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    next.apiKey = body.apiKey.trim();
  }

  if (!next.baseUrl || !next.model) return fail(res, 400, "VALIDATION_FAILED", "baseUrl 和 model 为必填项。");
  try {
    const url = new URL(next.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
  } catch {
    return fail(res, 400, "VALIDATION_FAILED", "baseUrl 必须是合法的 http/https 地址。");
  }

  const providers = existing || (!body.createNew && active)
    ? stored.providers.map((item) => item.id === next.id ? next : item)
    : [...stored.providers, next];
  const activeId = body.activate || body.createNew || !stored.activeId ? next.id : stored.activeId;
  writeStoredAiProviderList({ activeId, providers });
  writeStoredAiProviderConfig(next);
  resetAiProviderHealth();
  const after = resolveAiProviderConfig();
  audit(
    req.user,
    "admin.ai_provider_update",
    "app_setting",
    "ai_provider",
    publicAiProviderConfig(before),
    publicAiProviderConfig(after),
    req.ip,
  );
  res.json(ok(publicAiProviderConfig(after)));
});

app.post("/api/admin/ai-provider/:id/activate", requirePermission("admin:*"), (req, res) => {
  const before = resolveAiProviderConfig();
  const stored = readStoredAiProviderList();
  const target = stored.providers.find((item) => item.id === req.params.id);
  if (!target) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Provider config not found.");
  const providers = stored.providers.map((item) => item.id === target.id ? { ...item, enabled: true, updatedAt: now() } : item);
  writeStoredAiProviderList({ activeId: target.id, providers });
  writeStoredAiProviderConfig({ ...target, enabled: true, updatedAt: now() });
  resetAiProviderHealth();
  const after = resolveAiProviderConfig();
  audit(req.user, "admin.ai_provider_activate", "app_setting", target.id, publicAiProviderConfig(before), publicAiProviderConfig(after), req.ip);
  res.json(ok(publicAiProviderConfig(after)));
});

app.patch("/api/admin/ai-provider/:id/status", requirePermission("admin:*"), (req, res) => {
  const before = resolveAiProviderConfig();
  const stored = readStoredAiProviderList();
  const target = stored.providers.find((item) => item.id === req.params.id);
  if (!target) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Provider config not found.");
  const enabled = Boolean(req.body?.enabled);
  const providers = stored.providers.map((item) => item.id === target.id ? { ...item, enabled, updatedAt: now() } : item);
  writeStoredAiProviderList({ activeId: stored.activeId || target.id, providers });
  if ((stored.activeId || target.id) === target.id) writeStoredAiProviderConfig({ ...target, enabled, updatedAt: now() });
  resetAiProviderHealth();
  const after = resolveAiProviderConfig();
  audit(req.user, enabled ? "admin.ai_provider_enable" : "admin.ai_provider_disable", "app_setting", target.id, publicAiProviderConfig(before), publicAiProviderConfig(after), req.ip);
  res.json(ok(publicAiProviderConfig(after)));
});

app.delete("/api/admin/ai-provider/:id", requirePermission("admin:*"), (req, res) => {
  const before = resolveAiProviderConfig();
  const stored = readStoredAiProviderList();
  const target = stored.providers.find((item) => item.id === req.params.id);
  if (!target) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI Provider config not found.");
  const providers = stored.providers.filter((item) => item.id !== target.id);
  const activeId = stored.activeId === target.id ? (providers.find((item) => item.enabled)?.id || providers[0]?.id || null) : stored.activeId;
  writeStoredAiProviderList({ activeId, providers });
  const active = providers.find((item) => item.id === activeId);
  if (active) writeStoredAiProviderConfig(active);
  resetAiProviderHealth();
  const after = resolveAiProviderConfig();
  audit(req.user, "admin.ai_provider_delete", "app_setting", target.id, publicAiProviderConfig(before), publicAiProviderConfig(after), req.ip);
  res.json(ok(publicAiProviderConfig(after)));
});

app.post("/api/admin/ai-provider/test", requirePermission("admin:*"), async (req, res) => {
  const started = Date.now();
  const config = resolveAiProviderConfig();
  if (!config.enabled) {
    return fail(res, 400, "AI_PROVIDER_DISABLED", "Current AI Provider is disabled.");
  }
  if (!config.apiKey || !config.baseUrl || !config.model) {
    return fail(res, 400, "AI_PROVIDER_NOT_CONFIGURED", "请先配置 API Key、Base URL 和模型。");
  }
  try {
    const text = await callRealModel("请只回复：连接成功", { temperature: 0 });
    res.json(ok({
      ok: Boolean(text),
      latencyMs: Date.now() - started,
      sample: String(text || "").slice(0, 120),
      provider: publicAiProviderConfig(config),
    }));
  } catch (error) {
    res.status(502).json({
      errorCode: "AI_PROVIDER_TEST_FAILED",
      message: error.message || "AI provider 测试失败。",
      traceId: crypto.randomUUID(),
    });
  }
});

app.post("/api/ai/chat", requirePermission("ai:*"), async (req, res, next) => {
  try {
    const messages = normalizeAiChatMessages(req.body?.messages);
    const attachments = normalizeAiChatAttachments(req.body?.attachments);
    const scope = String(req.body?.scope || "project-management").slice(0, 80);
    const currentPage = String(req.body?.currentPage || "").slice(0, 120);
    if (!messages.length && !attachments.length) {
      return fail(res, 400, "VALIDATION_FAILED", "请输入问题或上传附件。");
    }

    const prompt = buildAiChatPrompt({ messages, attachments, scope, currentPage });
    let fallback = false;
    let content = await callRealModel(prompt, {
      system: "你是公司项目管理平台的 AI 对话助手，能阅读项目数据、用户上传文档和图片，并给出务实的项目管理建议。",
      attachments,
      temperature: 0.25,
      maxTokens: 1800,
      timeoutMs: 45000,
    }).catch((error) => {
      console.warn("AI chat fallback:", error.message);
      return null;
    });

    if (!content) {
      fallback = true;
      content = localAiChatReplyV2({ messages, attachments });
    }

    const config = publicAiProviderConfig();
    const payload = {
      id: `CHAT-${Date.now()}`,
      role: "assistant",
      content,
      createdAt: now(),
      modelUsed: fallback ? "local-rule-engine" : config.model,
      generatedBy: fallback ? "local-rule-engine" : config.provider,
      fallback,
      attachments: attachments.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        size: item.size,
        kind: item.kind,
      })),
      provider: config,
    };
    audit(req.user, "ai.chat", "ai_chat", payload.id, null, { scope, currentPage, attachments: payload.attachments }, req.ip);
    res.json(ok(payload));
  } catch (error) {
    next(error);
  }
});

app.get("/api/ai/summary", async (req, res, next) => {
  try {
  const aiProvider = publicAiProviderConfig();
  const jobs = rows("SELECT * FROM ai_jobs ORDER BY created_at DESC");
  const awaitingReview = jobs.filter((j) => j.status === "awaiting_review").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const running = jobs.filter((j) => j.status === "running").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const rejected = jobs.filter((j) => j.status === "rejected").length;
  const confirmed = jobs.filter((j) => j.status === "confirmed").length;
  const parsing = jobs.filter((j) => (j.progress || 0) < 100 && !["confirmed", "rejected", "failed"].includes(j.status)).length;
  const written = jobs.filter((j) => Boolean(j.written_requirement_id)).length;
  const totalProgress = jobs.length ? jobs.reduce((s, j) => s + (j.progress || 0), 0) : 0;
  const avgConfidence = jobs.length ? Math.round(totalProgress / jobs.length) : 0;
  const scope = req.query.scope || "dashboard";

  const metrics = {
    totalJobs: jobs.length,
    queued,
    running,
    awaitingReview,
    confirmed,
    rejected,
    failed,
    parsing,
    writtenToBusiness: written,
    avgConfidence,
    logAnalysis: row("SELECT COUNT(*) AS c FROM work_logs")?.c || 0,
  };
  const activeModel = aiProvider.configured ? `${aiProvider.model} / ${aiProvider.wireApi}` : "local-rule-engine";
  const modelRoutes = [
    { scene: "文档结构化分析", modelStrategy: activeModel, status: "active", humanReview: "需人工确认", audit: "全量记录" },
    { scene: "工作日志分析", modelStrategy: activeModel, status: "active", humanReview: "可选审核", audit: "全量记录" },
    { scene: "需求完成度评分", modelStrategy: activeModel, status: "active", humanReview: "需人工确认", audit: "全量记录" },
    { scene: "项目驾驶舱洞察", modelStrategy: activeModel, status: "active", humanReview: "建议复核", audit: "全量记录" },
  ];
  const recentJobs = jobs.slice(0, 8).map((j) => ({
    jobId: j.job_id,
    scene: j.scene,
    status: j.status,
    progress: j.progress,
    currentStep: j.current_step,
    errorMessage: j.error_message,
    retryCount: j.retry_count,
    createdAt: j.created_at,
  }));
  const aiSummary = await createAiSummary(scope, metrics, { cacheKey: req.query.fresh ? `${req.user?.role || "user"}:${Date.now()}` : req.user?.role || "user" });

  res.json(ok({
    scope,
    title: aiSummary.title,
    summary: aiSummary.summary,
    risks: aiSummary.risks,
    recommendations: aiSummary.recommendations,
    generatedBy: aiSummary.generatedBy,
    modelUsed: aiSummary.modelUsed,
    metrics,
    aiProvider,
    modelRoutes,
    recentJobs,
  }));
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  // Never leak internal error details to the client in production.
  const message = IS_PROD ? "服务器内部错误，请稍后再试。" : err.message || "Unexpected server error.";
  res.status(500).json({ errorCode: "INTERNAL_SERVER_ERROR", message, traceId: crypto.randomUUID() });
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

