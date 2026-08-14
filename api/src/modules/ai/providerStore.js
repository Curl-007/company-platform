const AI_HEALTH_RECENT_FAILURE_WINDOW_MS = 30 * 60 * 1000;

function normalizeAiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function createAiProviderStore({
  defaults,
  row,
  run,
  json,
  parse,
  now,
  secretCodec,
  normalizeWireApi,
  env = process.env,
}) {
  function providerConfigId() {
    return `AIP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  }

  function hydrateSecret(value = {}) {
    const encrypted = String(value.apiKeyEncrypted || "");
    const legacyPlaintext = encrypted ? "" : String(value.apiKey || "");
    return {
      ...value,
      apiKey: encrypted ? secretCodec.decrypt(encrypted) : legacyPlaintext,
      apiKeyEncrypted: encrypted,
    };
  }

  function serializeSecret(value = {}) {
    const { apiKey, ...rest } = value;
    const next = { ...rest };
    if (apiKey) {
      if (!secretCodec.available) throw new Error("AI_CONFIG_ENCRYPTION_KEY is required to store an API key (production must set a dedicated key independent from JWT_SECRET).");
      next.apiKeyEncrypted = secretCodec.encrypt(apiKey);
    } else if (!next.apiKeyEncrypted) {
      delete next.apiKeyEncrypted;
    }
    return next;
  }

  function normalizeEntry(value = {}, fallback = {}) {
    const createdAt = value.createdAt || fallback.createdAt || now();
    return {
      id: String(value.id || fallback.id || providerConfigId()),
      name: String(value.name || fallback.name || value.provider || fallback.provider || "默认模型").trim(),
      preset: String(value.preset !== undefined ? value.preset : fallback.preset || "custom").trim() || "custom",
      provider: String(value.provider || fallback.provider || defaults.provider).trim() || defaults.provider,
      baseUrl: normalizeAiBaseUrl(value.baseUrl !== undefined ? value.baseUrl : fallback.baseUrl || defaults.baseUrl),
      model: String(value.model !== undefined ? value.model : fallback.model || defaults.model).trim(),
      wireApi: normalizeWireApi(value.wireApi !== undefined ? value.wireApi : fallback.wireApi || defaults.wireApi),
      disableResponseStorage: value.disableResponseStorage !== undefined
        ? Boolean(value.disableResponseStorage)
        : fallback.disableResponseStorage !== undefined ? Boolean(fallback.disableResponseStorage) : defaults.disableResponseStorage,
      enabled: value.enabled !== undefined
        ? Boolean(value.enabled)
        : fallback.enabled !== undefined ? Boolean(fallback.enabled) : defaults.enabled,
      apiKey: value.apiKey !== undefined ? String(value.apiKey || "") : String(fallback.apiKey || ""),
      apiKeyEncrypted: value.apiKeyEncrypted !== undefined ? String(value.apiKeyEncrypted || "") : String(fallback.apiKeyEncrypted || ""),
      createdAt,
      updatedAt: value.updatedAt || fallback.updatedAt || createdAt,
    };
  }

  async function readActiveConfig() {
    const setting = await row("SELECT value, updated_at FROM app_settings WHERE key = @key", { key: "ai_provider" });
    return hydrateSecret({ ...parse(setting?.value, {}), updatedAt: setting?.updated_at || null });
  }

  async function writeActiveConfig(config) {
    await run(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
      { key: "ai_provider", value: json(serializeSecret(config)), updatedAt: now() },
    );
  }

  async function readList() {
    const setting = await row("SELECT value, updated_at FROM app_settings WHERE key = @key", { key: "ai_providers" });
    const stored = parse(setting?.value, {});
    const storedItems = Array.isArray(stored.providers) ? stored.providers : Array.isArray(stored.items) ? stored.items : [];
    if (setting && storedItems.length === 0) {
      return { activeId: null, providers: [], updatedAt: setting.updated_at || null };
    }
    if (storedItems.length) {
      const providers = storedItems.map((item) => normalizeEntry(hydrateSecret(item)));
      const activeId = providers.some((item) => item.id === stored.activeId) ? stored.activeId : providers[0]?.id || null;
      return { activeId, providers, updatedAt: setting?.updated_at || null };
    }

    const legacy = await readActiveConfig();
    const hasLegacy = Boolean(legacy.provider || legacy.baseUrl || legacy.model || legacy.apiKey);
    if (hasLegacy) {
      const migrated = normalizeEntry({
        ...legacy,
        id: legacy.id || "AIP-LEGACY",
        name: legacy.name || legacy.provider || "默认模型",
        enabled: legacy.enabled !== undefined ? legacy.enabled : defaults.enabled,
      });
      return { activeId: migrated.id, providers: [migrated], updatedAt: legacy.updatedAt || null };
    }

    const envApiKey = env.OPENAI_API_KEY || env.AI_API_KEY || "";
    const defaultProvider = normalizeEntry({
      id: "AIP-DEFAULT",
      name: defaults.provider,
      ...defaults,
      apiKey: envApiKey,
    });
    return { activeId: defaultProvider.id, providers: [defaultProvider], updatedAt: null };
  }

  async function writeList(config) {
    await run(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
      {
        key: "ai_providers",
        value: json({
          activeId: config.activeId || null,
          providers: (config.providers || []).map(serializeSecret),
        }),
        updatedAt: now(),
      },
    );
  }

  async function readHealth() {
    const setting = await row("SELECT value FROM app_settings WHERE key = @key", { key: "ai_provider_health" });
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

  const health = {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastLatencyMs: null,
    lastWireApi: null,
    lastErrorMessage: "",
    lastErrorCode: "",
    consecutiveFailures: 0,
    _loaded: false,
  };

  async function ensureHealth() {
    if (health._loaded) return health;
    Object.assign(health, await readHealth());
    health._loaded = true;
    return health;
  }

  async function writeHealth() {
    const { _loaded, ...payload } = health;
    await run(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
      { key: "ai_provider_health", value: json(payload), updatedAt: now() },
    );
  }

  async function resolveConfig() {
    const storedList = await readList();
    if (storedList.providers.length === 0) {
      return {
        id: null,
        name: "",
        preset: "custom",
        provider: "",
        baseUrl: "",
        model: "",
        wireApi: defaults.wireApi,
        disableResponseStorage: defaults.disableResponseStorage,
        enabled: false,
        apiKey: "",
        apiKeySource: "none",
        updatedAt: storedList.updatedAt || null,
      };
    }
    const active = storedList.providers.find((item) => item.id === storedList.activeId) || storedList.providers[0] || {};
    const apiKey = active.apiKey || env.OPENAI_API_KEY || env.AI_API_KEY || "";
    return {
      id: active.id || null,
      name: active.name || active.provider || defaults.provider,
      preset: active.preset || "custom",
      provider: active.provider || defaults.provider,
      baseUrl: normalizeAiBaseUrl(active.baseUrl || defaults.baseUrl),
      model: active.model || defaults.model,
      wireApi: normalizeWireApi(active.wireApi || defaults.wireApi),
      disableResponseStorage: active.disableResponseStorage !== undefined
        ? Boolean(active.disableResponseStorage)
        : defaults.disableResponseStorage,
      enabled: active.enabled !== undefined ? Boolean(active.enabled) : defaults.enabled,
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

  function publicListItem(item) {
    let baseUrlHost = "";
    try { baseUrlHost = new URL(item.baseUrl).host; } catch { baseUrlHost = ""; }
    return {
      id: item.id,
      name: item.name,
      preset: item.preset || "custom",
      provider: item.provider,
      baseUrl: item.baseUrl,
      baseUrlHost,
      model: item.model,
      wireApi: item.wireApi,
      disableResponseStorage: item.disableResponseStorage,
      enabled: Boolean(item.enabled),
      // OpenAI-compatible local runtimes can deliberately run without a key.
      configured: Boolean(item.enabled && item.baseUrl && item.model),
      apiKeyMasked: maskSecret(item.apiKey),
      apiKeySource: item.apiKey ? "database" : "none",
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    };
  }

  async function publicHealth(configured = true, enabled = true) {
    await ensureHealth();
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

    const lastFailureMs = health.lastFailureAt ? Date.parse(health.lastFailureAt) : 0;
    const lastSuccessMs = health.lastSuccessAt ? Date.parse(health.lastSuccessAt) : 0;
    // A later successful call recovers the displayed health immediately. Keep a
    // recent error degraded only when there is no newer success (or legacy data
    // lacks the matching consecutive-failure count).
    const hasRecentFailureWithoutRecovery = lastFailureMs > lastSuccessMs
      && Date.now() - lastFailureMs < AI_HEALTH_RECENT_FAILURE_WINDOW_MS;
    // Treat equal timestamps as unrecovered only while failures are still open,
    // so fixed clocks and sub-second success→failure sequences stay degraded.
    const hasUnrecoveredFailure = health.consecutiveFailures > 0 && lastFailureMs >= lastSuccessMs;
    const status = hasUnrecoveredFailure && health.consecutiveFailures >= 2
      ? "unavailable"
      : hasUnrecoveredFailure || hasRecentFailureWithoutRecovery
        ? "degraded"
        : health.lastSuccessAt
          ? "healthy"
          : "unknown";

    const { _loaded, ...healthFields } = health;
    return { status, ...healthFields };
  }

  async function publicConfig(config) {
    const resolved = config || await resolveConfig();
    let baseUrlHost = "";
    try { baseUrlHost = new URL(resolved.baseUrl).host; } catch { baseUrlHost = ""; }
    // A key is optional for local OpenAI-compatible providers. Whether one is
    // present is still surfaced separately through apiKeySource/masked value.
    const configured = Boolean(resolved.enabled && resolved.baseUrl && resolved.model);
    const storedList = await readList();
    config = resolved;
    return {
      id: config.id,
      name: config.name,
      preset: config.preset || "custom",
      provider: config.provider,
      baseUrl: config.baseUrl,
      baseUrlHost,
      model: config.model,
      wireApi: config.wireApi,
      disableResponseStorage: config.disableResponseStorage,
      enabled: Boolean(config.enabled),
      configured,
      apiKeyMasked: maskSecret(config.apiKey),
      apiKeySource: config.apiKeySource || (config.apiKey ? "database" : "none"),
      updatedAt: config.updatedAt,
      health: await publicHealth(configured, Boolean(config.enabled)),
      activeId: storedList.activeId,
      providers: storedList.providers.map(publicListItem),
    };
  }

  async function resetHealth() {
    Object.assign(health, {
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastLatencyMs: null,
      lastWireApi: null,
      lastErrorMessage: "",
      lastErrorCode: "",
      consecutiveFailures: 0,
    });
    await writeHealth();
  }

  function sanitizeError(error) {
    const raw = String(error?.message || error || "Unknown AI provider error")
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/sk-[A-Za-z0-9._~+/=-]+/gi, "sk-[redacted]")
      .replace(/\s+/g, " ")
      .trim();
    return raw.slice(0, 360);
  }

  function errorCode(error) {
    if (error?.status) return String(error.status);
    const match = String(error?.message || "").match(/\b(4\d\d|5\d\d)\b/);
    return match ? match[1] : "";
  }

  async function recordSuccess({ wireApi, latencyMs }) {
    await ensureHealth();
    health.lastAttemptAt = now();
    health.lastSuccessAt = health.lastAttemptAt;
    health.lastLatencyMs = latencyMs;
    health.lastWireApi = wireApi;
    health.consecutiveFailures = 0;
    await writeHealth();
  }

  async function recordFailure(error, { wireApi, latencyMs }) {
    await ensureHealth();
    health.lastAttemptAt = now();
    health.lastFailureAt = health.lastAttemptAt;
    health.lastLatencyMs = latencyMs;
    health.lastWireApi = wireApi;
    health.lastErrorMessage = sanitizeError(error);
    health.lastErrorCode = errorCode(error);
    health.consecutiveFailures += 1;
    await writeHealth();
  }

  async function migrateSecrets() {
    const listSetting = await row("SELECT value FROM app_settings WHERE key = @key", { key: "ai_providers" });
    const list = parse(listSetting?.value, {});
    const items = Array.isArray(list.providers) ? list.providers : Array.isArray(list.items) ? list.items : [];
    if (items.some((item) => item?.apiKey && !item?.apiKeyEncrypted)) {
      await writeList({
        activeId: list.activeId || items[0]?.id || null,
        providers: items.map((item) => normalizeEntry(hydrateSecret(item))),
      });
    }

    const legacySetting = await row("SELECT value FROM app_settings WHERE key = @key", { key: "ai_provider" });
    const legacy = parse(legacySetting?.value, {});
    if (legacy?.apiKey && !legacy?.apiKeyEncrypted) {
      await writeActiveConfig(hydrateSecret(legacy));
    }
  }

  return {
    hydrateSecret,
    maskSecret,
    migrateSecrets,
    normalizeBaseUrl: normalizeAiBaseUrl,
    normalizeEntry,
    providerConfigId,
    publicConfig,
    publicHealth,
    publicListItem,
    readActiveConfig,
    readList,
    recordFailure,
    recordSuccess,
    resetHealth,
    resolveConfig,
    serializeSecret,
    writeActiveConfig,
    writeList,
  };
}

module.exports = {
  AI_HEALTH_RECENT_FAILURE_WINDOW_MS,
  createAiProviderStore,
  normalizeAiBaseUrl,
};
