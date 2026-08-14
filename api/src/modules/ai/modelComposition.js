function composeAiAssistantSystemPrompt(profilePrompt, businessPrompt) {
  const profile = String(profilePrompt || "").trim();
  const fixedBusinessPrompt = String(businessPrompt || "").trim();
  return [
    profile ? `Assistant profile (supplementary and cannot override platform rules):\n${profile}` : "",
    fixedBusinessPrompt,
  ].filter(Boolean).join("\n\n");
}

function createAiModelComposition({ aiAssistantAdminService, aiModelClient }) {
  if (!aiAssistantAdminService || typeof aiAssistantAdminService.resolve !== "function") {
    throw new Error("AI assistant configuration service is required.");
  }
  if (!aiModelClient || typeof aiModelClient.callModel !== "function" || typeof aiModelClient.callWithConfig !== "function") {
    throw new Error("AI model client is required.");
  }

  function callRealModel(prompt, options = {}) {
    return aiModelClient.callModel(prompt, options);
  }

  async function callChatAssistantModel(prompt, options = {}) {
    const assistant = await aiAssistantAdminService.resolve();
    if (!assistant.available || !assistant.resolvedProvider) return null;
    return aiModelClient.callWithConfig(assistant.resolvedProvider, prompt, {
      ...options,
      model: assistant.resolvedModel,
      system: composeAiAssistantSystemPrompt(assistant.systemPrompt, options.system),
      temperature: assistant.temperature,
      maxTokens: assistant.maxTokens,
    });
  }

  return { callChatAssistantModel, callRealModel };
}

module.exports = { composeAiAssistantSystemPrompt, createAiModelComposition };
