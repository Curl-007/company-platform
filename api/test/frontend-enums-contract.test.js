const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { publicEnums } = require("../src/domain/enums");
const { OUTPUT_FILE, renderServerEnums } = require("../../web/scripts/generate-enums.cjs");

test("frontend generated enum constants stay aligned with backend enum source", () => {
  const generated = fs.readFileSync(OUTPUT_FILE, "utf8");
  assert.equal(generated, renderServerEnums(publicEnums()));
});
