const crypto = require("node:crypto");
const http = require("node:http");
const {
  requestResolvedAiProviderTarget,
  resolveAiProviderTarget,
} = require("./outboundUrlPolicy");

const DEFAULT_MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

function proxyError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeWireApi(value) {
  return value === "responses" ? "responses" : "chat_completions";
}

function expectedEndpoint(wireApi) {
  return normalizeWireApi(wireApi) === "responses" ? "responses" : "chat/completions";
}

function endpointForRequestUrl(value) {
  let parsed;
  try {
    parsed = new URL(value || "/", "http://127.0.0.1");
  } catch {
    return null;
  }
  if (parsed.search || parsed.hash) return null;
  if (parsed.pathname === "/v1/responses" || parsed.pathname === "/responses") return "responses";
  if (parsed.pathname === "/v1/chat/completions" || parsed.pathname === "/chat/completions") return "chat/completions";
  return null;
}

function bearerToken(value) {
  const source = Array.isArray(value) ? value[0] : value;
  const match = /^Bearer\s+(.+)$/i.exec(String(source || "").trim());
  return match ? match[1] : "";
}

function sameToken(left, right) {
  const leftBytes = Buffer.from(String(left || ""));
  const rightBytes = Buffer.from(String(right || ""));
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("error", fail);
    req.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        fail(proxyError("AI_HARNESS_PROXY_BODY_TOO_LARGE", "Harness request body is too large.", 413));
        req.resume();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
  });
}

function applyResponseStoragePolicy(body, route) {
  if (route.wireApi !== "responses" || !route.disableResponseStorage) return body;
  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    throw proxyError("AI_HARNESS_PROXY_INVALID_JSON", "Harness sent an invalid Responses request.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw proxyError("AI_HARNESS_PROXY_INVALID_JSON", "Harness sent an invalid Responses request.", 400);
  }
  return Buffer.from(JSON.stringify({ ...payload, store: false }));
}

function maskingViolation(rules) {
  const error = proxyError(
    "AI_MASKING_POLICY_VIOLATION",
    `Request rejected by the AI data masking policy: ${rules.join(", ")}.`,
    403,
  );
  error.maskingRules = rules;
  return error;
}

// Deep-walks every string value (objects, arrays, nested messages[].content
// segments included) collecting block-rule hits before anything is forwarded.
function collectStringViolations(value, policy, violations) {
  if (typeof value === "string") {
    for (const violation of policy.inspectText(value)) violations.push(violation);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringViolations(item, policy, violations);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringViolations(item, policy, violations);
  }
}

// Returns a structurally shared copy with replace rules applied to every
// string; the original object is returned untouched when nothing matched.
function maskPayloadStrings(value, policy) {
  if (typeof value === "string") return policy.maskText(value);
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const masked = maskPayloadStrings(item, policy);
      if (masked !== item) changed = true;
      return masked;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const masked = maskPayloadStrings(item, policy);
      if (masked !== item) changed = true;
      next[key] = masked;
    }
    return changed ? next : value;
  }
  return value;
}

function applyRequestMasking(body, policy) {
  if (!policy) return body;
  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    // The proxy only ever receives JSON from the harness child; anything else
    // is passed through byte-for-byte for the upstream to reject.
    return body;
  }
  const violations = [];
  collectStringViolations(payload, policy, violations);
  if (violations.length) {
    throw maskingViolation(violations.map((violation) => violation.name));
  }
  const masked = maskPayloadStrings(payload, policy);
  if (masked === payload) return body;
  return Buffer.from(JSON.stringify(masked));
}

// Response direction: pure text replacement on the provider body (parse or
// not), so a model echoing a masked keyword cannot leak it back.
function maskResponseText(text, policy) {
  if (!policy || typeof policy.maskText !== "function") return text;
  try {
    return policy.maskText(String(text ?? ""));
  } catch {
    return text;
  }
}

// Default masking source: the shared rule service over the process database,
// resolved lazily on first use. Injectable via the factory for tests.
function createDefaultMaskingPolicyLoader() {
  let engine;
  return async () => {
    try {
      engine ||= require("./maskingRules").createDefaultAiMaskingEngine();
      return await engine.loadPolicy();
    } catch {
      return null;
    }
  };
}

function writeJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function writeProviderResponse(res, response, text) {
  if (res.writableEnded) return;
  const contentType = response?.headers?.["content-type"] || "application/json; charset=utf-8";
  res.writeHead(Number(response?.status || 502), {
    "Content-Type": Array.isArray(contentType) ? contentType[0] : contentType,
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function publicError(error) {
  const message = String(error?.message || "Harness provider proxy request failed.").replace(/\s+/g, " ").slice(0, 360);
  return { error: { message, type: error?.code || "AI_HARNESS_PROXY_FAILED" } };
}

function createHarnessProviderProxy({
  masking,
  maxBodyBytes = DEFAULT_MAX_PROXY_BODY_BYTES,
  requestResolvedTarget = requestResolvedAiProviderTarget,
  resolveTarget = resolveAiProviderTarget,
  serverFactory = http.createServer,
} = {}) {
  const routes = new Map();
  const loadMaskingPolicy = typeof masking?.loadPolicy === "function"
    ? () => masking.loadPolicy()
    : createDefaultMaskingPolicyLoader();
  let server;
  let startTask;
  let baseUrl = null;
  let closeTask;

  function routeForToken(token) {
    for (const route of routes.values()) {
      if (sameToken(token, route.token)) return route;
    }
    return null;
  }

  async function handle(req, res) {
    const route = routeForToken(bearerToken(req.headers.authorization));
    if (!route) {
      writeJson(res, 401, { error: { message: "Harness proxy authentication failed.", type: "AI_HARNESS_PROXY_UNAUTHORIZED" } });
      return;
    }
    if (req.method !== "POST") {
      writeJson(res, 405, { error: { message: "Harness proxy only accepts POST inference requests.", type: "AI_HARNESS_PROXY_METHOD_FORBIDDEN" } });
      return;
    }
    const endpoint = endpointForRequestUrl(req.url);
    if (!endpoint || endpoint !== expectedEndpoint(route.wireApi)) {
      writeJson(res, 404, { error: { message: "Harness proxy endpoint is not allowed.", type: "AI_HARNESS_PROXY_ENDPOINT_FORBIDDEN" } });
      return;
    }

    try {
      const body = applyResponseStoragePolicy(await readRequestBody(req, maxBodyBytes), route);
      const maskingPolicy = await loadMaskingPolicy();
      const outboundBody = applyRequestMasking(body, maskingPolicy);
      const target = await resolveTarget(route.baseUrl);
      const headers = {
        Accept: String(req.headers.accept || "application/json"),
        "Content-Type": String(req.headers["content-type"] || "application/json"),
        "Content-Length": String(outboundBody.length),
      };
      if (route.apiKey) headers.Authorization = `Bearer ${route.apiKey}`;
      const response = await requestResolvedTarget(target, endpoint, {
        method: "POST",
        headers,
        body: outboundBody,
        redirect: "error",
      });
      writeProviderResponse(res, response, maskResponseText(await response.text(), maskingPolicy));
    } catch (error) {
      if (Array.isArray(error?.maskingRules)) {
        writeJson(res, 403, {
          error: {
            message: String(error.message),
            code: "masking_policy_violation",
            rules: error.maskingRules,
          },
        });
        return;
      }
      writeJson(res, Number(error?.status) || 502, publicError(error));
    }
  }

  async function start() {
    if (baseUrl) return baseUrl;
    startTask ||= new Promise((resolve, reject) => {
      server = serverFactory((req, res) => {
        void handle(req, res);
      });
      const onError = (error) => {
        server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server?.off("error", onError);
        const address = server?.address();
        if (!address || typeof address === "string") {
          reject(proxyError("AI_HARNESS_PROXY_START_FAILED", "Harness proxy did not expose a loopback port.", 500));
          return;
        }
        baseUrl = `http://127.0.0.1:${address.port}/v1`;
        resolve(baseUrl);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
    return startTask;
  }

  function register({ token, baseUrl: providerBaseUrl, apiKey, wireApi, disableResponseStorage }) {
    if (!token || !providerBaseUrl) {
      throw proxyError("AI_HARNESS_PROXY_ROUTE_INVALID", "Harness proxy route is incomplete.", 500);
    }
    routes.set(token, {
      token,
      baseUrl: providerBaseUrl,
      apiKey: String(apiKey || ""),
      wireApi: normalizeWireApi(wireApi),
      disableResponseStorage: Boolean(disableResponseStorage),
    });
  }

  function unregister(token) {
    routes.delete(token);
  }

  async function close() {
    if (closeTask) return closeTask;
    closeTask = (async () => {
      routes.clear();
      if (!server) return;
      await new Promise((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
      });
      server = undefined;
      baseUrl = null;
    })();
    return closeTask;
  }

  return {
    close,
    register,
    start,
    status: () => ({ activeRoutes: routes.size, started: Boolean(baseUrl) }),
    unregister,
  };
}

module.exports = {
  DEFAULT_MAX_PROXY_BODY_BYTES,
  createHarnessProviderProxy,
  endpointForRequestUrl,
  expectedEndpoint,
  normalizeWireApi,
};
