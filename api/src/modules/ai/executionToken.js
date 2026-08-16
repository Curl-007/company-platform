const crypto = require("node:crypto");

const TOKEN_AUDIENCE = "company-ai-execution-gateway";
const TOKEN_PREFIX = "cgw1";
// invocationId feeds storage paths (browser screenshots) and logs, so it must
// stay within a path-safe charset: no separators, no traversal segments.
const ID_CLAIM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEFAULT_EXECUTION_TOKEN_TTL_MS = 60_000;
const MAX_EXECUTION_TOKEN_TTL_MS = 5 * 60_000;
// Platform-assistant tokens can remain usable while a write approval is
// pending. They are still restricted to the loopback gateway and become
// unusable as soon as their invocation is completed or failed.
const DEFAULT_REUSABLE_EXECUTION_TOKEN_TTL_MS = 35 * 60_000;
const MAX_REUSABLE_EXECUTION_TOKEN_TTL_MS = 35 * 60_000;
const REUSABLE_CAPABILITY_ID = "platform-assistant";
const REUSABLE_CAPABILITY_VERSION = "1.0.0";

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

function assertClaimId(value, field) {
  const text = String(value || "").trim();
  if (!text || !ID_CLAIM_PATTERN.test(text)) {
    throw tokenError("AI_CAPABILITY_TOKEN_INVALID", `Execution token ${field} is invalid.`);
  }
  return text;
}

function isReusableCapability(capabilityId, capabilityVersion) {
  return capabilityId === REUSABLE_CAPABILITY_ID && capabilityVersion === REUSABLE_CAPABILITY_VERSION;
}

function assertReusableTokenScope({ capabilityId, capabilityVersion, reusable }) {
  if (reusable && !isReusableCapability(capabilityId, capabilityVersion)) {
    throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Only the platform assistant may use a reusable execution token.");
  }
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

  function issue({ actorId, capabilityId, capabilityVersion, invocationId, projectId, reusable = false, ttlMs, userId } = {}) {
    const issuedAt = Number(now());
    if (!Number.isFinite(issuedAt)) throw new Error("AI capability token clock is invalid.");
    const normalizedCapabilityId = assertClaimText(capabilityId, "capabilityId");
    const normalizedCapabilityVersion = assertClaimText(capabilityVersion, "capabilityVersion");
    if (typeof reusable !== "boolean") {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Execution token reusable flag is invalid.");
    }
    assertReusableTokenScope({
      capabilityId: normalizedCapabilityId,
      capabilityVersion: normalizedCapabilityVersion,
      reusable,
    });
    if (!reusable && ttlMs !== undefined) {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Only reusable execution tokens may set a custom lifetime.");
    }
    let tokenTtlMs = boundedTtlMs;
    if (reusable) {
      if (ttlMs === undefined) {
        tokenTtlMs = DEFAULT_REUSABLE_EXECUTION_TOKEN_TTL_MS;
      } else if (Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= MAX_REUSABLE_EXECUTION_TOKEN_TTL_MS) {
        tokenTtlMs = ttlMs;
      } else {
        throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Reusable execution token lifetime is invalid.");
      }
    }
    const claims = {
      aud: TOKEN_AUDIENCE,
      actorId: assertClaimText(actorId, "actorId"),
      capabilityId: normalizedCapabilityId,
      capabilityVersion: normalizedCapabilityVersion,
      exp: issuedAt + tokenTtlMs,
      iat: issuedAt,
      invocationId: assertClaimId(invocationId, "invocationId"),
      jti: crypto.randomUUID(),
      projectId: assertClaimText(projectId, "projectId"),
      v: 1,
    };
    if (reusable) claims.reusable = true;
    // Optional push-target claim (ui-control directives): additive so tokens
    // issued before this field existed keep verifying. userId mirrors actorId
    // today; keeping it separate lets non-user actor tokens exist later.
    if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
      claims.userId = assertClaimText(userId, "userId");
    }
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
    for (const field of ["actorId", "capabilityId", "capabilityVersion", "jti", "projectId"]) {
      assertClaimText(claims[field], field);
    }
    assertClaimId(claims.invocationId, "invocationId");
    if (claims.reusable !== undefined && typeof claims.reusable !== "boolean") {
      throw tokenError("AI_CAPABILITY_TOKEN_INVALID", "Execution token reusable flag is invalid.");
    }
    const reusable = claims.reusable === true;
    assertReusableTokenScope({
      capabilityId: claims.capabilityId,
      capabilityVersion: claims.capabilityVersion,
      reusable,
    });
    const maxLifetime = reusable ? MAX_REUSABLE_EXECUTION_TOKEN_TTL_MS : MAX_EXECUTION_TOKEN_TTL_MS;
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp <= claims.iat || claims.exp - claims.iat > maxLifetime) {
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
      ...(claims.reusable === true ? { reusable: true } : {}),
      tokenId: claims.jti,
      // Omitted for legacy tokens that predate the push-target claim.
      ...(claims.userId ? { userId: claims.userId } : {}),
    };
  }

  return { issue, publicClaims, verify };
}

module.exports = {
  DEFAULT_EXECUTION_TOKEN_TTL_MS,
  DEFAULT_REUSABLE_EXECUTION_TOKEN_TTL_MS,
  MAX_EXECUTION_TOKEN_TTL_MS,
  MAX_REUSABLE_EXECUTION_TOKEN_TTL_MS,
  REUSABLE_CAPABILITY_ID,
  REUSABLE_CAPABILITY_VERSION,
  TOKEN_AUDIENCE,
  createScopedExecutionTokenService,
  isReusableCapability,
  tokenError,
};
