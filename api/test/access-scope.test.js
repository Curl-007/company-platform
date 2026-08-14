const assert = require("node:assert/strict");
const test = require("node:test");
const { createAccessScopeResolver } = require("../src/security/accessScope");

test("access scope resolver preserves administrator and per-project visibility boundaries", async () => {
  let readCount = 0;
  const resolver = createAccessScopeResolver({
    rows: async () => {
      readCount += 1;
      return [{ id: "PRJ-1" }, { id: "PRJ-2" }];
    },
    canAccessProject: async (_user, projectId) => projectId === "PRJ-2",
  });

  assert.deepEqual(await resolver.resolveAccessScope({ role: "admin" }), { all: true });
  assert.equal(readCount, 0);
  assert.deepEqual(await resolver.resolveAccessScope(null), { projectIds: [] });
  assert.deepEqual(await resolver.resolveAccessScope({ id: "USR-1", role: "pm" }), { projectIds: ["PRJ-2"] });
  assert.equal(readCount, 1);
});
