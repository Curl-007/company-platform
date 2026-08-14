const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiProviderAdminService } = require("../src/modules/ai/providerAdminService");

test("AI provider admin service validates endpoints and preserves a masked public view", async () => {
  let stored = {
    activeId: "AIP-001",
    providers: [{ id: "AIP-001", name: "Primary", provider: "openai-compatible", baseUrl: "https://example.test/v1", model: "model-1", wireApi: "chat_completions", enabled: true, apiKey: "old-secret", createdAt: "2026-07-13T00:00:00Z" }],
  };
  const publicConfig = async (config = active()) => ({ id: config.id, enabled: config.enabled, model: config.model, apiKeyMasked: config.apiKey ? "old...cret" : "", activeId: stored.activeId, providers: stored.providers.map((item) => ({ id: item.id, enabled: item.enabled })) });
  const active = () => stored.providers.find((item) => item.id === stored.activeId) || {};
  const service = createAiProviderAdminService({
    defaults: { provider: "openai-compatible", baseUrl: "https://default.test/v1", model: "default", wireApi: "chat_completions" },
    normalizeEntry: (value) => ({ ...value }),
    now: () => "2026-07-13T10:00:00Z",
    providerConfigId: () => "AIP-002",
    publicConfig,
    readActive: async () => active(),
    readList: async () => stored,
    resetHealth: async () => {},
    writeActive: async () => {},
    writeList: async (next) => { stored = next; },
  });

  await assert.rejects(() => service.update({ baseUrl: "ftp://bad.example", model: "test" }), { code: "VALIDATION_FAILED" });
  const created = await service.update({ createNew: true, name: "Secondary", provider: "compatible", baseUrl: "https://secondary.test/v1", model: "model-2", apiKey: "new-secret" });
  assert.equal(created.after.id, "AIP-002");
  assert.equal(stored.providers.length, 2);
  assert.equal(stored.activeId, "AIP-002");
  const disabled = await service.setStatus("AIP-002", false);
  assert.equal(disabled.enabled, false);
  assert.equal((await service.get()).apiKeyMasked, "old...cret");
  await assert.rejects(() => service.activate("AIP-MISSING"), { code: "RESOURCE_NOT_FOUND" });
});

test("AI provider admin service tests drafts without persistence and discovers models from a selected no-key Provider", async () => {
  let writes = 0;
  let stored = {
    activeId: "AIP-001",
    providers: [
      { id: "AIP-001", name: "Primary", provider: "openai-compatible", baseUrl: "https://primary.test/v1", model: "primary-model", wireApi: "chat_completions", enabled: true, apiKey: "primary-secret" },
      { id: "AIP-002", name: "Local", provider: "openai-compatible", baseUrl: "http://192.168.3.18:8000/v1", model: "local-model", wireApi: "chat_completions", enabled: false, apiKey: "" },
    ],
  };
  const requests = [];
  const active = () => stored.providers.find((item) => item.id === stored.activeId);
  const service = createAiProviderAdminService({
    defaults: { provider: "openai-compatible", baseUrl: "https://default.test/v1", model: "default", wireApi: "chat_completions" },
    normalizeEntry: (value) => ({ ...value }),
    now: () => "2026-07-13T10:00:00Z",
    providerConfigId: () => "AIP-NEW",
    publicConfig: async (config = active()) => ({ ...config, activeId: stored.activeId, providers: stored.providers }),
    readActive: async () => active(),
    readList: async () => stored,
    requestImpl: async (...args) => {
      requests.push(args);
      return {
        ok: true,
        json: async () => ({ data: [{ id: "local-model" }, { id: "new-local-model" }] }),
      };
    },
    resetHealth: async () => { writes += 1; },
    validateBaseUrl: async (value) => new URL(value),
    writeActive: async () => { writes += 1; },
    writeList: async () => { writes += 1; },
  });

  const draft = await service.prepareTest({
    id: "AIP-002",
    baseUrl: "http://192.168.3.18:8000/v1/",
    enabled: false,
    model: "new-local-model",
  });
  assert.equal(draft.id, "AIP-002");
  assert.equal(draft.enabled, true);
  assert.equal(draft.baseUrl, "http://192.168.3.18:8000/v1/");
  assert.equal(writes, 0);
  await assert.rejects(() => service.prepareTest({ id: "AIP-404" }), { code: "RESOURCE_NOT_FOUND" });

  const models = await service.listModels("AIP-002");
  assert.equal(models.currentModel, "local-model");
  assert.equal(models.models.length, 2);
  assert.equal(requests[0][0], "http://192.168.3.18:8000/v1");
  assert.equal(Object.hasOwn(requests[0][2].headers, "Authorization"), false);
  await assert.rejects(() => service.listModels("AIP-404"), { code: "RESOURCE_NOT_FOUND" });
});
