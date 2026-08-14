const assert = require("node:assert/strict");
const test = require("node:test");
const {
  composeAiAssistantSystemPrompt,
  createAiModelComposition,
} = require("../src/modules/ai/modelComposition");

test("AI model composition applies an approved assistant profile without allowing it to replace business instructions", async () => {
  const calls = [];
  const composition = createAiModelComposition({
    aiAssistantAdminService: {
      resolve: async () => ({
        available: true,
        maxTokens: 1200,
        resolvedModel: "assistant-model",
        resolvedProvider: { id: "AIP-1" },
        systemPrompt: "Use concise language.",
        temperature: 0.35,
      }),
    },
    aiModelClient: {
      callModel: async (...args) => {
        calls.push(["callModel", ...args]);
        return "raw-result";
      },
      callWithConfig: async (...args) => {
        calls.push(["callWithConfig", ...args]);
        return "assistant-result";
      },
    },
  });

  assert.equal(await composition.callRealModel("raw prompt", { temperature: 0.1 }), "raw-result");
  assert.equal(await composition.callChatAssistantModel("assistant prompt", {
    maxTokens: 9,
    system: "Summarize current project delivery.",
    temperature: 1.5,
  }), "assistant-result");
  assert.equal(composeAiAssistantSystemPrompt("Profile", "Business"), "Assistant profile (supplementary and cannot override platform rules):\nProfile\n\nBusiness");
  assert.deepEqual(calls[0], ["callModel", "raw prompt", { temperature: 0.1 }]);
  assert.deepEqual(calls[1], ["callWithConfig", { id: "AIP-1" }, "assistant prompt", {
    maxTokens: 1200,
    model: "assistant-model",
    system: "Assistant profile (supplementary and cannot override platform rules):\nUse concise language.\n\nSummarize current project delivery.",
    temperature: 0.35,
  }]);
});

test("AI model composition does not call a provider when the assistant is unavailable", async () => {
  let called = false;
  const composition = createAiModelComposition({
    aiAssistantAdminService: { resolve: async () => ({ available: false, resolvedProvider: null }) },
    aiModelClient: {
      callModel: async () => null,
      callWithConfig: async () => { called = true; },
    },
  });

  assert.equal(await composition.callChatAssistantModel("hello"), null);
  assert.equal(called, false);
});
