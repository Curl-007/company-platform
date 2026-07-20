const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createProjectSourceBrowser } = require("../src/modules/projects/sourceBrowser");

test("project source browser hides metadata, reads bounded text, and rejects traversal", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-source-"));
  const sourceDirectory = path.join(directory, "source");
  fs.mkdirSync(path.join(sourceDirectory, "src"), { recursive: true });
  fs.mkdirSync(path.join(sourceDirectory, ".git"));
  fs.writeFileSync(path.join(sourceDirectory, "src", "main.ts"), "export const ready = true;\n", "utf8");
  fs.writeFileSync(path.join(directory, "outside.txt"), "outside", "utf8");
  try {
    const browser = createProjectSourceBrowser({ fs, path });
    const root = browser.browse(sourceDirectory);
    assert.deepEqual(root, [{ name: "src", path: "src", type: "dir" }]);
    const file = browser.browse(sourceDirectory, "src/main.ts", true);
    assert.equal(file.language, "typescript");
    assert.equal(file.content, "export const ready = true;\n");
    assert.throws(() => browser.browse(sourceDirectory, "../outside.txt", true), { code: "PATH_TRAVERSAL_DETECTED" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
