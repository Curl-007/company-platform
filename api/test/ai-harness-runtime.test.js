const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const {
  COMPANY_RUNTIME_COMPOSITION,
  SAFE_CHILD_ENV_KEYS,
  buildHarnessChildEnv,
  compositionVariantsEnabled,
  createHarnessRuntime,
  resolveHarnessPaths,
  resolveRuntimeLaunch,
} = require("../src/modules/ai/harnessRuntime");

const TEST_API_ROOT = path.join(process.cwd(), "test-harness-runtime");
const HARNESS_CONFIG_DIR = path.resolve(__dirname, "..", "config", "harness");

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

    run(input, runOptions) {
      this.inputs.push(input);
      this.runOptions = runOptions;
      return runForInstance(this, input, runOptions);
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
    "DSH_SESSION_DB",
    "DSH_SESSION_ROOT",
    "DSH_SKILL_ROOT",
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
  assert.equal(childEnv.DSH_SESSION_DB, path.join(TEST_API_ROOT, "storage", "harness", "sessions.db"));
  assert.equal(childEnv.DSH_SESSION_ROOT, path.join(TEST_API_ROOT, "storage", "harness", "sessions"));
  assert.equal(childEnv.DSH_SKILL_ROOT, path.join(TEST_API_ROOT, "config", "harness", "skills"));
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

test("production composition variants require the explicit HARNESS_ALLOW_COMPOSITION_VARIANTS opt-in", () => {
  // Default: production rejects the composition registry variants and keeps
  // pinning cordis.yml (fail fast in the parent process, not at child spawn).
  assert.equal(compositionVariantsEnabled({}), false);
  assert.equal(compositionVariantsEnabled({ HARNESS_ALLOW_COMPOSITION_VARIANTS: "true" }), false);
  assert.equal(compositionVariantsEnabled({ HARNESS_ALLOW_COMPOSITION_VARIANTS: "0" }), false);
  assert.equal(compositionVariantsEnabled({ HARNESS_ALLOW_COMPOSITION_VARIANTS: "1" }), true);
  assert.throws(
    () => resolveHarnessPaths({
      apiRoot: TEST_API_ROOT,
      compositionKey: "company-draft-v1",
      env: { NODE_ENV: "production" },
    }),
    { code: "AI_HARNESS_COMPOSITION_VARIANT_FORBIDDEN" },
  );
  // Opt-in: the same key resolves its variant file in production.
  assert.equal(
    resolveHarnessPaths({
      apiRoot: TEST_API_ROOT,
      compositionKey: "company-draft-v1",
      env: { HARNESS_ALLOW_COMPOSITION_VARIANTS: "1", NODE_ENV: "production" },
    }).compositionKey,
    "company-draft-v1",
  );
  // The opt-in flag is an approved child-env key so the launcher re-check in
  // the child agrees with the parent-side decision.
  assert.equal(SAFE_CHILD_ENV_KEYS.includes("HARNESS_ALLOW_COMPOSITION_VARIANTS"), true);
  const childEnv = buildHarnessChildEnv({
    descriptor: {
      compositionKey: "company-draft-v1",
      maxTokens: 4096,
      model: "company-model",
      system: "s",
      temperature: 0.2,
      wireApi: "chat_completions",
    },
    env: { HARNESS_ALLOW_COMPOSITION_VARIANTS: "1", NODE_ENV: "production" },
    paths: {
      home: path.join(TEST_API_ROOT, "storage", "harness"),
      sessionDb: path.join(TEST_API_ROOT, "storage", "harness", "sessions.db"),
      sessionRoot: path.join(TEST_API_ROOT, "storage", "harness", "sessions"),
      skillRoot: path.join(TEST_API_ROOT, "config", "harness", "skills"),
    },
    proxyBaseUrl: "http://127.0.0.1:43123/v1",
    token: "proxy-token",
  });
  assert.equal(childEnv.HARNESS_ALLOW_COMPOSITION_VARIANTS, "1");
});

test("the company runtime launcher refuses production variant compositions without the opt-in", { timeout: 30000 }, async () => {
  const runLauncher = (configPath, envOverrides) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HARNESS_CONFIG_DIR, "company-runtime.mjs"), configPath], {
      env: { ...process.env, ...envOverrides },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => resolve({ code: -1, stderr: String(error) }));
    child.on("exit", (code) => resolve({ code, stderr }));
    child.stdin.end();
  });

  // Default: production + a composition variant is refused before boot.
  const refused = await runLauncher(
    path.join(HARNESS_CONFIG_DIR, "compositions", "company-draft-v1.yml"),
    { HARNESS_ALLOW_COMPOSITION_VARIANTS: "", NODE_ENV: "production" },
  );
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /production composition override is forbidden/);

  // Opt-in: the variant guard passes; the run stops at the next deterministic
  // check (the missing composition file) instead of the forbidden error.
  const optedIn = await runLauncher(
    path.join(HARNESS_CONFIG_DIR, "compositions", "does-not-exist.yml"),
    { HARNESS_ALLOW_COMPOSITION_VARIANTS: "1", NODE_ENV: "production" },
  );
  assert.notEqual(optedIn.code, 0);
  assert.match(optedIn.stderr, /composition was not found/);
  assert.doesNotMatch(optedIn.stderr, /production composition override is forbidden/);
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

