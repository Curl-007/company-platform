const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAiModelClient,
  extractResponsesText,
  normalizeAiWireApi,
} = require("../src/modules/ai/modelClient");

function jsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("AI model client returns null without network calls when provider is disabled or incomplete", async () => {
  const calls = [];
  const disabledClient = createAiModelClient({
    getConfig: () => ({ enabled: false }),
    fetchImpl: async (...args) => calls.push(args),
  });
  assert.equal(await disabledClient.callModel("hello"), null);

  const incompleteClient = createAiModelClient({
    getConfig: () => ({ enabled: true, apiKey: "", baseUrl: "https://example.test", model: "m" }),
    fetchImpl: async (...args) => calls.push(args),
  });
  assert.equal(await incompleteClient.callModel("hello"), null);
  assert.equal(calls.length, 0);
});

test("AI model client calls chat completions and records provider success", async () => {
  const calls = [];
  const successes = [];
  const client = createAiModelClient({
    getConfig: () => ({
      enabled: true,
      apiKey: "sk-test",
      baseUrl: "https://model.test/v1",
      model: "model-a",
      wireApi: "chat_completions",
      disableResponseStorage: true,
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return jsonResponse({ choices: [{ message: { content: "chat ok" } }] });
    },
    recordSuccess: (payload) => successes.push(payload),
    recordFailure: () => assert.fail("failure should not be recorded"),
    getTimeoutMs: () => 1000,
  });

  const text = await client.callModel("请分析", { temperature: 0.1, maxTokens: 128 });

  assert.equal(text, "chat ok");
  assert.equal(calls[0].url, "https://model.test/v1/chat/completions");
  assert.equal(calls[0].body.model, "model-a");
  assert.equal(calls[0].body.messages[1].content, "请分析");
  assert.equal(calls[0].body.max_tokens, 128);
  assert.equal(successes[0].wireApi, "chat_completions");
  assert.equal(typeof successes[0].latencyMs, "number");
});

test("AI model client falls back from responses to chat completions and preserves health evidence", async () => {
  const calls = [];
  const successes = [];
  const failures = [];
  const client = createAiModelClient({
    getConfig: () => ({
      enabled: true,
      apiKey: "sk-test",
      baseUrl: "https://model.test/v1",
      model: "model-r",
      wireApi: "responses",
      disableResponseStorage: false,
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (calls.length === 1) return jsonResponse({ error: "bad gateway" }, false, 502);
      return jsonResponse({ choices: [{ message: { content: "fallback ok" } }] });
    },
    recordSuccess: (payload) => successes.push(payload),
    recordFailure: (error, payload) => failures.push({ error, payload }),
    logger: { warn: () => {} },
  });

  const text = await client.callModel("prompt");

  assert.equal(text, "fallback ok");
  assert.equal(calls[0].url, "https://model.test/v1/responses");
  assert.equal(calls[0].body.store, true);
  assert.equal(calls[1].url, "https://model.test/v1/chat/completions");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error.status, 502);
  assert.equal(failures[0].payload.wireApi, "responses");
  assert.equal(successes[0].wireApi, "chat_completions");
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
