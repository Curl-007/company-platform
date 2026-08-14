const assert = require("node:assert/strict");
const test = require("node:test");
const { extractJsonPayload } = require("../src/lib/jsonPayload");

test("JSON payload parser accepts fenced and embedded model output without accepting invalid JSON", () => {
  assert.deepEqual(extractJsonPayload("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(extractJsonPayload("Result: {\"items\":[1,2]} done"), { items: [1, 2] });
  assert.equal(extractJsonPayload("not JSON"), null);
});
