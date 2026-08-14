const { requestAiProviderUrl, validateAiProviderBaseUrl } = require("./outboundUrlPolicy");

function providerError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeModelId(value) {
  return String(value || "").trim();
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
  requestImpl = requestAiProviderUrl,
  validateBaseUrl = validateAiProviderBaseUrl,
  writeActive,
  writeList,
}) {
  async function validate(entry) {
    if (!entry.baseUrl || !entry.model) {
      throw providerError("VALIDATION_FAILED", "baseUrl and model are required.", 400);
    }
    try {
      await validateBaseUrl(entry.baseUrl);
    } catch (error) {
      throw providerError("VALIDATION_FAILED", error?.message || "AI Provider baseUrl must be a valid, allowed http/https URL.", 400);
    }
  }

  async function persist({ activeId, providers, legacyActive }) {
    await writeList({ activeId, providers });
    if (legacyActive) await writeActive(legacyActive);
    await resetHealth();
    return { activeId, providers };
  }

  // Keeps save and test semantics identical, including an unsaved API key that
  // must never be written merely because an administrator ran a connection test.
  async function draftEntry(body = {}) {
    const stored = await readList();
    const requestedId = body.id === undefined || body.id === null ? "" : String(body.id).trim();
    const existing = requestedId ? stored.providers.find((item) => item.id === requestedId) : null;
    if (requestedId && !existing && !body.createNew) {
      throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
    }
    const active = stored.providers.find((item) => item.id === stored.activeId) || stored.providers[0] || null;
    const base = body.createNew ? {} : existing || active || {};
    const next = normalizeEntry({
      id: body.createNew ? providerConfigId() : requestedId || base.id || providerConfigId(),
      name: body.name !== undefined ? body.name : base.name || body.provider || defaults.provider,
      preset: body.preset !== undefined ? body.preset : base.preset || "custom",
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
      next.apiKeyEncrypted = "";
    }
    return { next, stored };
  }

  async function selectedProvider(id) {
    const requestedId = String(id || "").trim();
    if (!requestedId) return readActive();
    const stored = await readList();
    const selected = stored.providers.find((item) => item.id === requestedId);
    if (!selected) throw providerError("RESOURCE_NOT_FOUND", "AI Provider config not found.", 404);
    return {
      ...selected,
      apiKeySource: selected.apiKey ? "database" : "none",
    };
  }

  return {
    async get() {
      return publicConfig();
    },
    async update(body = {}) {
      const before = await readActive();
      const { next, stored } = await draftEntry(body);
      await validate(next);
      const providers = body.createNew
        ? [...stored.providers, next]
        : stored.providers.some((item) => item.id === next.id)
          ? stored.providers.map((item) => (item.id === next.id ? next : item))
          : [...stored.providers, next];
      const activeId = body.activate || body.createNew || !stored.activeId ? next.id : stored.activeId;
      await persist({ activeId, providers, legacyActive: next });
      return { before: await publicConfig(before), after: await publicConfig(await readActive()), resourceId: next.id };
    },
    async prepareTest(body = {}) {
      const { next } = await draftEntry(body);
      await validate(next);
      // Connection testing is an admin-only diagnostic, so a draft need not be
      // the active profile or enabled before it can be checked.
      return { ...next, enabled: true };
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
    async listModels(id) {
      const provider = await selectedProvider(id);
      if (!provider?.baseUrl) {
        throw providerError("AI_PROVIDER_NOT_CONFIGURED", "Please configure a Base URL before loading models.", 400);
      }
      try {
        await validateBaseUrl(provider.baseUrl);
      } catch (error) {
        throw providerError("VALIDATION_FAILED", error?.message || "AI Provider baseUrl must be valid and allowed.", 400);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const headers = { Accept: "application/json" };
        if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
        const response = await requestImpl(provider.baseUrl, "models", {
          method: "GET",
          headers,
          signal: controller.signal,
          redirect: "error",
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw providerError(
            "AI_PROVIDER_MODELS_FAILED",
            `Loading models failed: ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`,
            502,
          );
        }
        const payload = await response.json().catch(() => ({}));
        const rawItems = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.models)
            ? payload.models
            : Array.isArray(payload)
              ? payload
              : [];
        const models = [];
        const seen = new Set();
        for (const item of rawItems) {
          const modelId = normalizeModelId(item?.id || item?.name || item?.model);
          if (!modelId || seen.has(modelId)) continue;
          seen.add(modelId);
          models.push({
            id: modelId,
            name: normalizeModelId(item?.name || item?.id || modelId),
            ownedBy: normalizeModelId(item?.owned_by || item?.ownedBy || item?.publisher || "") || null,
          });
        }
        const currentModel = normalizeModelId(provider.model);
        if (currentModel && !seen.has(currentModel)) {
          models.unshift({ id: currentModel, name: currentModel, ownedBy: null });
        }
        models.sort((left, right) => left.id.localeCompare(right.id, "en"));
        return {
          ok: true,
          count: models.length,
          currentModel: currentModel || null,
          models,
          provider: await publicConfig(provider),
        };
      } catch (error) {
        if (error?.code && String(error.code).startsWith("AI_PROVIDER_")) throw error;
        throw providerError("AI_PROVIDER_MODELS_FAILED", error?.message || "Loading models failed.", 502);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

module.exports = { createAiProviderAdminService };
