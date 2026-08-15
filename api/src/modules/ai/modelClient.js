const { createHarnessRuntime } = require("./harnessRuntime");

function normalizeAiWireApi(value) {
  return ["responses", "chat_completions"].includes(value) ? value : "chat_completions";
}

// Kept for callers that previously consumed Responses API payloads directly.
function extractResponsesText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  const chunks = [];
  output.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part.text === "string") chunks.push(part.text);
      if (typeof part.output_text === "string") chunks.push(part.output_text);
    });
  });
  return chunks.join("\n").trim() || null;
}

function createAiModelClient({
  getConfig,
  createRuntime = createHarnessRuntime,
  normalizeAttachments = () => [],
  recordSuccess = () => {},
  recordFailure = () => {},
  getTimeoutMs = () => 30000,
  logger = console,
}) {
  if (typeof getConfig !== "function") throw new Error("AI provider config resolver is required.");
  if (typeof createRuntime !== "function") throw new Error("AI Harness runtime factory is required.");

  let runtime;
  let runtimeTask;
  let closed = false;
  let closeTask;

  async function getRuntime() {
    if (closed) {
      const error = new Error("AI Harness model client is closed.");
      error.code = "AI_HARNESS_CLOSED";
      error.status = 503;
      throw error;
    }
    if (runtime) return runtime;
    runtimeTask ||= Promise.resolve().then(() => createRuntime());
    try {
      const candidate = await runtimeTask;
      if (!candidate || typeof candidate.run !== "function") {
        throw new Error("AI Harness runtime did not expose run().");
      }
      runtime = candidate;
      return runtime;
    } catch (error) {
      runtimeTask = undefined;
      throw error;
    }
  }

  async function callWithConfig(config, prompt, options = {}) {
    if (!config || !config.enabled) return null;
    if (!config.baseUrl || !config.model) return null;

    const model = String(options.model || config.model || "").trim() || config.model;
    const imageAttachments = normalizeAttachments(options.attachments || []).filter((item) => item.kind === "image");

    async function requestModel(wireApi) {
      const attemptStarted = Date.now();
      try {
        const runtimeInput = {
          attachments: imageAttachments,
          config,
          maxTokens: options.maxTokens,
          model,
          prompt,
          system: options.system,
          temperature: options.temperature,
          timeoutMs: Number(options.timeoutMs || getTimeoutMs() || 30000),
          wireApi,
        };
        if (options.execution !== undefined) runtimeInput.execution = options.execution;
        if (typeof options.onEvent === "function") runtimeInput.onEvent = options.onEvent;
        const text = await (await getRuntime()).run(runtimeInput);
        await recordSuccess({ wireApi, latencyMs: Date.now() - attemptStarted });
        return text;
      } catch (error) {
        await recordFailure(error, { wireApi, latencyMs: Date.now() - attemptStarted });
        throw error;
      }
    }

    const requestedWireApi = normalizeAiWireApi(options.wireApi || config.wireApi);
    const primaryWireApi = requestedWireApi === "responses" ? "responses" : "chat_completions";
    try {
      return await requestModel(primaryWireApi);
    } catch (error) {
      const code = String(error?.code || "");
      if (options.execution || code.startsWith("AI_PROVIDER_") || [
        "AI_HARNESS_ATTACHMENTS_UNAVAILABLE",
        "AI_HARNESS_CHILD_ENV_INVALID",
        "AI_HARNESS_CLOSED",
        "AI_HARNESS_CONFIG_INVALID",
        "AI_HARNESS_CONFIG_MISSING",
        "AI_HARNESS_CONFIG_OVERRIDE_FORBIDDEN",
        "AI_HARNESS_EXECUTION_INVALID",
        "AI_HARNESS_RUNTIME_ARGS_INVALID",
        "AI_HARNESS_RUNTIME_ARGS_WITHOUT_COMMAND",
        "AI_HARNESS_RUNTIME_OVERRIDE_FORBIDDEN",
        "AI_HARNESS_SDK_UNAVAILABLE",
      ].includes(code)) throw error;
      const fallbackWireApi = primaryWireApi === "responses" ? "chat_completions" : "responses";
      logger?.warn?.(`AI ${primaryWireApi} Harness request failed, retrying ${fallbackWireApi}:`, error.message);
      return requestModel(fallbackWireApi);
    }
  }

  async function callModel(prompt, options = {}) {
    return callWithConfig(await getConfig(), prompt, options);
  }

  async function close() {
    if (closeTask) return closeTask;
    closed = true;
    closeTask = (async () => {
      try {
        const current = runtime || await runtimeTask;
        if (typeof current?.close === "function") await current.close();
      } catch (error) {
        logger?.warn?.("AI Harness model client close warning:", error?.message || error);
      }
    })();
    return closeTask;
  }

  return {
    callModel,
    callWithConfig,
    close,
    status: () => ({
      closed,
      initialized: Boolean(runtime),
      runtime: runtime?.status?.() || { active: false, queued: 0 },
    }),
  };
}

module.exports = {
  createAiModelClient,
  extractResponsesText,
  normalizeAiWireApi,
};
