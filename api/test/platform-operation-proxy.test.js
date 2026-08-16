const assert = require("node:assert/strict");
const test = require("node:test");

const { findPlatformOperation } = require("../src/modules/ai/platformOperationRegistry");
const { createPlatformOperationProxy } = require("../src/modules/ai/platformOperationProxy");

test("platform operation proxy forwards only a registered route with an internal actor token", async () => {
  const requests = [];
  const proxy = createPlatformOperationProxy({
    baseUrl: "http://127.0.0.1:4011",
    issueAccessToken: (actor) => `issued-for-${actor.id}`,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: "PRJ-1", name: "Demo" }, meta: { generatedAt: "now" } }),
      };
    },
  });

  const result = await proxy.execute({
    actor: { id: "USR-1", role: "admin" },
    operation: findPlatformOperation("patch_projects_id"),
    request: { path: { id: "PRJ 1" }, body: { name: "Renamed" } },
  });

  assert.deepEqual(result.data, { id: "PRJ-1", name: "Demo" });
  assert.equal(requests[0].url, "http://127.0.0.1:4011/api/projects/PRJ%201");
  assert.equal(requests[0].init.method, "PATCH");
  assert.equal(requests[0].init.headers.Authorization, "Bearer issued-for-USR-1");
  assert.equal(requests[0].init.body, '{"name":"Renamed"}');
});

test("platform operation proxy preserves platform API denials", async () => {
  const proxy = createPlatformOperationProxy({
    baseUrl: "http://localhost:4011",
    issueAccessToken: () => "internal-token",
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "PERMISSION_DENIED", message: "No project access." } }),
    }),
  });

  await assert.rejects(
    () => proxy.execute({
      actor: { id: "USR-1" },
      operation: findPlatformOperation("get_projects"),
      request: {},
    }),
    (error) => error.code === "PERMISSION_DENIED" && error.status === 403,
  );
});

test("platform operation proxy tags internal requests and applies a call timeout", async () => {
  const requests = [];
  const proxy = createPlatformOperationProxy({
    baseUrl: "http://127.0.0.1:4011",
    internalToken: "boot-secret",
    issueAccessToken: () => "internal-token",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ok: true } }),
      };
    },
  });
  await proxy.execute({
    actor: { id: "USR-1" },
    operation: findPlatformOperation("get_projects"),
    request: {},
  });
  assert.equal(requests[0].init.headers["x-platform-internal-service"], "boot-secret");
  assert.ok(requests[0].init.signal instanceof AbortSignal, "proxy calls carry an abort signal");
});
