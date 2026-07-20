function providerError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function createAiProviderAdminService({
  defaults,
  normalizeEntry,
  now,
  providerConfigId,
  publicConfig,
  readActive,
  readList,
  resetHealth,
  writeActive,
  writeList,
}) {
  function validate(entry) {
    if (!entry.baseUrl || !entry.model) throw providerError("VALIDATION_FAILED", "baseUrl 和 model 为必填项。", 400);
    try {
      const url = new URL(entry.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("invalid protocol");
    } catch {
      throw providerError("VALIDATION_FAILED", "baseUrl 必须是合法的 http/https 地址。", 400);
    }
  }

  function persist({ activeId, providers, legacyActive }) {
    writeList({ activeId, providers });
    if (legacyActive) writeActive(legacyActive);
    resetHealth();
    return { activeId, providers };
  }

  return {
    get() {
      return publicConfig();
    },
    update(body = {}) {
      const before = readActive();
      const stored = readList();
      const existing = body.id ? stored.providers.find((item) => item.id === String(body.id)) : null;
      if (body.id && !existing) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const active = stored.providers.find((item) => item.id === stored.activeId) || stored.providers[0] || null;
      const base = body.createNew ? {} : existing || active || {};
      const next = normalizeEntry({
        id: body.createNew ? providerConfigId() : body.id || base.id || providerConfigId(),
        name: body.name !== undefined ? body.name : base.name || body.provider || defaults.provider,
        provider: body.provider !== undefined ? body.provider : base.provider || defaults.provider,
        baseUrl: body.baseUrl !== undefined ? body.baseUrl : base.baseUrl || defaults.baseUrl,
        model: body.model !== undefined ? body.model : base.model || defaults.model,
        wireApi: body.wireApi !== undefined ? body.wireApi : base.wireApi || defaults.wireApi,
        disableResponseStorage: body.disableResponseStorage !== undefined ? body.disableResponseStorage : base.disableResponseStorage,
        enabled: body.enabled !== undefined ? body.enabled : base.enabled !== undefined ? base.enabled : true,
        apiKey: base.apiKey || "",
        createdAt: base.createdAt || now(),
        updatedAt: now(),
      });
      if (body.clearApiKey) {
        next.apiKey = "";
        next.apiKeyEncrypted = "";
      } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
        next.apiKey = body.apiKey.trim();
      }
      validate(next);
      const providers = body.createNew ? [...stored.providers, next] : stored.providers.map((item) => item.id === next.id ? next : item);
      const activeId = body.activate || body.createNew || !stored.activeId ? next.id : stored.activeId;
      persist({ activeId, providers, legacyActive: next });
      return { before: publicConfig(before), after: publicConfig(readActive()), resourceId: next.id };
    },
    activate(id) {
      const before = readActive();
      const stored = readList();
      const target = stored.providers.find((item) => item.id === id);
      if (!target) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const providers = stored.providers.map((item) => item.id === target.id ? { ...item, enabled: true, updatedAt: now() } : item);
      const active = providers.find((item) => item.id === target.id);
      persist({ activeId: target.id, providers, legacyActive: active });
      return { before: publicConfig(before), after: publicConfig(readActive()), resourceId: target.id };
    },
    setStatus(id, enabled) {
      const before = readActive();
      const stored = readList();
      const target = stored.providers.find((item) => item.id === id);
      if (!target) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const updated = { ...target, enabled: Boolean(enabled), updatedAt: now() };
      const providers = stored.providers.map((item) => item.id === target.id ? updated : item);
      const activeId = stored.activeId || target.id;
      persist({ activeId, providers, legacyActive: activeId === target.id ? updated : null });
      return { before: publicConfig(before), after: publicConfig(readActive()), resourceId: target.id, enabled: Boolean(enabled) };
    },
    remove(id) {
      const before = readActive();
      const stored = readList();
      const target = stored.providers.find((item) => item.id === id);
      if (!target) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const providers = stored.providers.filter((item) => item.id !== target.id);
      const activeId = stored.activeId === target.id ? (providers.find((item) => item.enabled)?.id || providers[0]?.id || null) : stored.activeId;
      const active = providers.find((item) => item.id === activeId) || null;
      persist({ activeId, providers, legacyActive: active });
      return { before: publicConfig(before), after: publicConfig(readActive()), resourceId: target.id };
    },
  };
}

module.exports = { createAiProviderAdminService };
