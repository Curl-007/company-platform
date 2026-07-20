function normalizeAiWireApi(value) {
  return ["responses", "chat_completions"].includes(value) ? value : "chat_completions";
}

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
  fetchImpl = fetch,
  normalizeAttachments = () => [],
  dataUrlForAttachment = () => null,
  recordSuccess = () => {},
  recordFailure = () => {},
  getTimeoutMs = () => 30000,
  logger = console,
}) {
  if (typeof getConfig !== "function") throw new Error("AI provider config resolver is required.");

  async function callModel(prompt, options = {}) {
    const config = await getConfig();
    if (!config || !config.enabled) return null;
    if (!config.apiKey || !config.baseUrl || !config.model) return null;
    const system = options.system || "你是企业项目管理平台的分析助手，输出简洁、可审核、可落地的中文内容。";
    const imageAttachments = normalizeAttachments(options.attachments || []).filter((item) => item.kind === "image");
    const responseUserContent = [
      { type: "input_text", text: prompt },
      ...imageAttachments.map((item) => ({ type: "input_image", image_url: dataUrlForAttachment(item) })).filter((item) => item.image_url),
    ];
    const chatUserContent = [
      { type: "text", text: prompt },
      ...imageAttachments.map((item) => ({ type: "image_url", image_url: { url: dataUrlForAttachment(item) } })).filter((item) => item.image_url.url),
    ];
    const buildBody = (wireApi) => wireApi === "responses"
      ? {
          model: config.model,
          input: [
            { role: "system", content: system },
            { role: "user", content: responseUserContent.length > 1 ? responseUserContent : prompt },
          ],
          temperature: options.temperature ?? 0.2,
          ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
          store: !config.disableResponseStorage,
        }
      : {
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: chatUserContent.length > 1 ? chatUserContent : prompt },
          ],
          temperature: options.temperature ?? 0.2,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        };

    async function requestModel(wireApi) {
      const attemptStarted = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || getTimeoutMs() || 30000));
      const endpoint = wireApi === "responses" ? "responses" : "chat/completions";
      try {
        const response = await fetchImpl(`${config.baseUrl}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(buildBody(wireApi)),
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const error = new Error(`AI model request failed: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`);
          error.status = response.status;
          throw error;
        }
        const data = await response.json();
        await recordSuccess({ wireApi, latencyMs: Date.now() - attemptStarted });
        return wireApi === "responses"
          ? extractResponsesText(data)
          : data.choices?.[0]?.message?.content || null;
      } catch (error) {
        await recordFailure(error, { wireApi, latencyMs: Date.now() - attemptStarted });
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    const requestedWireApi = normalizeAiWireApi(options.wireApi || config.wireApi);
    const primaryWireApi = requestedWireApi === "responses" ? "responses" : "chat_completions";
    try {
      return await requestModel(primaryWireApi);
    } catch (error) {
      const fallbackWireApi = primaryWireApi === "responses" ? "chat_completions" : "responses";
      logger?.warn?.(`AI ${primaryWireApi} request failed, retrying ${fallbackWireApi}:`, error.message);
      return requestModel(fallbackWireApi);
    }
  }

  return { callModel };
}

module.exports = {
  createAiModelClient,
  extractResponsesText,
  normalizeAiWireApi,
};