test("Harness child receives the execution env for any registered domain capability and rejects unregistered ones", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("domain capability complete"));
  const runtime = createHarnessRuntime(runtimeOptions({
    env: { NODE_ENV: "test" },
    proxy,
    sdk,
  }));

  await runtime.run({
    config: providerConfig(),
    execution: {
      capabilityId: "requirements-list",
      capabilityVersion: "1.0.0",
      gatewayBaseUrl: "http://127.0.0.1:43211",
      issueToken: async () => "company-scoped-domain-token",
      projectId: "PRJ-1",
    },
    prompt: "list the authorized requirements",
  });

  const childEnv = sdk.instances[0].options.launch.env;
  assert.equal(childEnv.DSH_EXECUTION_CAPABILITY_ID, "requirements-list");
  assert.equal(childEnv.DSH_EXECUTION_CAPABILITY_VERSION, "1.0.0");
  assert.equal(childEnv.DSH_EXECUTION_TOKEN, "company-scoped-domain-token");
  assert.equal(childEnv.DSH_EXECUTION_PROJECT_ID, "PRJ-1");
  assert.equal(childEnv.DSH_EXECUTION_GATEWAY_URL, "http://127.0.0.1:43211");

  await assert.rejects(
    () => runtime.run({
      config: providerConfig(),
      execution: {
        capabilityId: "requirements-export",
        capabilityVersion: "1.0.0",
        gatewayBaseUrl: "http://127.0.0.1:43211",
        issueToken: async () => "company-scoped-domain-token",
        projectId: "PRJ-1",
      },
      prompt: "export the requirements",
    }),
    { code: "AI_HARNESS_EXECUTION_INVALID" },
  );

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

test("Harness runtime stays resident across same-fingerprint runs by default", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("resident"));
  const runtime = createHarnessRuntime(runtimeOptions({ proxy, sdk }));

  for (let index = 0; index < 5; index += 1) {
    assert.equal(await runtime.run({ config: providerConfig(), prompt: `run ${index}` }), "resident");
  }

  assert.equal(sdk.instances.length, 1);
  assert.equal(sdk.instances[0].closeCalls, 0);
  const status = runtime.status();
  assert.equal(status.active, true);
  assert.equal(status.activeCalls, 5);
  assert.equal(status.maxRunsPerRuntime, 0);
  assert.equal(status.idleTtlMs, 0);
  assert.equal(status.totalCalls, 5);
  assert.equal(status.totalRuns, 1);

  await runtime.close();
  assert.equal(sdk.instances[0].closeCalls, 1);
  assert.equal(runtime.status().closed, true);
});

test("Harness runtime recycles after a positive HARNESS_MAX_RUNS_PER_RUNTIME limit", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("bounded"));
  const runtime = createHarnessRuntime(runtimeOptions({ env: { HARNESS_MAX_RUNS_PER_RUNTIME: "2" }, proxy, sdk }));

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "first" }), "bounded");
  assert.equal(await runtime.run({ config: providerConfig(), prompt: "second" }), "bounded");
  assert.equal(sdk.instances.length, 1);
  assert.equal(sdk.instances[0].closeCalls, 1, "the limit disposes the runtime before the third run");
  assert.equal(proxy.unregistered.length, 1);

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "third" }), "bounded");
  assert.equal(sdk.instances.length, 2);
  const status = runtime.status();
  assert.equal(status.maxRunsPerRuntime, 2);
  assert.equal(status.totalCalls, 3);
  assert.equal(status.totalRuns, 2);
  assert.equal(status.activeCalls, 1);

  await runtime.close();
});

