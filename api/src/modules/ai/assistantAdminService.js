const { validMaxTokens, validTemperature } = require("./assistantStore");

function assistantError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function createAiAssistantAdminService({ assistantStore, readProviderList }) {
  if (!assistantStore || typeof assistantStore.read !== "function" || typeof assistantStore.write !== "function") {
    throw new Error("AI assistant store is required.");
  }

  async function resolvedPublic(config, includeSystemPrompt) {
    const resolved = await assistantStore.resolve(config);
    return assistantStore.publicConfig(config, { includeSystemPrompt, resolved });
  }

  async function validate(config) {
    if (!String(config.name || "").trim()) {
      throw assistantError("VALIDATION_FAILED", "Assistant name is required.", 400);
    }
    if (String(config.name).length > 120 || String(config.model || "").length > 160 || String(config.systemPrompt || "").length > 12000) {
      throw assistantError("VALIDATION_FAILED", "Assistant configuration is too long.", 400);
    }
    if (validTemperature(config.temperature) === null) {
      throw assistantError("VALIDATION_FAILED", "temperature must be between 0 and 2.", 400);
    }
    if (validMaxTokens(config.maxTokens) === null) {
      throw assistantError("VALIDATION_FAILED", "maxTokens must be a positive integer no greater than 32768.", 400);
    }
    if (config.providerId) {
      const list = await readProviderList();
      const provider = (list?.providers || []).find((item) => item.id === config.providerId);
      if (!provider) throw assistantError("RESOURCE_NOT_FOUND", "Selected AI Provider config was not found.", 404);
      if (!provider.enabled) throw assistantError("VALIDATION_FAILED", "Selected AI Provider must be enabled.", 400);
    }
  }

  return {
    async get() {
      const config = await assistantStore.read();
      return resolvedPublic(config, true);
    },
    async getPublic() {
      const config = await assistantStore.read();
      return resolvedPublic(config, false);
    },
    async resolve() {
      return assistantStore.resolve();
    },
    async update(body = {}) {
      const before = await assistantStore.read();
      if (hasOwn(body, "name") && !String(body.name ?? "").trim()) {
        throw assistantError("VALIDATION_FAILED", "Assistant name is required.", 400);
      }
      if (hasOwn(body, "temperature") && validTemperature(body.temperature) === null) {
        throw assistantError("VALIDATION_FAILED", "temperature must be between 0 and 2.", 400);
      }
      if (hasOwn(body, "maxTokens") && validMaxTokens(body.maxTokens) === null) {
        throw assistantError("VALIDATION_FAILED", "maxTokens must be a positive integer no greater than 32768.", 400);
      }
      const next = assistantStore.normalize({
        ...before,
        ...(hasOwn(body, "name") ? { name: body.name } : {}),
        ...(hasOwn(body, "enabled") ? { enabled: body.enabled } : {}),
        ...(hasOwn(body, "providerId") ? { providerId: body.providerId } : {}),
        ...(hasOwn(body, "model") ? { model: body.model } : {}),
        ...(hasOwn(body, "systemPrompt") ? { systemPrompt: body.systemPrompt } : {}),
        ...(hasOwn(body, "temperature") ? { temperature: body.temperature } : {}),
        ...(hasOwn(body, "maxTokens") ? { maxTokens: body.maxTokens } : {}),
      });
      await validate(next);
      const written = await assistantStore.write(next);
      return {
        before: await resolvedPublic(before, true),
        after: await resolvedPublic(written, true),
      };
    },
  };
}

module.exports = { createAiAssistantAdminService };
