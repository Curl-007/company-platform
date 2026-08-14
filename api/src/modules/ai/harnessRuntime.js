const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createHarnessProviderProxy } = require("./harnessProxy");

const DEFAULT_AI_SYSTEM_PROMPT = "You are an analysis assistant for a company project management platform. Return concise, auditable, actionable Chinese content.";
const DEFAULT_MAX_RUNS_PER_RUNTIME = 20;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MODEL_MAX_TOKENS = 32768;
const DEFAULT_CONTEXT_WINDOW = 262144;
const DEFAULT_TIMEOUT_MS = 30000;
const COMPANY_RUNTIME_COMPOSITION = "company-runtime-v1";
const IMAGE_LIMITS = Object.freeze({
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 6,
  maxMessageImageBytes: 12 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  mediaTypes: Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"]),
});

const SAFE_CHILD_ENV_KEYS = Object.freeze([
  "ComSpec",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NODE_ENV",
  "PATHEXT",
  "PATH",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TZ",
  "WINDIR",
]);

function harnessError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

function normalizeWireApi(value) {
  return value === "responses" ? "responses" : "chat_completions";
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteTemperature(value, fallback = 0.2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveHarnessPaths({ apiRoot = path.resolve(__dirname, "../../.."), env = process.env } = {}) {
  const resolvedApiRoot = path.resolve(apiRoot);
  const configDirectory = path.join(resolvedApiRoot, "config", "harness");
  const resolveFromApiRoot = (value, fallback) => {
    const configured = String(value || "").trim();
    return configured ? path.resolve(resolvedApiRoot, configured) : fallback;
  };
  const home = resolveFromApiRoot(env.HARNESS_HOME, path.join(resolvedApiRoot, "storage", "harness"));
  const fixedConfigPath = path.join(configDirectory, "cordis.yml");
  const requestedConfigPath = resolveFromApiRoot(env.HARNESS_RUNTIME_CONFIG, fixedConfigPath);
  if (String(env.NODE_ENV || "").toLowerCase() === "production" && requestedConfigPath !== fixedConfigPath) {
    throw harnessError("AI_HARNESS_CONFIG_OVERRIDE_FORBIDDEN", "Production Harness composition override is forbidden.", 500);
  }
  return {
    apiRoot: resolvedApiRoot,
    configDirectory,
    configPath: requestedConfigPath,
    home,
    launcherPath: path.join(configDirectory, "company-runtime.mjs"),
    sessionRoot: path.join(home, "sessions"),
  };
}

function parseRuntimeArgs(value) {
  if (!String(value || "").trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw harnessError("AI_HARNESS_RUNTIME_ARGS_INVALID", "HARNESS_RUNTIME_ARGS must be a JSON array of strings.", 500);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw harnessError("AI_HARNESS_RUNTIME_ARGS_INVALID", "HARNESS_RUNTIME_ARGS must be a JSON array of strings.", 500);
  }
  return parsed;
}

function resolveRuntimeLaunch({ env = process.env, configPath, launcherPath } = {}) {
  const configuredCommand = String(env.HARNESS_RUNTIME_COMMAND || "").trim();
  const configuredArgs = parseRuntimeArgs(env.HARNESS_RUNTIME_ARGS);
  const production = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (production && (configuredCommand || configuredArgs)) {
    throw harnessError("AI_HARNESS_RUNTIME_OVERRIDE_FORBIDDEN", "Production Harness launch override is forbidden.", 500);
  }
  if (configuredCommand) {
    return { command: configuredCommand, args: configuredArgs || [] };
  }
  if (configuredArgs) {
    throw harnessError(
      "AI_HARNESS_RUNTIME_ARGS_WITHOUT_COMMAND",
      "HARNESS_RUNTIME_ARGS requires HARNESS_RUNTIME_COMMAND.",
      500,
    );
  }
  return {
    command: process.execPath,
    args: [launcherPath || path.join(path.dirname(configPath), "company-runtime.mjs"), configPath],
  };
}

function copySafeEnvironment(parentEnv) {
  const childEnv = {};
  for (const key of SAFE_CHILD_ENV_KEYS) {
    if (parentEnv[key] !== undefined && String(parentEnv[key]) !== "") childEnv[key] = String(parentEnv[key]);
  }
  return childEnv;
}

function buildHarnessChildEnv({
  descriptor,
  env = process.env,
  paths,
  proxyBaseUrl,
  token,
} = {}) {
  if (!descriptor || !paths || !proxyBaseUrl || !token) {
    throw harnessError("AI_HARNESS_CHILD_ENV_INVALID", "Harness child environment is incomplete.", 500);
  }
  const childEnv = {
    ...copySafeEnvironment(env),
    DSH_API_KEY: token,
    DSH_BASE_URL: proxyBaseUrl,
    DSH_CONTEXT_WINDOW: String(DEFAULT_CONTEXT_WINDOW),
    DSH_HOME: paths.home,
    DSH_MODEL: descriptor.model,
    DSH_MODEL_MAX_TOKENS: String(Math.max(descriptor.maxTokens, DEFAULT_MODEL_MAX_TOKENS)),
    DSH_RUNTIME_COMPOSITION: COMPANY_RUNTIME_COMPOSITION,
    DSH_SESSION_ROOT: paths.sessionRoot,
    DSH_SYSTEM_PROMPT: descriptor.system,
    DSH_TEMPERATURE: String(descriptor.temperature),
    DSH_WIRE_API: descriptor.wireApi,
  };
  if (descriptor.execution) {
    childEnv.DSH_EXECUTION_CAPABILITY_ID = descriptor.execution.capabilityId;
    childEnv.DSH_EXECUTION_CAPABILITY_VERSION = descriptor.execution.capabilityVersion;
    childEnv.DSH_EXECUTION_GATEWAY_URL = descriptor.execution.gatewayBaseUrl;
    childEnv.DSH_EXECUTION_PROJECT_ID = descriptor.execution.projectId;
    childEnv.DSH_EXECUTION_TOKEN = descriptor.execution.token;
  }
  return childEnv;
}

function normalizeExecution(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw harnessError("AI_HARNESS_EXECUTION_INVALID", "Harness execution context is invalid.", 500);
  }
  const required = ["capabilityId", "capabilityVersion", "gatewayBaseUrl", "projectId", "token"];
  const normalized = {};
  for (const key of required) {
    const text = String(value[key] || "").trim();
    if (!text || text.length > 2048) throw harnessError("AI_HARNESS_EXECUTION_INVALID", "Harness execution context is incomplete.", 500);
    normalized[key] = text;
  }
  let gateway;
  try {
    gateway = new URL(normalized.gatewayBaseUrl);
  } catch {
    throw harnessError("AI_HARNESS_EXECUTION_INVALID", "Harness execution gateway URL is invalid.", 500);
  }
  if (gateway.protocol !== "http:" || gateway.hostname !== "127.0.0.1" || gateway.username || gateway.password) {
    throw harnessError("AI_HARNESS_EXECUTION_INVALID", "Harness execution gateway must use IPv4 loopback.", 500);
  }
  if (normalized.capabilityId !== "project-snapshot" || !/^\d+\.\d+\.\d+$/.test(normalized.capabilityVersion)) {
    throw harnessError("AI_HARNESS_EXECUTION_INVALID", "Harness execution capability is not approved.", 500);
  }
  return normalized;
}

async function resolveExecution(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalizeExecution(value);
  }
  if (typeof value.issueToken !== "function") return normalizeExecution(value);
  const { issueToken, ...scope } = value;
  const token = await issueToken();
  return normalizeExecution({ ...scope, token });
}