test("Harness runtime idle TTL disposes an idle runtime and the next run rebuilds it", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("ttl"));
  const runtime = createHarnessRuntime(runtimeOptions({ env: { HARNESS_RUNTIME_IDLE_TTL_MS: "20" }, proxy, sdk }));
  assert.equal(runtime.status().idleTtlMs, 20);

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "warm" }), "ttl");
  assert.equal(sdk.instances[0].closeCalls, 0);
  assert.equal(runtime.status().active, true);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(sdk.instances[0].closeCalls, 1, "the idle TTL reaped the resident runtime");
  assert.equal(runtime.status().active, false);
  assert.equal(proxy.unregistered.length, 1);

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "rebuild" }), "ttl");
  assert.equal(sdk.instances.length, 2);
  assert.equal(runtime.status().totalRuns, 2);
  assert.equal(runtime.status().totalCalls, 2);

  await runtime.close();
});

test("Harness runtime idle TTL never fires while a run is executing", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return completedResult("long");
  });
  const runtime = createHarnessRuntime(runtimeOptions({ env: { HARNESS_RUNTIME_IDLE_TTL_MS: "10" }, proxy, sdk }));

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "slow" }), "long");
  assert.equal(sdk.instances[0].closeCalls, 0, "the timer must not reap a runtime mid-run");
  assert.equal(runtime.status().active, true);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(sdk.instances[0].closeCalls, 1, "the TTL reaps only after the run settles");

  await runtime.close();
});

test("Harness fingerprint switch drains the previous runtime before building the new one", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk(() => completedResult("switched"));
  const runtime = createHarnessRuntime(runtimeOptions({ proxy, sdk }));

  assert.equal(await runtime.run({ config: providerConfig(), prompt: "model one" }), "switched");
  assert.equal(await runtime.run({ config: providerConfig({ model: "company-model-v2" }), prompt: "model two" }), "switched");

  assert.equal(sdk.instances.length, 2);
  assert.equal(sdk.instances[0].closeCalls, 1, "the stale fingerprint is drained");
  assert.equal(proxy.unregistered.length, 1);
  assert.equal(runtime.status().totalRuns, 2);
  assert.equal(runtime.status().activeCalls, 1);

  await runtime.close();
});

test("Harness forwards only session.event notifications to the run's onEvent", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk((instance, _input, runOptions) => {
    assert.equal(typeof runOptions?.onNotification, "function");
    runOptions.onNotification({ method: "session.status", params: { sessionId: "S-1", status: "running" } });
    runOptions.onNotification({
      method: "session.event",
      params: { sessionId: "S-1", event: { seq: 1, type: "user/message" } },
    });
    runOptions.onNotification({
      method: "session.event",
      params: { sessionId: "SUB-1", event: { seq: 2, type: "assistant/message" } },
    });
    return completedResult("streamed");
  });
  const runtime = createHarnessRuntime(runtimeOptions({ proxy, sdk }));

  const events = [];
  const throwingListenerCalls = [];
  assert.equal(
    await runtime.run({
      config: providerConfig(),
      onEvent(event) {
        events.push(event);
        if (events.length === 1) {
          throwingListenerCalls.push("first");
          throw new Error("listener failure must not break the run");
        }
      },
      prompt: "stream me",
    }),
    "streamed",
  );
  assert.deepEqual(events, [
    { seq: 1, type: "user/message" },
    { seq: 2, type: "assistant/message" },
  ]);
  assert.deepEqual(throwingListenerCalls, ["first"], "a throwing listener is contained");
  assert.equal(runtime.status().totalCalls, 1);

  // Without onEvent the SDK run is invoked without streaming options.
  const bare = createHarnessRuntime(runtimeOptions({ proxy: createProxyStub(), sdk: harnessSdk((instance, _input, runOptions) => {
    assert.equal(runOptions, undefined);
    return completedResult("quiet");
  }) }));
  assert.equal(await bare.run({ config: providerConfig(), prompt: "quiet" }), "quiet");
  await bare.close();

  await runtime.close();
});

test("Harness runtime keeps counters across failures and reports them in status", async () => {
  const proxy = createProxyStub();
  const sdk = harnessSdk((instance) => (instance.instanceNumber === 1
    ? { finalResponse: "x", events: [{ type: "turn/end", data: { reason: { kind: "error" } } }] }
    : completedResult("recovered")));
  const runtime = createHarnessRuntime(runtimeOptions({ proxy, sdk }));

  await assert.rejects(() => runtime.run({ config: providerConfig(), prompt: "fails" }), { code: "AI_HARNESS_TURN_FAILED" });
  assert.equal(await runtime.run({ config: providerConfig(), prompt: "recovers" }), "recovered");

  const status = runtime.status();
  assert.equal(status.totalCalls, 1, "only successful runs count as calls");
  assert.equal(status.totalRuns, 2, "the failed run's runtime was disposed and rebuilt");
  assert.equal(status.active, true);

  await runtime.close();
});
