const crypto = require("node:crypto");

const DEV_JWT_SECRET = "dev-secret-change-me";

function failFast(message, { exit = process.exit, logger = console } = {}) {
  logger.error(message);
  exit(1);
  throw new Error(message);
}

function resolveJwtSecret({ env = process.env, isProd = String(env.NODE_ENV || "").toLowerCase() === "production", logger = console, exit = process.exit } = {}) {
  const secret = env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isProd) {
    return failFast("FATAL: JWT_SECRET environment variable must be set (>= 16 chars) in production.", { exit, logger });
  }
  logger.warn("WARNING: JWT_SECRET not set - using insecure dev default. Set JWT_SECRET before deploying.");
  return DEV_JWT_SECRET;
}

function resolveAiConfigEncryptionKey(jwtSecret, { env = process.env, isProd = String(env.NODE_ENV || "").toLowerCase() === "production", logger = console, exit = process.exit } = {}) {
  const key = String(env.AI_CONFIG_ENCRYPTION_KEY || "").trim();
  if (isProd) {
    if (!key || key.length < 16) {
      return failFast("FATAL: AI_CONFIG_ENCRYPTION_KEY must be set (>= 16 chars) in production and must be independent from JWT_SECRET.", { exit, logger });
    }
    if (key === jwtSecret) {
      return failFast("FATAL: AI_CONFIG_ENCRYPTION_KEY must not equal JWT_SECRET in production.", { exit, logger });
    }
    return key;
  }
  if (!key) {
    logger.warn("WARNING: AI_CONFIG_ENCRYPTION_KEY not set - falling back to JWT_SECRET for local development only.");
    return jwtSecret;
  }
  if (key === jwtSecret) {
    logger.warn("WARNING: AI_CONFIG_ENCRYPTION_KEY equals JWT_SECRET - use a dedicated encryption key before production.");
  }
  return key;
}

function createDefaultAiProvider(env = process.env) {
  return {
    provider: env.AI_PROVIDER || "openai-compatible",
    baseUrl: env.AI_BASE_URL || "https://api.openai.com/v1",
    model: env.AI_MODEL || "gpt-4o-mini",
    wireApi: env.AI_WIRE_API || "chat_completions",
    disableResponseStorage: env.AI_DISABLE_RESPONSE_STORAGE !== "false",
    enabled: env.AI_ENABLED !== "false",
  };
}

function resolveAiCapabilityTokenSecret(jwtSecret, { env = process.env, cryptoModule = crypto } = {}) {
  const configured = String(env.AI_CAPABILITY_TOKEN_SECRET || "").trim();
  if (configured) return configured;
  return cryptoModule
    .createHmac("sha256", jwtSecret)
    .update("company-platform-ai-capability-token-v1")
    .digest("base64url");
}

function resolveAllowedOrigins(env = process.env) {
  return (env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

module.exports = {
  DEV_JWT_SECRET,
  createDefaultAiProvider,
  resolveAiCapabilityTokenSecret,
  resolveAiConfigEncryptionKey,
  resolveAllowedOrigins,
  resolveJwtSecret,
};