function runtimeDescriptor({ config, execution, model, wireApi, maxTokens, system, temperature, defaultMaxTokens }) {
  if (!config?.baseUrl) {
    throw harnessError("AI_HARNESS_CONFIG_INVALID", "AI provider configuration is incomplete.", 500);
  }
  const resolvedModel = String(model || config.model || "").trim();
  if (!resolvedModel) throw harnessError("AI_HARNESS_CONFIG_INVALID", "AI provider model is missing.", 500);
  return {
    apiKey: String(config.apiKey || ""),
    baseUrl: String(config.baseUrl),
    disableResponseStorage: Boolean(config.disableResponseStorage),
    maxTokens: positiveInteger(maxTokens, defaultMaxTokens),
    model: resolvedModel,
    system: String(system || DEFAULT_AI_SYSTEM_PROMPT),
    temperature: finiteTemperature(temperature),
    wireApi: normalizeWireApi(wireApi || config.wireApi),
    ...(execution ? { execution: normalizeExecution(execution) } : {}),
  };
}

function fingerprintFor(descriptor) {
  return crypto.createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
}

function turnFailure(result) {
  const events = Array.isArray(result?.events) ? result.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "turn/end") continue;
    const reason = event?.data?.reason;
    if (reason?.kind === "completed") return null;
    const detail = String(reason?.error?.message || reason?.kind || "unknown").slice(0, 360);
    const error = harnessError("AI_HARNESS_TURN_FAILED", `Harness inference turn failed: ${detail}`, reason?.error?.status);
    error.harnessReason = reason?.kind || "unknown";
    error.providerCode = reason?.error?.code || "";
    return error;
  }
  return harnessError("AI_HARNESS_TURN_UNFINISHED", "Harness inference did not report a completed turn.");
}

