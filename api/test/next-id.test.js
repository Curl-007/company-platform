const assert = require("node:assert/strict");
const test = require("node:test");
const { createNextId } = require("../src/lib/nextId");

test("nextId creates collision-resistant prefixed ids without scanning a table", async () => {
  const values = [
    "12345678-1234-1234-1234-1234567890ab",
    "abcdefab-cdef-cdef-cdef-abcdefabcdef",
  ];
  const nextId = createNextId({
    now: () => 1_721_699_200_000,
    randomUUID: () => values.shift(),
  });
  const first = await nextId("prj", "projects");
  const second = await nextId("prj", "projects");
  assert.match(first, /^PRJ-[0-9A-Z]+-123456781234$/);
  assert.match(second, /^PRJ-[0-9A-Z]+-ABCDEFABCDEF$/);
  assert.notEqual(first, second);
});
