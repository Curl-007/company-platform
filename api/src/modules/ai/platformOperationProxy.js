const {
  buildPlatformRequestUrl,
  normalizePlatformRequest,
  platformOperationError,
} = require("./platformOperationRegistry");

const MAX_PLATFORM_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_PLATFORM_OPERATION_TIMEOUT_MS = 30_000;
// Keep in sync with the matcher in src/middleware/rateLimitPolicy.js.
const INTERNAL_SERVICE_HEADER = "x-platform-internal-service";

function safeErrorText(value, fallback) {
  return String(value || fallback || "Platform operation failed.")
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

function responseError(payload, status) {
  const detail = payload && typeof payload === "object" ? payload.error || payload : null;
  const error = platformOperationError(
    String(detail?.code || "PLATFORM_OPERATION_FAILED").slice(0, 120),
    safeErrorText(detail?.message, `Platform operation failed with status ${status}.`),
    status,
  );
  return error;
}

async function readJsonResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw platformOperationError("PLATFORM_OPERATION_RESPONSE_INVALID", "Platform operation returned invalid JSON.", 502);
  }
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PLATFORM_RESPONSE_BYTES) {
    throw platformOperationError("PLATFORM_OPERATION_RESPONSE_TOO_LARGE", "Platform operation response is too large.", 502);
  }
  return payload;
}

function assertLoopbackBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Platform operation proxy requires a valid base URL.");
  }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error("Platform operation proxy must use an unauthenticated loopback URL.");
  }
  return parsed;
}

function createPlatformOperationProxy({
  baseUrl,
  fetchImpl = globalThis.fetch,
  // Per-boot secret shared with the API rate limiter so internal loopback
  // calls do not share one external-client bucket. Empty disables the header.
  internalToken = "",
  issueAccessToken,
  timeoutMs = DEFAULT_PLATFORM_OPERATION_TIMEOUT_MS,
} = {}) {
  const resolvedBaseUrl = assertLoopbackBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") throw new Error("Platform operation proxy requires fetch.");
  if (typeof issueAccessToken !== "function") throw new Error("Platform operation proxy requires an access token issuer.");

  async function execute({ actor, operation, request, signal } = {}) {
    if (!actor || typeof actor !== "object") {
      throw platformOperationError("AI_CAPABILITY_ACTOR_UNAVAILABLE", "Execution actor is unavailable.", 403);
    }
    if (!operation || typeof operation !== "object") {
      throw platformOperationError("AI_PLATFORM_OPERATION_UNKNOWN", "Platform operation is not registered.", 400);
    }
    const normalizedRequest = normalizePlatformRequest(operation, request);
    const token = String(issueAccessToken(actor) || "").trim();
    if (!token) throw new Error("Platform operation token issuer returned no token.");
    const headers = { Authorization: `Bearer ${token}` };
    if (internalToken) headers[INTERNAL_SERVICE_HEADER] = internalToken;
    if (normalizedRequest.body !== undefined) headers["Content-Type"] = "application/json";
    // A hanging upstream REST route must not hang the tool call forever.
    const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
    const requestSignal = signal && timeoutSignal
      ? AbortSignal.any([signal, timeoutSignal])
      : (signal || timeoutSignal);
    const response = await fetchImpl(buildPlatformRequestUrl(resolvedBaseUrl, operation, normalizedRequest), {
      body: normalizedRequest.body === undefined ? undefined : JSON.stringify(normalizedRequest.body),
      headers,
      method: operation.method,
      redirect: "error",
      signal: requestSignal,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw responseError(payload, response.status);
    return {
      data: payload?.data === undefined ? payload : payload.data,
      meta: payload?.meta || null,
      status: response.status,
    };
  }

  return { execute };
}

module.exports = {
  DEFAULT_PLATFORM_OPERATION_TIMEOUT_MS,
  INTERNAL_SERVICE_HEADER,
  MAX_PLATFORM_RESPONSE_BYTES,
  createPlatformOperationProxy,
};
