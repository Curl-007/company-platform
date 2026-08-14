const AI_CAPABILITY_UNAVAILABLE_CODES = new Set([
  "AI_CAPABILITY_CONTROL_STORE_CORRUPT",
  "AI_CAPABILITY_DISABLED",
  "AI_CAPABILITY_UNAPPROVED",
]);

function createHttpErrorHandler({
  fail,
  isProd,
  isUniqueConstraintError,
  logger = console,
  maxUploadBytes,
  productionMessage = "Internal server error.",
  randomUUID,
}) {
  if (typeof fail !== "function" || typeof isUniqueConstraintError !== "function" || typeof randomUUID !== "function") {
    throw new Error("HTTP error handler dependencies are required.");
  }

  return function httpErrorHandler(err, req, res, _next) {
    if (isUniqueConstraintError(err)) {
      return fail(res, 409, "CONFLICT", "The value is already in use.");
    }
    const isProductImageUpload = req.method === "POST"
      && /^\/api\/products\/[^/]+\/images\/?(?:\?|$)/.test(req.originalUrl || "");
    if (err?.code === "LIMIT_FILE_SIZE" && isProductImageUpload) {
      return fail(res, 413, "UPLOAD_TOO_LARGE", "Product image exceeds the 5 MiB limit.");
    }
    if (err && (err.code === "LIMIT_FILE_SIZE" || err.code === "UPLOAD_TOO_LARGE" || err.code === "UPLOAD_TYPE_NOT_ALLOWED" || err.status === 400)) {
      const errorCode = err.code === "LIMIT_FILE_SIZE" ? "UPLOAD_TOO_LARGE" : (err.code || "VALIDATION_FAILED");
      const message = err.code === "LIMIT_FILE_SIZE"
        ? `File exceeds the ${maxUploadBytes} byte limit.`
        : (err.message || "Upload rejected.");
      return fail(res, 400, errorCode, message);
    }
    if (err && err.status && Number(err.status) >= 400 && Number(err.status) < 500) {
      return fail(res, err.status, err.code || "VALIDATION_FAILED", err.message || "Request failed.");
    }
    if (err && Number(err.status) === 503 && AI_CAPABILITY_UNAVAILABLE_CODES.has(String(err.code || ""))) {
      return fail(res, 503, err.code, err.message || "AI capability is unavailable.");
    }
    if (err && (err.code === "PERIOD_TOO_LARGE" || err.code === "SOURCE_PATH_ALLOWLIST_REQUIRED")) {
      const status = err.status || (err.code === "PERIOD_TOO_LARGE" ? 400 : 503);
      return fail(res, status, err.code, err.message || "Request failed.");
    }
    logger.error(err);
    return res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: isProd ? productionMessage : err.message || "Unexpected server error.",
      traceId: randomUUID(),
    });
  };
}

module.exports = { AI_CAPABILITY_UNAVAILABLE_CODES, createHttpErrorHandler };
