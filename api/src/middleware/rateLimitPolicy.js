function createRateLimitPolicy({ env, isProd, randomUUID }) {
  if (!env || typeof randomUUID !== "function") {
    throw new Error("createRateLimitPolicy requires env and randomUUID().");
  }

  // Keep in sync with the header name in platformOperationProxy.js.
  const INTERNAL_SERVICE_HEADER = "x-platform-internal-service";

  function isLoopbackRequest(req) {
    return req.ip === "::1" ||
      req.ip === "127.0.0.1" ||
      req.ip === "::ffff:127.0.0.1" ||
      req.hostname === "localhost" ||
      req.hostname === "127.0.0.1";
  }

  function isTrustedSessionRequest(req) {
    if (isProd || env.RATE_LIMIT_TRUST_LOCAL !== "1") return false;
    const authHeader = req.headers.authorization || "";
    const hasBearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedProto = req.headers["x-forwarded-proto"];

    return isLoopbackRequest(req) && hasBearerToken && !forwardedFor && !forwardedProto;
  }

  // The in-process platform operation proxy calls the API over loopback with a
  // per-boot shared secret. Those requests must not share a single external
  // client's rate bucket (all assistant traffic would otherwise 429 together
  // in production); external callers cannot spoof a loopback socket.
  function createInternalServiceMatcher(internalToken) {
    const token = String(internalToken || "").trim();
    return (req) => Boolean(token)
      && isLoopbackRequest(req)
      && req.headers[INTERNAL_SERVICE_HEADER] === token;
  }

  function rateLimitHandler(message) {
    return (_req, res, _next, options) => res.status(options.statusCode).json({
      errorCode: "RATE_LIMITED",
      message,
      traceId: randomUUID(),
    });
  }

  return { createInternalServiceMatcher, isTrustedSessionRequest, rateLimitHandler };
}

module.exports = { createRateLimitPolicy };
