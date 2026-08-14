const AI_ASSISTANT_SETTING_KEY = "ai_assistant";

const DEFAULT_AI_ASSISTANT = Object.freeze({
  name: "Platform AI Assistant",
  enabled: true,
  providerId: null,
  model: "",
  systemPrompt: "",
  temperature: 0.25,
  maxTokens: 1800,
});

function compactText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validTemperature(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : null;
}

function validMaxTokens(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 32768 ? parsed : null;
}

function createAiAssistantStore({
  json,
  now,
  parse,
  readProviderList,
  resolveActiveProvider,
  row,
  run,
}) {
  function normalize(value = {}, fallback = {}) {
    const fallbackTemperature = validTemperature(fallback.temperature) ?? DEFAULT_AI_ASSISTANT.temperature;
    const fallbackMaxTokens = validMaxTokens(fallback.maxTokens) ?? DEFAULT_AI_ASSISTANT.maxTokens;
    const name = compactText(value.name !== undefined ? value.name : fallback.name || DEFAULT_AI_ASSISTANT.name, 120);
    const providerId = compactText(value.providerId !== undefined ? value.providerId : fallback.providerId, 128) || null;
    const model = compactText(value.model !== undefined ? value.model : fallback.model, 160);
    const systemPrompt = compactText(value.systemPrompt !== undefined ? value.systemPrompt : fallback.systemPrompt, 12000);
    const temperature = validTemperature(value.temperature) ?? fallbackTemperature;
    const maxTokens = validMaxTokens(value.maxTokens) ?? fallbackMaxTokens;
    return {
      name: name || DEFAULT_AI_ASSISTANT.name,
      enabled: value.enabled !== undefined ? Boolean(value.enabled) : fallback.enabled !== undefined ? Boolean(fallback.enabled) : DEFAULT_AI_ASSISTANT.enabled,
      providerId,
      model,
      systemPrompt,
      temperature,
      maxTokens,
      updatedAt: value.updatedAt || fallback.updatedAt || null,
    };
  }

  async function read() {
    const setting = await row("SELECT value, updated_at FROM app_settings WHERE key = @key", { key: AI_ASSISTANT_SETTING_KEY });
    const stored = parse(setting?.value, {});
    return normalize({ ...stored, updatedAt: setting?.updated_at || stored.updatedAt || null });
  }

  async function write(config) {
    const normalized = normalize(config);
    const updatedAt = now();
    await run(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
      {
        key: AI_ASSISTANT_SETTING_KEY,
        value: json({ ...normalized, updatedAt }),
        updatedAt,
      },
    );
    return { ...normalized, updatedAt };
  }

  async function resolve(config = null) {
    const assistant = config || await read();
    const [providerList, activeProvider] = await Promise.all([
      readProviderList(),
      resolveActiveProvider(),
    ]);
    const providers = Array.isArray(providerList?.providers) ? providerList.providers : [];
    const selected = assistant.providerId ? providers.find((item) => item.id === assistant.providerId) : null;
    const selectedEnabled = Boolean(selected?.enabled);
    let provider = selectedEnabled ? selected : null;
    let fallback = Boolean(assistant.providerId && !selectedEnabled);
    if (!provider) {
      provider = activeProvider?.enabled
        ? activeProvider
        : providers.find((item) => item.id === providerList?.activeId && item.enabled)
          || providers.find((item) => item.enabled)
          || activeProvider
          || null;
    }
    const model = assistant.model || provider?.model || "";
    const available = Boolean(assistant.enabled && provider?.enabled && provider?.baseUrl && model);
    return {
      ...assistant,
      resolvedProvider: provider,
      resolvedProviderId: provider?.id || null,
      resolvedModel: model || null,
      fallback,
      available,
    };
  }

  function publicConfig(value = {}, { includeSystemPrompt = false, resolved } = {}) {
    const config = normalize(value);
    const result = {
      name: config.name,
      enabled: config.enabled,
      providerId: config.providerId,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      systemPromptConfigured: Boolean(config.systemPrompt),
      updatedAt: config.updatedAt,
    };
    if (includeSystemPrompt) result.systemPrompt = config.systemPrompt;
    if (resolved) {
      result.resolvedProviderId = resolved.resolvedProviderId || null;
      result.resolvedProviderName = resolved.resolvedProvider?.name || resolved.resolvedProvider?.provider || null;
      result.resolvedModel = resolved.resolvedModel || null;
      result.available = Boolean(resolved.available);
      result.providerFallback = Boolean(resolved.fallback);
    }
    return result;
  }

  return {
    normalize,
    publicConfig,
    read,
    resolve,
    write,
  };
}

module.exports = {
  AI_ASSISTANT_SETTING_KEY,
  DEFAULT_AI_ASSISTANT,
  createAiAssistantStore,
  validMaxTokens,
  validTemperature,
};
