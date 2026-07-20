const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiProviderAdminService } = require("../src/modules/ai/providerAdminService");

test("AI provider admin service validates endpoints and preserves a masked public view", () => {
  let stored = {
    activeId: "AIP-001",
    providers: [{ id: "AIP-001", name: "Primary", provider: "openai-compatible", baseUrl: "https://example.test/v1", model: "model-1", wireApi: "chat_completions", enabled: true, apiKey: "old-secret", createdAt: "2026-07-13T00:00:00Z" }],
  };
  const publicConfig = (config = active()) => ({ id: config.id, enabled: config.enabled, model: config.model, apiKeyMasked: config.apiKey ? "old...cret" : "", activeId: stored.activeId, providers: stored.providers.map((item) => ({ id: item.id, enabled: item.enabled })) });
  const active = () => stored.providers.find((item) => item.id === stored.activeId) || {};
  const service = createAiProviderAdminService({
    defaults: { provider: "openai-compatible", baseUrl: "https://default.test/v1", model: "default", wireApi: "chat_completions" },
    normalizeEntry: (value) => ({ ...value }),
    now: () => "2026-07-13T10:00:00Z",
    providerConfigId: () => "AIP-002",
    publicConfig,
    readActive: active,
    readList: () => stored,
    resetHealth: () => {},
    writeActive: () => {},
    writeList: (next) => { stored = next; },
  });

  assert.throws(() => service.update({ baseUrl: "ftp://bad.example", model: "test" }), { code: "VALIDATION_FAILED" });
  const created = service.update({ createNew: true, name: "Secondary", provider: "compatible", baseUrl: "https://secondary.test/v1", model: "model-2", apiKey: "new-secret" });
  assert.equal(created.after.id, "AIP-002");
  assert.equal(stored.providers.length, 2);
  assert.equal(stored.activeId, "AIP-002");
  const disabled = service.setStatus("AIP-002", false);
  assert.equal(disabled.enabled, false);
  assert.equal(service.get().apiKeyMasked, "old...cret");
  assert.throws(() => service.activate("AIP-MISSING"), { code: "RESOURCE_NOT_FOUND" });
});
