const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiAssistantAdminService } = require("../src/modules/ai/assistantAdminService");
const { createAiAssistantStore } = require("../src/modules/ai/assistantStore");

function createFixture() {
  const settings = new Map();
  const providers = {
    activeId: "AIP-ACTIVE",
    providers: [
      {
        id: "AIP-ACTIVE",
        name: "Active Provider",
        provider: "openai-compatible",
        baseUrl: "https://active.example.test/v1",
        model: "active-model",
        enabled: true,
        apiKey: "must-not-leak",
      },
      {
        id: "AIP-DISABLED",
        name: "Disabled Provider",
        provider: "openai-compatible",
        baseUrl: "https://disabled.example.test/v1",
        model: "disabled-model",
        enabled: false,
        apiKey: "also-secret",
      },
    ],
  };
  const row = async (_sql, params) => settings.has(params.key)
    ? { value: settings.get(params.key), updated_at: "2026-08-14T00:00:00.000Z" }
    : undefined;
  const run = async (_sql, params) => {
    settings.set(params.key, params.value);
    return { changes: 1 };
  };
  const store = createAiAssistantStore({
    json: JSON.stringify,
    now: () => "2026-08-14T01:00:00.000Z",
    parse: (value, fallback) => {
      try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
    },
    readProviderList: async () => providers,
    resolveActiveProvider: async () => providers.providers.find((item) => item.id === providers.activeId),
    row,
    run,
  });
  return { providers, settings, store };
}

test("AI assistant store persists only assistant settings and safely falls back when its Provider is disabled", async () => {
  const { settings, store } = createFixture();
  const defaults = await store.read();
  assert.equal(defaults.name, "Platform AI Assistant");
  assert.equal(defaults.providerId, null);

  const written = await store.write({
    ...defaults,
    name: "Delivery assistant",
    providerId: "AIP-DISABLED",
    model: "",
    systemPrompt: "Use delivery evidence.",
    temperature: 0.4,
    maxTokens: 1200,
  });
  const persisted = JSON.parse(settings.get("ai_assistant"));
  assert.equal(persisted.systemPrompt, "Use delivery evidence.");
  assert.equal(Object.hasOwn(persisted, "apiKey"), false);

  const resolved = await store.resolve(written);
  assert.equal(resolved.fallback, true);
  assert.equal(resolved.resolvedProviderId, "AIP-ACTIVE");
  assert.equal(resolved.resolvedModel, "active-model");
  const publicConfig = store.publicConfig(written, { resolved });
  assert.equal(publicConfig.systemPrompt, undefined);
  assert.equal(publicConfig.systemPromptConfigured, true);
  assert.equal(JSON.stringify(publicConfig).includes("must-not-leak"), false);
});

test("AI assistant administration validates Provider state and exposes the prompt only to administrators", async () => {
  const { providers, store } = createFixture();
  const service = createAiAssistantAdminService({
    assistantStore: store,
    readProviderList: async () => providers,
  });

  await assert.rejects(
    () => service.update({ providerId: "AIP-DISABLED" }),
    { code: "VALIDATION_FAILED" },
  );
  await assert.rejects(
    () => service.update({ temperature: 2.1 }),
    { code: "VALIDATION_FAILED" },
  );

  const result = await service.update({
    name: "Delivery assistant",
    providerId: "AIP-ACTIVE",
    model: "chat-model",
    systemPrompt: "Prioritize traceable delivery risks.",
    temperature: 0.35,
    maxTokens: 1600,
  });
  assert.equal(result.after.systemPrompt, "Prioritize traceable delivery risks.");
  assert.equal(result.after.resolvedProviderId, "AIP-ACTIVE");
  const publicConfig = await service.getPublic();
  assert.equal(publicConfig.systemPrompt, undefined);
  assert.equal(publicConfig.resolvedModel, "chat-model");
});
