const assert = require("node:assert/strict");
const test = require("node:test");

const openapi = require("../openapi.json");
const {
  PLATFORM_OPERATIONS,
  buildPlatformRequestUrl,
  findPlatformOperation,
  isEligibleOperation,
  listPlatformOperations,
  normalizePlatformRequest,
  publicPlatformOperation,
} = require("../src/modules/ai/platformOperationRegistry");

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

test("platform operation registry covers every eligible OpenAPI business operation", () => {
  const expected = [];
  for (const [path, item] of Object.entries(openapi.paths)) {
    for (const [method, definition] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method) || !definition || !isEligibleOperation(method, path)) continue;
      expected.push(`${method.toUpperCase()} ${path}`);
    }
  }

  const actual = new Set(PLATFORM_OPERATIONS.map((operation) => `${operation.method} ${operation.path}`));
  assert.equal(actual.size, expected.length);
  expected.forEach((key) => assert.ok(actual.has(key), `missing ${key}`));
  assert.ok(findPlatformOperation("get_projects"));
  assert.ok(findPlatformOperation("post_requirements"));
  assert.ok(findPlatformOperation("delete_releases_id"));
  assert.equal(findPlatformOperation("post_ai_chat"), null);
  assert.equal(findPlatformOperation("post_products_id_images"), null);
  assert.equal(findPlatformOperation("get_products_id_images_imageid_content"), null);

  const createProject = publicPlatformOperation(findPlatformOperation("post_projects"));
  assert.equal(createProject.request.body.required, true);
  assert.deepEqual(createProject.request.body.schema.required, ["name", "owner"]);
  assert.equal(createProject.request.body.schema.properties.name.type, "string");
  assert.equal(createProject.request.body.schema.properties.version, undefined);
  assert.equal(createProject.request.path, undefined);

  const projectDetail = publicPlatformOperation(findPlatformOperation("get_projects_id"));
  assert.equal(projectDetail.request.path.id.required, true);
  assert.equal(projectDetail.request.path.id.schema.type, "string");

  const requirements = publicPlatformOperation(findPlatformOperation("get_requirements"));
  assert.equal(requirements.request.query.projectId.required, false);
  assert.equal(requirements.request.query.projectId.schema.type, "string");

  const taskHandoff = publicPlatformOperation(findPlatformOperation("post_tasks_id_handoff"));
  assert.equal(taskHandoff.domain, "tasks");
  assert.equal(listPlatformOperations("tasks").some((operation) => operation.action === taskHandoff.action), true);
  assert.deepEqual(taskHandoff.request.path, {
    id: { required: true, schema: { type: "string" } },
  });
  assert.equal(taskHandoff.request.body.required, true);
  assert.deepEqual(taskHandoff.request.body.schema.required, ["action", "version"]);
  assert.deepEqual(taskHandoff.request.body.schema.properties.action.enum, ["submit_for_testing", "return_for_fix"]);
  assert.deepEqual(Object.keys(taskHandoff.request.body.schema.properties), [
    "action",
    "version",
    "assignee",
    "assigneeId",
    "reason",
    "progress",
  ]);
  assert.equal(taskHandoff.request.body.schema.additionalProperties, false);
});

test("platform operation requests are constrained to the registered route shape", () => {
  const operation = findPlatformOperation("patch_projects_id");
  const request = normalizePlatformRequest(operation, {
    path: { id: "PRJ A/1" },
    query: { fresh: true },
    body: { name: "Updated" },
  });
  const url = buildPlatformRequestUrl("http://127.0.0.1:4011", operation, request);

  assert.equal(url.pathname, "/api/projects/PRJ%20A%2F1");
  assert.equal(url.searchParams.get("fresh"), "true");
  assert.deepEqual(request.body, { name: "Updated" });
  assert.throws(
    () => normalizePlatformRequest(operation, { path: { id: "PRJ-1", unexpected: "x" } }),
    /unsupported fields/,
  );
  assert.throws(
    () => normalizePlatformRequest(operation, JSON.parse('{"path":{"id":"PRJ-1"},"body":{"__proto__":{"polluted":true}}}')),
    /unsafe property names/,
  );
});
