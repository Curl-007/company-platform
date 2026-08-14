function createRateLimitPolicy({ env, isProd, randomUUID }) {
  if (!env || typeof randomUUID !== "function") {
    throw new Error("createRateLimitPolicy requires env and randomUUID().");
  }

  function isTrustedSessionRequest(req) {
    if (isProd || env.RATE_LIMIT_TRUST_LOCAL !== "1") return false;
    const authHeader = req.headers.authorization || "";
    const hasBearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedProto = req.headers["x-forwarded-proto"];
    const localRequest =
      req.ip === "::1" ||
      req.ip === "127.0.0.1" ||
      req.ip === "::ffff:127.0.0.1" ||
      req.hostname === "localhost" ||
      req.hostname === "127.0.0.1";

    return localRequest && hasBearerToken && !forwardedFor && !forwardedProto;
  }

  function rateLimitHandler(message) {
    return (_req, res, _next, options) => res.status(options.statusCode).json({
      errorCode: "RATE_LIMITED",
      message,
      traceId: randomUUID(),
    });
  }

  return { isTrustedSessionRequest, rateLimitHandler };
}

module.exports = { createRateLimitPolicy };
