const assert = require("node:assert/strict");
const test = require("node:test");
const { createHttpErrorHandler } = require("../src/http/errorHandler");

function response() {
  return {
    body: null,
    statusCode: null,
    json(value) { this.body = value; return value; },
    status(code) { this.statusCode = code; return this; },
  };
}

function fail(res, status, errorCode, message) {
  return res.status(status).json({ errorCode, message });
}

test("HTTP error handler preserves capability maintenance errors as client-visible 503 responses", () => {
  const handler = createHttpErrorHandler({
    fail,
    isProd: false,
    isUniqueConstraintError: () => false,
    maxUploadBytes: 25,
    randomUUID: () => "trace-1",
  });
  const res = response();
  handler(Object.assign(new Error("Control record needs repair."), {
    code: "AI_CAPABILITY_CONTROL_STORE_CORRUPT",
    status: 503,
  }), { method: "GET", originalUrl: "/api/ai/capabilities" }, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    errorCode: "AI_CAPABILITY_CONTROL_STORE_CORRUPT",
    message: "Control record needs repair.",
  });
});

test("HTTP error handler preserves product upload and production redaction behavior", () => {
  const logged = [];
  const handler = createHttpErrorHandler({
    fail,
    isProd: true,
    isUniqueConstraintError: () => false,
    logger: { error: (error) => logged.push(error) },
    maxUploadBytes: 25,
    productionMessage: "服务器内部错误，请稍后再试。",
    randomUUID: () => "trace-2",
  });
  const uploadResponse = response();
  handler({ code: "LIMIT_FILE_SIZE" }, { method: "POST", originalUrl: "/api/products/PROD-1/images" }, uploadResponse);
  assert.equal(uploadResponse.statusCode, 413);
  assert.equal(uploadResponse.body.errorCode, "UPLOAD_TOO_LARGE");

  const unexpectedResponse = response();
  handler(new Error("database credentials leaked"), { method: "GET", originalUrl: "/api/projects" }, unexpectedResponse);
  assert.deepEqual(unexpectedResponse.body, {
    errorCode: "INTERNAL_SERVER_ERROR",
    message: "服务器内部错误，请稍后再试。",
    traceId: "trace-2",
  });
  assert.equal(logged.length, 1);
});
