const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  COMPANY_RUNTIME_COMPOSITION,
  SAFE_CHILD_ENV_KEYS,
  createHarnessRuntime,
  resolveHarnessPaths,
  resolveRuntimeLaunch,
} = require("../src/modules/ai/harnessRuntime");

const TEST_API_ROOT = path.join(process.cwd(), "test-harness-runtime");

function completedResult(finalResponse = "completed") {
  return {
    finalResponse,
    events: [{ type: "turn/end", data: { reason: { kind: "completed" } } }],
  };
}

function createProxyStub() {
  const proxy = {
    closeCalls: 0,
    registrations: [],
    starts: 0,
    unregistered: [],
    async close() {
      this.closeCalls += 1;
    },
    async start() {
      this.starts += 1;
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
  return proxy;
}

function harnessSdk(runForInstance) {
  const instances = [];
  class DeepSeekHarness {
    constructor(options) {
      this.closeCalls = 0;
      this.inputs = [];
      this.options = options;
      this.instanceNumber = instances.length + 1;
      instances.push(this);
    }

    async close() {
      this.closeCalls += 1;
    }

    run(input) {
      this.inputs.push(input);
      return runForInstance(this, input);
    }
  }
  return { DeepSeekHarness, instances };
}

function providerConfig(overrides = {}) {
  return {
    apiKey: "provider-secret-key",
    baseUrl: "https://provider.example/v1",
    disableResponseStorage: false,
    enabled: true,
    model: "company-model",
    wireApi: "chat_completions",
    ...overrides,
  };
}

function runtimeOptions({ env = {}, proxy, sdk, ...overrides } = {}) {
  return {
    apiRoot: TEST_API_ROOT,
    createProxy: () => proxy,
    env: { HARNESS_RUNTIME_COMMAND: "fake-harness-runtime", ...env },
    fsImpl: { existsSync: () => true },
    importSdk: async () => sdk,
    logger: { warn: () => {} },
    ...overrides,
  };
}

test("Harness child environment contains only approved runtime values", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("ok"));
  const env = {
    AI_API_KEY: "parent-ai-key",
    AI_CONFIG_ENCRYPTION_KEY: "parent-encryption-key",
    DATABASE_URL: "sqlite:///private.db",
    JWT_SECRET: "parent-jwt-secret",
    NODE_ENV: "test",
    OPENAI_API_KEY: "parent-openai-key",
    PATH: "C:\\Windows\\System32",
    POSTGRES_TARGET_URL: "postgres://private",
    TEMP: "C:\\Temp",
  };
  const runtime = createHarnessRuntime(runtimeOptions({ env, proxy, sdk }));

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "hello" }), "ok");

  const childEnv = sdk.instances[0].options.launch.env;
  const expectedKeys = new Set([
    ...SAFE_CHILD_ENV_KEYS.filter((key) => env[key]),
    "DSH_API_KEY",
    "DSH_BASE_URL",
    "DSH_CONTEXT_WINDOW",
    "DSH_RUNTIME_COMPOSITION",
    "DSH_HOME",
    "DSH_MODEL",
    "DSH_MODEL_MAX_TOKENS",
    "DSH_SESSION_ROOT",
    "DSH_SYSTEM_PROMPT",
    "DSH_TEMPERATURE",
    "DSH_WIRE_API",
  ]);
  assert.deepEqual(new Set(Object.keys(childEnv)), expectedKeys);
  for (const secretKey of [
    "AI_API_KEY",
    "AI_CONFIG_ENCRYPTION_KEY",
    "DATABASE_URL",
    "JWT_SECRET",
    "OPENAI_API_KEY",
    "POSTGRES_TARGET_URL",
  ]) {
    assert.equal(Object.hasOwn(childEnv, secretKey), false, `${secretKey} must not reach the Harness child`);
  }
  assert.notEqual(childEnv.DSH_API_KEY, env.AI_API_KEY);
  assert.notEqual(childEnv.DSH_API_KEY, providerConfig().apiKey);
  assert.equal(childEnv.DSH_BASE_URL, "http://127.0.0.1:43123/v1");
  assert.equal(childEnv.DSH_RUNTIME_COMPOSITION, COMPANY_RUNTIME_COMPOSITION);
  assert.equal(sdk.instances[0].options.launch.cwd, path.join(TEST_API_ROOT, "config", "harness"));
  assert.equal(proxy.registrations[0].apiKey, providerConfig().apiKey);

  await runtime.close();
});

test("Harness rejects production composition and launcher overrides", () => {
  assert.throws(
    () => resolveHarnessPaths({
      apiRoot: TEST_API_ROOT,
      env: { HARNESS_RUNTIME_CONFIG: "./config/harness/unapproved.yml", NODE_ENV: "production" },
    }),
    { code: "AI_HARNESS_CONFIG_OVERRIDE_FORBIDDEN" },
  );
  assert.throws(
    () => resolveRuntimeLaunch({
      configPath: path.join(TEST_API_ROOT, "config", "harness", "cordis.yml"),
      env: { HARNESS_RUNTIME_COMMAND: "unapproved-runtime", NODE_ENV: "production" },
    }),
    { code: "AI_HARNESS_RUNTIME_OVERRIDE_FORBIDDEN" },
  );
  assert.throws(
    () => resolveRuntimeLaunch({
      configPath: path.join(TEST_API_ROOT, "config", "harness", "cordis.yml"),
      env: { HARNESS_RUNTIME_ARGS: "[]", NODE_ENV: "production" },
    }),
    { code: "AI_HARNESS_RUNTIME_OVERRIDE_FORBIDDEN" },
  );
});

