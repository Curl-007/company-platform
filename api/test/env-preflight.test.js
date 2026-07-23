const assert = require("node:assert/strict");
const test = require("node:test");
const { preflightEnv } = require("../src/ops/envPreflight");

test("env preflight fails closed in production for weak secrets", () => {
  const report = preflightEnv({
    NODE_ENV: "production",
    JWT_SECRET: "short",
    AI_CONFIG_ENCRYPTION_KEY: "also-short",
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((item) => item.code === "JWT_SECRET_WEAK" && item.level === "error"));
  assert.ok(report.issues.some((item) => item.code === "AI_CONFIG_ENCRYPTION_KEY_WEAK" && item.level === "error"));
});

test("env preflight rejects reused secrets and rate-limit trust in production", () => {
  const report = preflightEnv({
    NODE_ENV: "production",
    JWT_SECRET: "production-jwt-secret-16",
    AI_CONFIG_ENCRYPTION_KEY: "production-jwt-secret-16",
    RATE_LIMIT_TRUST_LOCAL: "1",
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((item) => item.code === "SECRETS_REUSED"));
  assert.ok(report.issues.some((item) => item.code === "RATE_LIMIT_TRUST_LOCAL_IN_PROD"));
});

test("env preflight passes with independent secrets in production", () => {
  const report = preflightEnv({
    NODE_ENV: "production",
    JWT_SECRET: "production-jwt-secret-16",
    AI_CONFIG_ENCRYPTION_KEY: "production-ai-key-16ch",
    PORT: "4010",
  });
  assert.equal(report.ok, true);
});

test("env preflight warns but allows weak secrets outside production", () => {
  const report = preflightEnv({
    NODE_ENV: "development",
  });
  assert.equal(report.ok, true);
  assert.ok(report.issues.some((item) => item.level === "warn" && item.code === "JWT_SECRET_WEAK"));
});

test("env preflight rejects HTTP shutdown opt-in in production", () => {
  const report = preflightEnv({
    NODE_ENV: "production",
    JWT_SECRET: "production-jwt-secret-16",
    AI_CONFIG_ENCRYPTION_KEY: "production-ai-key-16ch",
    ENABLE_HTTP_SHUTDOWN: "1",
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((item) => item.code === "HTTP_SHUTDOWN_IN_PROD" && item.level === "error"));
});
