const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiProviderStore } = require("../src/modules/ai/providerStore");
const { normalizeAiWireApi } = require("../src/modules/ai/modelClient");

function createMemoryStore(initial = {}, env = { AI_API_KEY: "env-secret" }) {
  const settings = new Map(Object.entries(initial));
  const writes = [];
  const row = (_sql, params) => {
    if (!settings.has(params.key)) return undefined;
    return { value: settings.get(params.key), updated_at: "2026-07-15T00:00:00.000Z" };
  };
  const run = (_sql, params) => {
    settings.set(params.key, params.value);
    writes.push(params);
    return { changes: 1 };
  };
  const secretCodec = {
    available: true,
    encrypt: (value) => `enc:${value}`,
    decrypt: (value) => String(value).replace(/^enc:/, ""),
  };
  const store = createAiProviderStore({
    defaults: {
      provider: "openai-compatible",
      baseUrl: "https://api.example.test/v1/",
      model: "default-model",
      wireApi: "chat_completions",
      disableResponseStorage: true,
      enabled: true,
    },
    row,
    run,
    json: JSON.stringify,
    parse: (value, fallback) => {
      if (!value) return fallback;
      try { return JSON.parse(value); } catch { return fallback; }
    },
    now: () => "2026-07-15T10:00:00.000Z",
    secretCodec,
    normalizeWireApi: normalizeAiWireApi,
    env,
  });
  return { settings, store, writes };
}

test("AI provider store resolves default environment config and masks public output", async () => {
  const { store } = createMemoryStore();
  const config = await store.resolveConfig();
  assert.equal(config.id, "AIP-DEFAULT");
  assert.equal(config.apiKey, "env-secret");
  assert.equal(config.apiKeySource, "database");
  assert.equal(config.baseUrl, "https://api.example.test/v1");
  const publicConfig = await store.publicConfig(config);
  assert.equal(publicConfig.configured, true);
  assert.equal(publicConfig.apiKeyMasked, "env...cret");
  assert.equal(publicConfig.providers[0].apiKeyMasked, "env...cret");
});

test("AI provider store serializes API keys encrypted and migrates legacy plaintext settings", async () => {
  const legacyList = JSON.stringify({
    activeId: "AIP-OLD",
    providers: [{
      id: "AIP-OLD",
      provider: "compatible",
      baseUrl: "https://old.test/v1",
      model: "old-model",
      wireApi: "responses",
      enabled: true,
      apiKey: "plain-secret",
    }],
  });
  const { settings, store } = createMemoryStore({ ai_providers: legacyList });
  await store.migrateSecrets();
  const stored = JSON.parse(settings.get("ai_providers"));
  assert.equal(stored.providers[0].apiKey, undefined);
  assert.equal(stored.providers[0].apiKeyEncrypted, "enc:plain-secret");
  assert.equal((await store.resolveConfig()).apiKey, "plain-secret");
});

test("AI provider store treats a no-key local-compatible Provider as configured", async () => {
  const { store } = createMemoryStore({
    ai_providers: JSON.stringify({
      activeId: "AIP-LOCAL",
      providers: [{
        id: "AIP-LOCAL",
        name: "Local model",
        preset: "local-openai-compatible",
        provider: "openai-compatible",
        baseUrl: "http://192.168.3.18:8000/v1",
        model: "grok-4.6",
        wireApi: "chat_completions",
        enabled: true,
      }],
    }),
  }, {});

  const config = await store.resolveConfig();
  const publicConfig = await store.publicConfig(config);
  assert.equal(config.apiKey, "");
  assert.equal(config.preset, "local-openai-compatible");
  assert.equal(publicConfig.configured, true);
  assert.equal(publicConfig.providers[0].preset, "local-openai-compatible");
  assert.equal(publicConfig.providers[0].configured, true);
});

test("AI provider store records health success and degraded failure evidence", async () => {
  const { store } = createMemoryStore();
  const before = await store.publicConfig();
  assert.equal(before.health.status, "unknown");

  await store.recordSuccess({ wireApi: "chat_completions", latencyMs: 42 });
  const healthy = await store.publicConfig();
  assert.equal(healthy.health.status, "healthy");
  assert.equal(healthy.health.lastWireApi, "chat_completions");
  assert.equal(healthy.health.lastLatencyMs, 42);

  await store.recordFailure(Object.assign(new Error("Bearer sk-secret failed with 502"), { status: 502 }), { wireApi: "responses", latencyMs: 55 });
  const degraded = await store.publicConfig();
  assert.equal(degraded.health.status, "degraded");
  assert.equal(degraded.health.lastWireApi, "responses");
  assert.equal(degraded.health.lastErrorCode, "502");
  assert.match(degraded.health.lastErrorMessage, /Bearer \[redacted\]/);

  await store.recordSuccess({ wireApi: "chat_completions", latencyMs: 61 });
  const recovered = await store.publicConfig();
  assert.equal(recovered.health.status, "healthy");
  assert.equal(recovered.health.consecutiveFailures, 0);
  assert.equal(recovered.health.lastErrorCode, "502");
});
