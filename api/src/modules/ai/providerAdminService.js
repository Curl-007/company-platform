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

  async function persist({ activeId, providers, legacyActive }) {
    await writeList({ activeId, providers });
    if (legacyActive) await writeActive(legacyActive);
    await resetHealth();
    return { activeId, providers };
  }

  return {
    async get() {
      return publicConfig();
    },
    async update(body = {}) {
      const before = await readActive();
      const stored = await readList();
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
        apiKeyEncrypted: base.apiKeyEncrypted || "",
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
      const providers = body.createNew
        ? [...stored.providers, next]
        : stored.providers.some((item) => item.id === next.id)
          ? stored.providers.map((item) => (item.id === next.id ? next : item))
          : [...stored.providers, next];
      const activeId = body.activate || body.createNew || !stored.activeId ? next.id : stored.activeId;
      await persist({ activeId, providers, legacyActive: next });
      return { before: await publicConfig(before), after: await publicConfig(await readActive()), resourceId: next.id };
    },
    async activate(id) {
      const before = await readActive();
      const stored = await readList();
      const target = stored.providers.find((item) => item.id === id);
      if (!target) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const providers = stored.providers.map((item) => item.id === target.id ? { ...item, enabled: true, updatedAt: now() } : item);
      const active = providers.find((item) => item.id === target.id);
      await persist({ activeId: target.id, providers, legacyActive: active });
      return { before: await publicConfig(before), after: await publicConfig(await readActive()), resourceId: target.id };
    },
    async setStatus(id, enabled) {
      const before = await readActive();
      const stored = await readList();
      const target = stored.providers.find((item) => item.id === id);
      if (!target) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const updated = { ...target, enabled: Boolean(enabled), updatedAt: now() };
      const providers = stored.providers.map((item) => item.id === target.id ? updated : item);
      const activeId = stored.activeId || target.id;
      await persist({ activeId, providers, legacyActive: activeId === target.id ? updated : null });
      return { before: await publicConfig(before), after: await publicConfig(await readActive()), resourceId: target.id, enabled: Boolean(enabled) };
    },
    async remove(id) {
      const before = await readActive();
      const stored = await readList();
      const target = stored.providers.find((item) => item.id === id);
      if (!target) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
      const providers = stored.providers.filter((item) => item.id !== target.id);
      const activeId = stored.activeId === target.id ? (providers.find((item) => item.enabled)?.id || providers[0]?.id || null) : stored.activeId;
      const active = providers.find((item) => item.id === activeId) || null;
      await persist({ activeId, providers, legacyActive: active });
      return { before: await publicConfig(before), after: await publicConfig(await readActive()), resourceId: target.id };
    },
  };
}

module.exports = { createAiProviderAdminService };
