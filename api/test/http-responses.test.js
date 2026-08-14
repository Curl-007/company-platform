const assert = require("node:assert/strict");
const test = require("node:test");
const { createResponseHelpers } = require("../src/http/responses");

test("HTTP response helpers preserve envelope, error, and pagination contracts", () => {
  const writes = [];
  const helpers = createResponseHelpers({
    now: () => "2026-08-14T09:00:00.000Z",
    randomUUID: () => "trace-1",
  });
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

  assert.deepEqual(helpers.ok({ id: "PRJ-1" }, { source: "test" }), {
    data: { id: "PRJ-1" },
    meta: { generatedAt: "2026-08-14T09:00:00.000Z", source: "test" },
  });
  helpers.fail(response, 409, "CONFLICT", "Already exists.", { id: "PRJ-1" });
  assert.deepEqual(writes, [
    { type: "status", code: 409 },
    {
      type: "json",
      body: {
        errorCode: "CONFLICT",
        message: "Already exists.",
        traceId: "trace-1",
        details: { id: "PRJ-1" },
      },
    },
  ]);
  assert.deepEqual(helpers.paginatedResponse([1, 2, 3], { page: "2", pageSize: "2" }), {
    items: [3], page: 2, pageSize: 2, total: 3,
  });
  assert.deepEqual(helpers.paginatedResponse([1, 2, 3], {}), [1, 2, 3]);
});