function buildOverallTimeoutError(timeoutMs) {
  return harnessError("AI_HARNESS_TIMEOUT", `Harness inference timed out after ${timeoutMs}ms.`, 504);
}

function createHarnessRuntime({
  apiRoot,
  createProxy = createHarnessProviderProxy,
  env = process.env,
  fsImpl = fs,
  importAttachments = () => import("@deepseek-ai/dsh-attachment-local"),
  importSdk = () => import("@deepseek-ai/dsh-sdk-client"),
  logger = console,
  saveImageFile,
} = {}) {
  const paths = resolveHarnessPaths({ apiRoot, env });
  const proxy = createProxy();
  const maxRunsPerRuntime = positiveInteger(env.HARNESS_MAX_RUNS_PER_RUNTIME, DEFAULT_MAX_RUNS_PER_RUNTIME);
  const defaultMaxTokens = positiveInteger(env.HARNESS_DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  let active;
  let closed = false;
  let closeTask;
  let queue = Promise.resolve();
  let queueDepth = 0;

  async function saveImage(attachment) {
    const saver = saveImageFile || (await importAttachments()).saveImageFile;
    if (typeof saver !== "function") {
      throw harnessError("AI_HARNESS_ATTACHMENTS_UNAVAILABLE", "Harness image attachment storage is unavailable.", 500);
    }
    return saver(path.join(paths.home, "attachments", "v1"), {
      data: Buffer.from(attachment.contentBase64, "base64"),
      mediaType: attachment.mimeType,
      name: attachment.name,
    }, IMAGE_LIMITS);
  }

  async function buildInput(prompt, attachments) {
    const blocks = [{ type: "text", text: String(prompt || "") }];
    for (const attachment of attachments || []) {
      if (attachment?.kind !== "image" || !attachment.contentBase64) continue;
      blocks.push({ type: "image", attachment: await saveImage(attachment) });
    }
    return blocks;
  }

  async function disposeRuntime(runtime) {
    if (!runtime) return;
    runtime.disposeTask ||= (async () => {
      if (active === runtime) active = undefined;
      proxy.unregister(runtime.token);
      try {
        await runtime.harness.close();
      } catch (error) {
        logger?.warn?.("Harness runtime close warning:", error?.message || error);
      }
    })();
    await runtime.disposeTask;
  }

  async function ensureRuntime(descriptor) {
    const fingerprint = fingerprintFor(descriptor);
    if (active && active.fingerprint === fingerprint && !active.disposeTask) return active;
    if (active) await disposeRuntime(active);
    if (!fsImpl.existsSync(paths.configPath)) {
      throw harnessError("AI_HARNESS_CONFIG_MISSING", `Harness configuration was not found: ${paths.configPath}`, 500);
    }

    const proxyBaseUrl = await proxy.start();
    const token = crypto.randomBytes(32).toString("base64url");
    const { execution, ...providerDescriptor } = descriptor;
    proxy.register({ token, ...providerDescriptor });
    try {
      const sdk = await importSdk();
      if (typeof sdk?.DeepSeekHarness !== "function") {
        throw harnessError("AI_HARNESS_SDK_UNAVAILABLE", "DeepSeek Harness SDK did not expose DeepSeekHarness.", 500);
      }
      const launch = resolveRuntimeLaunch({ env, configPath: paths.configPath, launcherPath: paths.launcherPath });
      const harness = new sdk.DeepSeekHarness({
        launch: {
          ...launch,
          cwd: paths.configDirectory,
          disposeEofGraceMs: 2000,
          disposeGraceMs: 1000,
          env: buildHarnessChildEnv({ descriptor, env, paths, proxyBaseUrl, token }),
          requestTimeoutMs: DEFAULT_TIMEOUT_MS,
          shutdownTimeoutMs: 800,
        },
        cwd: paths.configDirectory,
        maxTokens: descriptor.maxTokens,
        model: descriptor.model,
        provider: "company",
      });
      active = { calls: 0, descriptor, fingerprint, harness, token };
      return active;
    } catch (error) {
      proxy.unregister(token);
      throw error;
    }
  }

  async function runBounded(runtime, input, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const settle = (method, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        method(value);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        void disposeRuntime(runtime).finally(() => {
          settle(reject, buildOverallTimeoutError(timeoutMs));
        });
      }, timeoutMs);
      Promise.resolve(runtime.harness.run(input)).then(
        (result) => {
          if (!timedOut) settle(resolve, result);
        },
        (error) => {
          if (!timedOut) settle(reject, error);
        },
      );
    });
  }

  function enqueue(work) {
    queueDepth += 1;
    const operation = queue.then(work, work).finally(() => {
      queueDepth -= 1;
    });
    queue = operation.catch(() => {});
    return operation;
  }

  async function run({ attachments = [], config, execution, maxTokens, model, prompt, system, temperature, timeoutMs, wireApi } = {}) {
    return enqueue(async () => {
      if (closed) throw harnessError("AI_HARNESS_CLOSED", "Harness runtime is closed.", 503);
      // Capability tokens are minted only after this request owns the shared
      // FIFO slot, so unrelated queued inference cannot consume their TTL.
      const resolvedExecution = await resolveExecution(execution);
      const descriptor = runtimeDescriptor({
        config,
        defaultMaxTokens,
        execution: resolvedExecution,
        maxTokens,
        model,
        system,
        temperature,
        wireApi,
      });
      const runtime = await ensureRuntime(descriptor);
      const boundedTimeoutMs = positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
      try {
        const result = await runBounded(runtime, await buildInput(prompt, attachments), boundedTimeoutMs);
        const error = turnFailure(result);
        if (error) throw error;
        runtime.calls += 1;
        const text = typeof result?.finalResponse === "string" ? result.finalResponse.trim() : "";
        if (runtime.calls >= maxRunsPerRuntime) await disposeRuntime(runtime);
        return text || null;
      } catch (error) {
        await disposeRuntime(runtime);
        throw error;
      }
    });
  }

  async function close() {
    if (closeTask) return closeTask;
    closed = true;
    closeTask = (async () => {
      await disposeRuntime(active);
      await queue.catch(() => {});
      await proxy.close();
    })();
    return closeTask;
  }

  return {
    close,
    run,
    status: () => ({
      active: Boolean(active),
      activeCalls: active?.calls || 0,
      closed,
      maxRunsPerRuntime,
      proxy: proxy.status?.() || { started: false },
      queued: queueDepth,
    }),
  };
}

module.exports = {
  DEFAULT_AI_SYSTEM_PROMPT,
  DEFAULT_MAX_RUNS_PER_RUNTIME,
  DEFAULT_MAX_TOKENS,
  COMPANY_RUNTIME_COMPOSITION,
  IMAGE_LIMITS,
  SAFE_CHILD_ENV_KEYS,
  buildHarnessChildEnv,
  createHarnessRuntime,
  normalizeWireApi,
  normalizeExecution,
  resolveExecution,
  resolveHarnessPaths,
  resolveRuntimeLaunch,
  turnFailure,
};
