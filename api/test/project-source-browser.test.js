const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createProjectSourceBrowser } = require("../src/modules/projects/sourceBrowser");
const {
  assertConfigurableSourcePath,
  canConfigureSourcePath,
  isPathUnderAllowlist,
  isSensitiveFileName,
  parseSourcePathAllowlist,
} = require("../src/modules/projects/sourcePathPolicy");

function makeTree() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-source-"));
  const sourceDirectory = path.join(directory, "source");
  fs.mkdirSync(path.join(sourceDirectory, "src"), { recursive: true });
  fs.mkdirSync(path.join(sourceDirectory, ".git"));
  fs.writeFileSync(path.join(sourceDirectory, "src", "main.ts"), "export const ready = true;\n", "utf8");
  fs.writeFileSync(path.join(sourceDirectory, ".env"), "SECRET=1\n", "utf8");
  fs.writeFileSync(path.join(sourceDirectory, "id_rsa"), "private\n", "utf8");
  fs.writeFileSync(path.join(directory, "outside.txt"), "outside", "utf8");
  return { directory, sourceDirectory };
}

test("project source browser hides metadata, reads bounded text, and rejects traversal", () => {
  const { directory, sourceDirectory } = makeTree();
  try {
    const browser = createProjectSourceBrowser({
      fs,
      path,
      allowlist: [fs.realpathSync.native(directory)],
    });
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

test("project source browser requires allowlist and denies sensitive names", () => {
  const { directory, sourceDirectory } = makeTree();
  try {
    const noList = createProjectSourceBrowser({ fs, path, allowlist: [] });
    assert.throws(() => noList.browse(sourceDirectory), { code: "SOURCE_PATH_ALLOWLIST_REQUIRED" });

    const browser = createProjectSourceBrowser({
      fs,
      path,
      allowlist: [fs.realpathSync.native(directory)],
    });
    assert.throws(() => browser.browse(sourceDirectory, ".env", true), { code: "SENSITIVE_PATH_DENIED" });
    assert.throws(() => browser.browse(sourceDirectory, "id_rsa", true), { code: "SENSITIVE_PATH_DENIED" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("project source browser rejects base path outside allowlist", () => {
  const { directory, sourceDirectory } = makeTree();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "pm-source-other-"));
  try {
    const browser = createProjectSourceBrowser({
      fs,
      path,
      allowlist: [fs.realpathSync.native(other)],
    });
    assert.throws(() => browser.browse(sourceDirectory), { code: "SOURCE_PATH_OUTSIDE_ALLOWLIST" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("source path policy: admin-only configure + allowlist validation", () => {
  assert.equal(canConfigureSourcePath({ role: "admin" }), true);
  assert.equal(canConfigureSourcePath({ role: "pm" }), false);
  assert.equal(canConfigureSourcePath({ role: "dev" }), false);
  assert.equal(isSensitiveFileName(".env"), true);
  assert.equal(isSensitiveFileName("secret.pem"), true);
  assert.equal(isSensitiveFileName("main.ts"), false);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-allow-"));
  try {
    const allowlist = [fs.realpathSync.native(root)];
    assert.throws(
      () => assertConfigurableSourcePath("relative/path", { allowlist }),
      { code: "SOURCE_PATH_MUST_BE_ABSOLUTE" },
    );
    assert.throws(
      () => assertConfigurableSourcePath(path.join(os.tmpdir(), "not-under-root"), { allowlist }),
      { code: "SOURCE_PATH_OUTSIDE_ALLOWLIST" },
    );
    const okPath = path.join(root, "repo");
    fs.mkdirSync(okPath, { recursive: true });
    const resolved = assertConfigurableSourcePath(okPath, { allowlist });
    assert.ok(isPathUnderAllowlist(resolved, allowlist, { fs, path }));
    assert.throws(
      () => assertConfigurableSourcePath(okPath, { allowlist: [], requireAllowlist: true }),
      { code: "SOURCE_PATH_ALLOWLIST_REQUIRED" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseSourcePathAllowlist splits env roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-env-root-"));
  try {
    const list = parseSourcePathAllowlist({ SOURCE_PATH_ALLOWLIST: `${root};C:\\does-not-need-exist-xyz` }, { fs, path });
    assert.ok(list.length >= 1);
    assert.ok(list.some((item) => item.toLowerCase().includes(path.basename(root).toLowerCase()) || item.includes(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
