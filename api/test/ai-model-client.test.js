const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAiModelClient,
  extractResponsesText,
  normalizeAiWireApi,
} = require("../src/modules/ai/modelClient");

function providerConfig(overrides = {}) {
  return {
    apiKey: "provider-secret",
    baseUrl: "https://provider.example/v1",
    disableResponseStorage: true,
    enabled: true,
    model: "company-model",
    wireApi: "chat_completions",
    ...overrides,
  };
}

function harnessStub(runImpl = async () => "Harness response") {
  return {
    closeCalls: 0,
    calls: [],
    async close() {
      this.closeCalls += 1;
    },
    async run(input) {
      this.calls.push(input);
      return runImpl(input);
    },
    status() {
      return { active: true, queued: 0 };
    },
  };
}

test("AI model client does not initialize Harness when the Provider is disabled or missing a route, but permits a no-key local Provider", async () => {
  let runtimeCreates = 0;
  const createRuntime = () => {
    runtimeCreates += 1;
    return harnessStub();
  };
  const disabledClient = createAiModelClient({
    createRuntime,
    getConfig: () => ({ enabled: false }),
  });
  const incompleteClient = createAiModelClient({
    createRuntime,
    getConfig: () => providerConfig({ baseUrl: "" }),
  });
  const noKeyRuntime = harnessStub();
  const noKeyClient = createAiModelClient({
    createRuntime: () => noKeyRuntime,
    getConfig: () => providerConfig({ apiKey: "" }),
  });

  assert.equal(await disabledClient.callModel("hello"), null);
  assert.equal(await incompleteClient.callModel("hello"), null);
  assert.equal(runtimeCreates, 0);
  assert.equal(disabledClient.status().initialized, false);
  assert.equal(await noKeyClient.callModel("hello"), "Harness response");
  assert.equal(noKeyRuntime.calls[0].config.apiKey, "");
});

test("AI model client passes model options and verified image attachments to Harness", async () => {
  const successes = [];
  const runtime = harnessStub();
  const image = {
    contentBase64: Buffer.from("image-bytes").toString("base64"),
    kind: "image",
    mimeType: "image/png",
    name: "roadmap.png",
  };
  const client = createAiModelClient({
    createRuntime: () => runtime,
    getConfig: () => providerConfig(),
    normalizeAttachments: () => [image, { kind: "document", name: "notes.md" }],
    recordFailure: () => assert.fail("failure should not be recorded"),
    recordSuccess: (payload) => successes.push(payload),
  });

  assert.equal(await client.callModel("inspect roadmap", {
    attachments: [{ ignored: true }],
    maxTokens: 512,
    model: "requested-model",
    system: "Use concise output.",
    temperature: 0.1,
    timeoutMs: 1234,
  }), "Harness response");

  assert.equal(runtime.calls.length, 1);
  assert.deepEqual(runtime.calls[0], {
    attachments: [image],
    config: providerConfig(),
    maxTokens: 512,
    model: "requested-model",
    prompt: "inspect roadmap",
    system: "Use concise output.",
    temperature: 0.1,
    timeoutMs: 1234,
    wireApi: "chat_completions",
  });
  assert.equal(successes.length, 1);
  assert.equal(successes[0].wireApi, "chat_completions");
  assert.equal(typeof successes[0].latencyMs, "number");
  assert.equal(client.status().initialized, true);
  assert.equal(client.status().runtime.active, true);
});

test("AI model client retries the other Harness wire API and preserves health evidence", async () => {
  const failures = [];
  const successes = [];
  const warnings = [];
  const runtime = harnessStub(async ({ wireApi }) => {
    if (wireApi === "responses") {
      const error = new Error("Responses endpoint unavailable");
      error.status = 502;
      throw error;
    }
    return "fallback response";
  });
  const client = createAiModelClient({
    createRuntime: () => runtime,
    getConfig: () => providerConfig({ wireApi: "responses" }),
    logger: { warn: (...args) => warnings.push(args) },
    recordFailure: (error, payload) => failures.push({ error, payload }),
    recordSuccess: (payload) => successes.push(payload),
  });

  assert.equal(await client.callModel("prompt"), "fallback response");
  assert.deepEqual(runtime.calls.map((call) => call.wireApi), ["responses", "chat_completions"]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error.status, 502);
  assert.equal(failures[0].payload.wireApi, "responses");
  assert.equal(successes.length, 1);
  assert.equal(successes[0].wireApi, "chat_completions");
  assert.equal(warnings.length, 1);
});

test("AI capability execution does not retry a Harness wire request after its one-use gateway token may be consumed", async () => {
  const runtime = harnessStub(async () => {
    const error = new Error("tool turn failed after dispatch");
    error.code = "AI_HARNESS_TURN_FAILED";
    error.status = 502;
    throw error;
  });
  const client = createAiModelClient({
    createRuntime: () => runtime,
    getConfig: () => providerConfig({ wireApi: "responses" }),
    logger: { warn: () => assert.fail("execution calls must not retry another wire API") },
  });

  await assert.rejects(
    () => client.callModel("read the scoped project", {
      execution: {
        capabilityId: "project-snapshot",
        capabilityVersion: "1.0.0",
        gatewayBaseUrl: "http://127.0.0.1:43123",
        projectId: "PRJ-1",
        token: "one-use-token",
      },
    }),
    { code: "AI_HARNESS_TURN_FAILED" },
  );
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0].wireApi, "responses");
  assert.equal(runtime.calls[0].execution.token, "one-use-token");
});

test("AI provider policy errors do not trigger a second Harness wire request", async () => {
  const runtime = harnessStub(async () => {
    const error = new Error("Provider address is forbidden");
    error.code = "AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN";
    throw error;
  });
  const client = createAiModelClient({
    createRuntime: () => runtime,
    getConfig: () => providerConfig(),
    logger: { warn: () => assert.fail("policy errors must not fall back") },
  });

  await assert.rejects(() => client.callModel("prompt"), { code: "AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN" });
  assert.equal(runtime.calls.length, 1);
});

test("AI Harness deadlines do not trigger a second wire request", async () => {
  const runtime = harnessStub(async () => {
    const error = new Error("Harness inference timed out after 12000ms.");
    error.code = "AI_HARNESS_TIMEOUT";
    error.status = 504;
    throw error;
  });
  const client = createAiModelClient({
    createRuntime: () => runtime,
    getConfig: () => providerConfig(),
    logger: { warn: () => assert.fail("deadline failures must not fall back") },
  });

  await assert.rejects(() => client.callModel("prompt"), { code: "AI_HARNESS_TIMEOUT", status: 504 });
  assert.equal(runtime.calls.length, 1);
});

test("AI model client closes its lazy Harness runtime and rejects new inference", async () => {
  const runtime = harnessStub();
  const client = createAiModelClient({
    createRuntime: () => runtime,
    getConfig: () => providerConfig(),
    logger: { warn: () => {} },
  });

  await client.callModel("before close");
  await client.close();
  await client.close();
  assert.equal(runtime.closeCalls, 1);
  assert.equal(client.status().closed, true);
  await assert.rejects(() => client.callModel("after close"), { code: "AI_HARNESS_CLOSED", status: 503 });
});

test("AI model client helpers normalize wire APIs and extract Responses text", () => {
  assert.equal(normalizeAiWireApi("responses"), "responses");
  assert.equal(normalizeAiWireApi("legacy"), "chat_completions");
  assert.equal(extractResponsesText({ output_text: "direct" }), "direct");
  assert.equal(extractResponsesText({
    output: [
      { content: [{ text: "one" }, { output_text: "two" }] },
    ],
  }), "one\ntwo");
});