test("Harness child receives a scoped execution token without the provider proxy token leaking into that scope", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("snapshot complete"));
  const executionToken = "company-scoped-execution-token";
  const runtime = createHarnessRuntime(runtimeOptions({
    env: {
      AI_CAPABILITY_TOKEN_SECRET: "parent-capability-secret",
      NODE_ENV: "test",
    },
    proxy,
    sdk,
  }));

  await runtime.run({
    config: providerConfig(),
    execution: {
      capabilityId: "project-snapshot",
      capabilityVersion: "1.0.0",
      gatewayBaseUrl: "http://127.0.0.1:43210",
      projectId: "PRJ-1",
      token: executionToken,
    },
    prompt: "summarize the authorized project",
  });

  const childEnv = sdk.instances[0].options.launch.env;
  assert.equal(childEnv.DSH_EXECUTION_TOKEN, executionToken);
  assert.equal(childEnv.DSH_EXECUTION_PROJECT_ID, "PRJ-1");
  assert.equal(childEnv.DSH_EXECUTION_GATEWAY_URL, "http://127.0.0.1:43210");
  assert.notEqual(childEnv.DSH_API_KEY, executionToken);
  assert.equal(proxy.registrations[0].token, childEnv.DSH_API_KEY);
  assert.equal(Object.hasOwn(childEnv, "AI_CAPABILITY_TOKEN_SECRET"), false);
  assert.equal(Object.hasOwn(childEnv, "DSH_CORDIS_CONFIG"), false);

  await runtime.close();
});

test("Harness mints a capability token only after its request owns the FIFO slot", async () => {
  const proxy = createProxyStub();
  let firstRunStarted;
  let releaseFirstRun;
  const firstRunStartedPromise = new Promise((resolve) => { firstRunStarted = resolve; });
  const firstRunReleasePromise = new Promise((resolve) => { releaseFirstRun = resolve; });
  const sdk = harnessSdk((_instance, input) => {
    if (input[0]?.text === "first request") {
      firstRunStarted();
      return firstRunReleasePromise.then(() => completedResult("first complete"));
    }
    return completedResult("second complete");
  });
  const runtime = createHarnessRuntime(runtimeOptions({ proxy, sdk }));

  const first = runtime.run({ config: providerConfig(), prompt: "first request" });
  await firstRunStartedPromise;

  let issued = 0;
  const second = runtime.run({
    config: providerConfig(),
    execution: {
      capabilityId: "project-snapshot",
      capabilityVersion: "1.0.0",
      gatewayBaseUrl: "http://127.0.0.1:43210",
      issueToken: async () => {
        issued += 1;
        return "company-scoped-execution-token";
      },
      projectId: "PRJ-1",
    },
    prompt: "second request",
  });

  await Promise.resolve();
  assert.equal(issued, 0);

  releaseFirstRun();
  assert.equal(await first, "first complete");
  assert.equal(await second, "second complete");
  assert.equal(issued, 1);

  await runtime.close();
});

test("Harness timeout closes the active child and a later call rebuilds it", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk((instance) => (instance.instanceNumber === 1
    ? new Promise(() => {})
    : completedResult("recovered")));
  const runtime = createHarnessRuntime(runtimeOptions({ proxy, sdk }));

  await assert.rejects(
    () => runtime.run({ config: providerConfig(), prompt: "slow", timeoutMs: 20 }),
    { code: "AI_HARNESS_TIMEOUT", status: 504 },
  );
  assert.equal(sdk.instances.length, 1);
  assert.equal(sdk.instances[0].closeCalls, 1);
  assert.equal(proxy.unregistered.length, 1);

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "retry" }), "recovered");
  assert.equal(sdk.instances.length, 2);

  await runtime.close();
  assert.equal(sdk.instances[1].closeCalls, 1);
});

test("Harness persists image input through the injected attachment store", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("image accepted"));
  const saved = [];
  const imageRef = { id: "attachment-v1-image" };
  const runtime = createHarnessRuntime(runtimeOptions({
    proxy,
    saveImageFile: async (...args) => {
      saved.push(args);
      return imageRef;
    },
    sdk,
  }));

  assert.equal(await runtime.run({
    attachments: [{
      contentBase64: Buffer.from("image-bytes").toString("base64"),
      kind: "image",
      mimeType: "image/png",
      name: "roadmap.png",
    }],
    config: providerConfig(),
    prompt: "inspect this image",
  }), "image accepted");

  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], path.join(TEST_API_ROOT, "storage", "harness", "attachments", "v1"));
  assert.deepEqual(saved[0][1], {
    data: Buffer.from("image-bytes"),
    mediaType: "image/png",
    name: "roadmap.png",
  });
  assert.equal(sdk.instances[0].inputs[0][0].type, "text");
  assert.equal(sdk.instances[0].inputs[0][0].text, "inspect this image");
  assert.deepEqual(sdk.instances[0].inputs[0][1], { type: "image", attachment: imageRef });

  await runtime.close();
});
