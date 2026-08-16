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

test("internal service matcher only accepts loopback requests with the boot token", () => {
  const prodPolicy = createRateLimitPolicy({ env: {}, isProd: true, randomUUID: () => "trace-2" });
  const isInternal = prodPolicy.createInternalServiceMatcher("boot-secret");
  const externalRequest = { ip: "203.0.113.10", hostname: "api.example.com", headers: {} };

  assert.equal(isInternal({
    ip: "127.0.0.1",
    hostname: "127.0.0.1",
    headers: { "x-platform-internal-service": "boot-secret" },
  }), true);
  assert.equal(isInternal({
    ip: "::ffff:127.0.0.1",
    hostname: "localhost",
    headers: { "x-platform-internal-service": "boot-secret" },
  }), true);

  // External socket: even the correct header must not match.
  assert.equal(isInternal({ ...externalRequest, headers: { "x-platform-internal-service": "boot-secret" } }), false);
  // Loopback socket without the shared secret must not match.
  assert.equal(isInternal({ ip: "127.0.0.1", hostname: "localhost", headers: {} }), false);
  assert.equal(isInternal({
    ip: "127.0.0.1",
    hostname: "localhost",
    headers: { "x-platform-internal-service": "wrong" },
  }), false);
  // An unset token disables the matcher entirely.
  assert.equal(prodPolicy.createInternalServiceMatcher("")({
    ip: "127.0.0.1",
    hostname: "localhost",
    headers: { "x-platform-internal-service": "" },
  }), false);
});
