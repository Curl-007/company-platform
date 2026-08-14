const assert = require("node:assert/strict");
const test = require("node:test");
const { createRateLimitPolicy } = require("../src/middleware/rateLimitPolicy");

test("rate-limit policy only trusts an explicitly configured local bearer request", () => {
  const policy = createRateLimitPolicy({ env: { RATE_LIMIT_TRUST_LOCAL: "1" }, isProd: false, randomUUID: () => "trace-1" });
  const localRequest = { ip: "127.0.0.1", hostname: "localhost", headers: { authorization: "Bearer token" } };
  assert.equal(policy.isTrustedSessionRequest(localRequest), true);
  assert.equal(policy.isTrustedSessionRequest({ ...localRequest, headers: { ...localRequest.headers, "x-forwarded-for": "1.2.3.4" } }), false);
  assert.equal(createRateLimitPolicy({ env: { RATE_LIMIT_TRUST_LOCAL: "1" }, isProd: true, randomUUID: () => "trace-1" }).isTrustedSessionRequest(localRequest), false);

  const writes = [];
  const response = {
    status(code) {
      writes.push({ type: "status", code });
      return this;
    },
    json(body) {
      writes.push({ type: "json", body });
      return body;
    },
  };
  policy.rateLimitHandler("Slow down.")(null, response, null, { statusCode: 429 });
  assert.deepEqual(writes, [
    { type: "status", code: 429 },
    { type: "json", body: { errorCode: "RATE_LIMITED", message: "Slow down.", traceId: "trace-1" } },
  ]);
});
