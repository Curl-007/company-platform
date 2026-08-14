const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEV_JWT_SECRET,
  createDefaultAiProvider,
  resolveAiCapabilityTokenSecret,
  resolveAiConfigEncryptionKey,
  resolveAllowedOrigins,
  resolveJwtSecret,
} = require("../src/bootstrap/runtimeConfig");

function logger() {
  return {
    errors: [],
    warnings: [],
    error(message) { this.errors.push(message); },
    warn(message) { this.warnings.push(message); },
  };
}

test("runtime config supplies development defaults and parses configured values", () => {
  const output = logger();
  assert.equal(resolveJwtSecret({ env: {}, isProd: false, logger: output }), DEV_JWT_SECRET);
  assert.equal(output.warnings.length, 1);
  assert.deepEqual(createDefaultAiProvider({
    AI_BASE_URL: "https://models.example/v1",
    AI_DISABLE_RESPONSE_STORAGE: "false",
    AI_ENABLED: "false",
    AI_MODEL: "company-model",
    AI_PROVIDER: "company",
    AI_WIRE_API: "responses",
  }), {
    baseUrl: "https://models.example/v1",
    disableResponseStorage: false,
    enabled: false,
    model: "company-model",
    provider: "company",
    wireApi: "responses",
  });
  assert.deepEqual(resolveAllowedOrigins({ CORS_ORIGIN: "https://web.example, https://admin.example, " }), [
    "https://web.example",
    "https://admin.example",
  ]);
});

test("runtime config fails fast for missing or coupled production secrets", () => {
  const output = logger();
  const exit = (code) => {
    const error = new Error(`exit ${code}`);
    error.exitCode = code;
    throw error;
  };

  assert.throws(
    () => resolveJwtSecret({ env: {}, exit, isProd: true, logger: output }),
    (error) => error.exitCode === 1,
  );
  assert.match(output.errors[0], /JWT_SECRET/);
  assert.throws(
    () => resolveAiConfigEncryptionKey("a-secure-production-jwt", {
      env: { AI_CONFIG_ENCRYPTION_KEY: "a-secure-production-jwt" },
      exit,
      isProd: true,
      logger: output,
    }),
    (error) => error.exitCode === 1,
  );
});

test("runtime config uses an explicit capability secret or deterministic derived secret", () => {
  assert.equal(resolveAiCapabilityTokenSecret("jwt-secret", {
    env: { AI_CAPABILITY_TOKEN_SECRET: "explicit-capability-secret" },
  }), "explicit-capability-secret");
  const calls = [];
  const derived = resolveAiCapabilityTokenSecret("jwt-secret", {
    cryptoModule: {
      createHmac(algorithm, secret) {
        calls.push(["createHmac", algorithm, secret]);
        return {
          update(value) {
            calls.push(["update", value]);
            return this;
          },
          digest(encoding) {
            calls.push(["digest", encoding]);
            return "derived-capability-secret";
          },
        };
      },
    },
    env: {},
  });
  assert.equal(derived, "derived-capability-secret");
  assert.deepEqual(calls, [
    ["createHmac", "sha256", "jwt-secret"],
    ["update", "company-platform-ai-capability-token-v1"],
    ["digest", "base64url"],
  ]);
});
