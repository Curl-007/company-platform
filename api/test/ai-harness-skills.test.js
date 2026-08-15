const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");
const { parseCompositionPlugins } = require("../src/modules/ai/harnessComposition");
const {
  COMPANY_RUNTIME_COMPOSITION,
  HARNESS_COMPOSITIONS,
  createHarnessRuntime,
  resolveHarnessPaths,
} = require("../src/modules/ai/harnessRuntime");

const CONFIG_DIR = path.resolve(__dirname, "..", "config", "harness");
const SKILL_ROOT = path.join(CONFIG_DIR, "skills");
const TEST_API_ROOT = path.join(process.cwd(), "test-harness-runtime");

const EXPECTED_SKILLS = new Set([
  "defect-root-cause",
  "fixed-delivery-checklist",
  "lightweight-delivery-gate",
]);

function readSkillFrontmatter(fileName) {
  const raw = fs.readFileSync(path.join(SKILL_ROOT, fileName), "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  assert.ok(match, `${fileName} must open with a YAML frontmatter block`);
  return { body: raw.slice(match[0].length), frontmatter: yaml.load(match[1]), raw };
}

function pluginIds(file) {
  return parseCompositionPlugins(fs.readFileSync(path.join(CONFIG_DIR, file), "utf8")).map((plugin) => plugin.id);
}

function createProxyStub() {
  return {
    registrations: [],
    unregistered: [],
    async close() {},
    async start() {
      return "http://127.0.0.1:43123/v1";
    },
    register(route) {
      this.registrations.push(route);
    },
    status() {
      return { activeRoutes: this.registrations.length, started: true };
    },
    unregister(token) {
      this.unregistered.push(token);
    },
  };
}

function completedResult(finalResponse = "completed") {
  return {
    finalResponse,
    events: [{ type: "turn/end", data: { reason: { kind: "completed" } } }],
  };
}

function harnessSdk() {
  const instances = [];
  class DeepSeekHarness {
    constructor(options) {
      this.closeCalls = 0;
      this.options = options;
      instances.push(this);
    }

    async close() {
      this.closeCalls += 1;
    }

    run() {
      return completedResult("ok");
    }
  }
  return { DeepSeekHarness, instances };
}

function providerConfig() {
  return {
    apiKey: "provider-secret-key",
    baseUrl: "https://provider.example/v1",
    disableResponseStorage: false,
    enabled: true,
    model: "company-model",
    wireApi: "chat_completions",
  };
}

test("company skill files satisfy the skill-filesystem discovery schema", () => {
  const files = fs.readdirSync(SKILL_ROOT).filter((name) => name.endsWith(".md")).sort();
  assert.deepEqual(files, [...EXPECTED_SKILLS].map((name) => `${name}.md`).sort());

  for (const fileName of files) {
    const { body, frontmatter, raw } = readSkillFrontmatter(fileName);
    assert.equal(typeof frontmatter, "object", `${fileName} frontmatter must be a mapping`);
    // skill-filesystem documents exactly these frontmatter keys; unknown or
    // misspelled keys would drop the skill from discovery.
    const allowedKeys = new Set(["name", "description", "whenToUse", "metadata", "disable-model-invocation", "user-invocable"]);
    for (const key of Object.keys(frontmatter)) {
      assert.equal(allowedKeys.has(key), true, `${fileName} frontmatter key "${key}" is not a documented skill key`);
    }
    assert.match(frontmatter.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${fileName} name must be kebab-case`);
    assert.equal(frontmatter.name, path.basename(fileName, ".md"), `${fileName} name must match its file stem`);
    assert.equal(typeof frontmatter.description, "string", `${fileName} description is required`);
    assert.ok(frontmatter.description.trim().length > 0, `${fileName} description must not be empty`);
    // The tool-skill catalog caps descriptions at 500 characters by default.
    assert.ok(frontmatter.description.length <= 500, `${fileName} description must stay within the catalog cap`);
    if (frontmatter.whenToUse !== undefined) {
      assert.equal(typeof frontmatter.whenToUse, "string", `${fileName} whenToUse must be a string`);
    }
    // Body must exist below the frontmatter and stay concise (<= 60 lines).
    assert.ok(body.trim().length > 0, `${fileName} must carry instruction body below the frontmatter`);
    assert.ok(raw.split(/\r?\n/).length <= 60, `${fileName} must stay within 60 lines`);
  }
});

test("the fixed composition registry resolves every key to an existing file", () => {
  assert.deepEqual(Object.keys(HARNESS_COMPOSITIONS).sort(), [
    "company-draft-v1",
    "company-review-v1",
    COMPANY_RUNTIME_COMPOSITION,
  ]);
  assert.equal(HARNESS_COMPOSITIONS[COMPANY_RUNTIME_COMPOSITION], "cordis.yml");
  for (const [key, file] of Object.entries(HARNESS_COMPOSITIONS)) {
    assert.equal(fs.existsSync(path.join(CONFIG_DIR, file)), true, `${key} must map to an existing file`);
  }
});

test("composition files carry real differences: runtime mirror, draft subset, review superset", () => {
  // The default composition and its registry mirror must never drift.
  assert.equal(
    fs.readFileSync(path.join(CONFIG_DIR, "cordis.yml"), "utf8"),
    fs.readFileSync(path.join(CONFIG_DIR, "compositions", "company-runtime-v1.yml"), "utf8"),
  );

  const runtimeIds = new Set(pluginIds("cordis.yml"));
  const draftIds = new Set(pluginIds(path.join("compositions", "company-draft-v1.yml")));
  const reviewIds = new Set(pluginIds(path.join("compositions", "company-review-v1.yml")));

  // Every composition mounts the company skill stack.
  for (const ids of [runtimeIds, draftIds, reviewIds]) {
    for (const skillPlugin of ["skills", "skill-filesystem", "tool-skill"]) {
      assert.equal(ids.has(skillPlugin), true, `composition must mount ${skillPlugin}`);
    }
  }

  // Draft drops compaction and both projection plugins but keeps sessions.
  for (const dropped of ["compaction", "session-projection", "company-projections"]) {
    assert.equal(draftIds.has(dropped), false, `draft composition must not mount ${dropped}`);
  }
  assert.equal(draftIds.has("sessions"), true);
  assert.equal(draftIds.has("token-meter"), true);

  // Review keeps the full default set and adds an explicit reminder policy.
  for (const id of runtimeIds) assert.equal(reviewIds.has(id), true, `review composition must keep ${id}`);
  const reviewSource = fs.readFileSync(path.join(CONFIG_DIR, "compositions", "company-review-v1.yml"), "utf8");
  assert.match(reviewSource, /repeat-tool-reminder[\s\S]*config:/);
  assert.match(reviewSource, /thresholds: \[2, 5, 8, 12\]/);
});

test("resolveHarnessPaths maps composition keys, skill roots, and production guards", () => {
  const defaultPaths = resolveHarnessPaths({ apiRoot: TEST_API_ROOT });
  assert.equal(defaultPaths.configPath, path.join(TEST_API_ROOT, "config", "harness", "cordis.yml"));
  assert.equal(defaultPaths.skillRoot, path.join(TEST_API_ROOT, "config", "harness", "skills"));
  assert.equal(defaultPaths.compositionKey, COMPANY_RUNTIME_COMPOSITION);

  const draftPaths = resolveHarnessPaths({ apiRoot: TEST_API_ROOT, compositionKey: "company-draft-v1" });
  assert.equal(draftPaths.configPath, path.join(TEST_API_ROOT, "config", "harness", "compositions", "company-draft-v1.yml"));

  const reviewPaths = resolveHarnessPaths({ apiRoot: TEST_API_ROOT, compositionKey: "company-review-v1" });
  assert.equal(reviewPaths.configPath, path.join(TEST_API_ROOT, "config", "harness", "compositions", "company-review-v1.yml"));

  const overriddenSkillRoot = resolveHarnessPaths({
    apiRoot: TEST_API_ROOT,
    env: { HARNESS_SKILL_ROOT: "test-skills" },
  });
  assert.equal(overriddenSkillRoot.skillRoot, path.join(TEST_API_ROOT, "test-skills"));

  // Unknown keys are rejected in every environment, including production.
  assert.throws(
    () => resolveHarnessPaths({ apiRoot: TEST_API_ROOT, compositionKey: "company-evil-v1" }),
    { code: "AI_HARNESS_COMPOSITION_UNKNOWN" },
  );
  assert.throws(
    () => resolveHarnessPaths({ apiRoot: TEST_API_ROOT, compositionKey: "../cordis.yml", env: { NODE_ENV: "production" } }),
    { code: "AI_HARNESS_COMPOSITION_UNKNOWN" },
  );

  // Production keeps pinning the fixed composition: variants are rejected by
  // default and only run when the operator opts in with
  // HARNESS_ALLOW_COMPOSITION_VARIANTS=1 (path and skill-root overrides stay
  // forbidden regardless).
  assert.throws(
    () => resolveHarnessPaths({ apiRoot: TEST_API_ROOT, compositionKey: "company-draft-v1", env: { NODE_ENV: "production" } }),
    { code: "AI_HARNESS_COMPOSITION_VARIANT_FORBIDDEN" },
  );
  assert.equal(
    resolveHarnessPaths({
      apiRoot: TEST_API_ROOT,
      compositionKey: "company-review-v1",
      env: { HARNESS_ALLOW_COMPOSITION_VARIANTS: "1", NODE_ENV: "production" },
    }).configPath,
    path.join(TEST_API_ROOT, "config", "harness", "compositions", "company-review-v1.yml"),
  );
  assert.throws(
    () => resolveHarnessPaths({
      apiRoot: TEST_API_ROOT,
      env: { HARNESS_RUNTIME_CONFIG: "./config/harness/unapproved.yml", NODE_ENV: "production" },
    }),
    { code: "AI_HARNESS_CONFIG_OVERRIDE_FORBIDDEN" },
  );
  assert.throws(
    () => resolveHarnessPaths({ apiRoot: TEST_API_ROOT, env: { HARNESS_SKILL_ROOT: "test-skills", NODE_ENV: "production" } }),
    { code: "AI_HARNESS_SKILL_ROOT_OVERRIDE_FORBIDDEN" },
  );

  // The legacy non-production config override still wins over the registry key.
  assert.equal(
    resolveHarnessPaths({
      apiRoot: TEST_API_ROOT,
      compositionKey: "company-draft-v1",
      env: { HARNESS_RUNTIME_CONFIG: "config/harness/cordis.yml" },
    }).configPath,
    path.join(TEST_API_ROOT, "config", "harness", "cordis.yml"),
  );
});

test("the composition key joins the runtime fingerprint: different keys never reuse a runtime", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk();
  const runtime = createHarnessRuntime({
    apiRoot: TEST_API_ROOT,
    createProxy: () => proxy,
    env: {},
    fsImpl: { existsSync: () => true },
    importSdk: async () => sdk,
    logger: { warn: () => {} },
  });

  try {
    assert.equal(await runtime.run({ config: providerConfig(), prompt: "default one" }), "ok");
    assert.equal(await runtime.run({ config: providerConfig(), prompt: "default two" }), "ok");
    assert.equal(sdk.instances.length, 1, "same-key runs reuse the resident runtime");

    assert.equal(await runtime.run({ compositionKey: "company-draft-v1", config: providerConfig(), prompt: "draft" }), "ok");
    assert.equal(sdk.instances.length, 2, "a different composition key builds a new runtime");
    assert.equal(sdk.instances[0].closeCalls, 1, "the stale composition runtime is drained");

    assert.equal(await runtime.run({ compositionKey: "company-draft-v1", config: providerConfig(), prompt: "draft again" }), "ok");
    assert.equal(sdk.instances.length, 2, "the draft runtime stays resident for the same key");

    assert.equal(sdk.instances[0].options.launch.env.DSH_RUNTIME_COMPOSITION, COMPANY_RUNTIME_COMPOSITION);
    assert.equal(sdk.instances[0].options.launch.env.DSH_SKILL_ROOT, path.join(TEST_API_ROOT, "config", "harness", "skills"));
    assert.equal(sdk.instances[1].options.launch.env.DSH_RUNTIME_COMPOSITION, "company-draft-v1");
    assert.equal(
      sdk.instances[1].options.launch.args[1],
      path.join(TEST_API_ROOT, "config", "harness", "compositions", "company-draft-v1.yml"),
      "the draft composition file is passed to the launcher",
    );

    await assert.rejects(
      () => runtime.run({ compositionKey: "company-evil-v1", config: providerConfig(), prompt: "evil" }),
      { code: "AI_HARNESS_COMPOSITION_UNKNOWN" },
    );
    assert.equal(sdk.instances.length, 2);
  } finally {
    await runtime.close();
  }
});
