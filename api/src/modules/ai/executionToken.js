const crypto = require("node:crypto");

const TOKEN_AUDIENCE = "company-ai-execution-gateway";
const TOKEN_PREFIX = "cgw1";
const DEFAULT_EXECUTION_TOKEN_TTL_MS = 60_000;
const MAX_EXECUTION_TOKEN_TTL_MS = 5 * 60_000;

function tokenError(code, message, status = 401) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64urlJson(value) {
  try {
    const parsed = JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sameSignature(left, right) {
  const leftBytes = Buffer.from(String(left || ""));
  const rightBytes = Buffer.from(String(right || ""));
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function assertClaimText(value, field) {
  const text = String(value || "").trim();
  if (!text || text.length > 256) throw tokenError("AI_CAPABILITY_TOKEN_INVALID", `Execution token ${field} is invalid.`);
  return text;
}

function createScopedExecutionTokenService({
  now = () => Date.now(),
  secret,
  ttlMs = DEFAULT_EXECUTION_TOKEN_TTL_MS,
} = {}) {
  const key = String(secret || "");
  if (key.length < 16) throw new Error("AI capability execution token secret must be at least 16 characters.");
  const boundedTtlMs = Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= MAX_EXECUTION_TOKEN_TTL_MS
    ? ttlMs
    : DEFAULT_EXECUTION_TOKEN_TTL_MS;

  function sign(payload) {
    return crypto.createHmac("sha256", key).update(payload).digest("base64url");
  }

  function issue({ actorId, capabilityId, capabilityVersion, invocationId, projectId } = {}) {
    const issuedAt = Number(now());
    if (!Number.isFinite(issuedAt)) throw new Error("AI capability token clock is invalid.");
    const claims = {
      aud: TOKEN_AUDIENCE,
      actorId: assertClaimText(actorId, "actorId"),
      capabilityId: assertClaimText(capabilityId, "capabilityId"),
      capabilityVersion: assertClaimText(capabilityVersion, "capabilityVersion"),
      exp: issuedAt + boundedTtlMs,
      iat: issuedAt,
      invocationId: assertClaimText(invocationId, "invocationId"),
      jti: crypto.randomUUID(),
      projectId: assertClaimText(projectId, "projectId"),
      v: 1,
    };
    const encoded = base64urlJson(claims);
    return { claims, token: `${TOKEN_PREFIX}.${encoded}.${sign(encoded)}` };
  }

  function verify(token, expected = {}) {
    const [prefix, encoded, signature, extra] = String(token || "").split(".");
    if (prefix !== TOKEN_PREFIX || !encoded || !signature || extra) {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Execution token is malformed.");
    }
    if (!sameSignature(sign(encoded), signature)) {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Execution token signature is invalid.");
    }
    const claims = parseBase64urlJson(encoded);
    if (!claims || claims.v !== 1 || claims.aud !== TOKEN_AUDIENCE) {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Execution token claims are invalid.");
    }
    for (const field of ["actorId", "capabilityId", "capabilityVersion", "invocationId", "jti", "projectId"]) {
      assertClaimText(claims[field], field);
    }
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp <= claims.iat || claims.exp - claims.iat > MAX_EXECUTION_TOKEN_TTL_MS) {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Execution token lifetime is invalid.");
    }
    if (Number(now()) >= claims.exp) throw tokenError("AI_CAPABILITY_TOKEN_EXPIRED", "Execution token has expired.", 401);
    for (const [key, value] of Object.entries(expected)) {
      if (value !== undefined && claims[key] !== value) {
        throw tokenError("AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", "Execution token scope does not match this request.", 403);
      }
    }
    return claims;
  }

  function publicClaims(claims) {
    return {
      actorId: claims.actorId,
      capabilityId: claims.capabilityId,
      capabilityVersion: claims.capabilityVersion,
      expiresAt: new Date(claims.exp).toISOString(),
      issuedAt: new Date(claims.iat).toISOString(),
      invocationId: claims.invocationId,
      projectId: claims.projectId,
      tokenId: claims.jti,
    };
  }

  return { issue, publicClaims, verify };
}

module.exports = {
  DEFAULT_EXECUTION_TOKEN_TTL_MS,
  MAX_EXECUTION_TOKEN_TTL_MS,
  TOKEN_AUDIENCE,
  createScopedExecutionTokenService,
  tokenError,
};
