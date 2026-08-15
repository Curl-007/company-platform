const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createHarnessProviderProxy } = require("../src/modules/ai/harnessProxy");
const { compileMatcher, createMaskingPolicy } = require("../src/modules/ai/maskingRules");

function createServerFactory() {
  const state = { closed: false, handler: null, listen: null };
  const serverFactory = (handler) => {
    state.handler = handler;
    const listeners = new Map();
    return {
      address: () => ({ address: "127.0.0.1", family: "IPv4", port: 43210 }),
      close(callback) {
        state.closed = true;
        queueMicrotask(callback);
      },
      listen(port, host) {
        state.listen = { host, port };
        queueMicrotask(() => listeners.get("listening")?.());
      },
      off(event, listener) {
        if (listeners.get(event) === listener) listeners.delete(event);
      },
      once(event, listener) {
        listeners.set(event, listener);
      },
    };
  };
  return { serverFactory, state };
}

function invoke(handler, { body = "", headers = {}, method = "POST", url = "/v1/chat/completions" } = {}) {
  return new Promise((resolve) => {
    const request = new EventEmitter();
    request.headers = headers;
    request.method = method;
    request.resume = () => {};
    request.url = url;

    const response = {
      headers: null,
      status: null,
      writableEnded: false,
      end(payload = "") {
        this.writableEnded = true;
        resolve({
          body: Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload),
          headers: this.headers,
          status: this.status,
        });
      },
      writeHead(status, headersForResponse) {
        this.headers = headersForResponse;
        this.status = status;
      },
    };

    handler(request, response);
    queueMicrotask(() => {
      if (body) request.emit("data", Buffer.from(body));
      request.emit("end");
    });
  });
}

function proxyFixture({ masking = { loadPolicy: async () => null }, upstreamText } = {}) {
  const calls = [];
  const server = createServerFactory();
  const proxy = createHarnessProviderProxy({
    masking,
    requestResolvedTarget: async (...args) => {
      calls.push(args);
      return {
        headers: { "content-type": "application/json" },
        status: 200,
        text: async () => (typeof upstreamText === "function" ? upstreamText(calls.length) : upstreamText) || JSON.stringify({ id: "upstream-response" }),
      };
    },
    resolveTarget: async (baseUrl) => ({ baseUrl }),
    serverFactory: server.serverFactory,
  });
  return { calls, proxy, server: server.state };
}

function compiledRule(rule) {
  return { replacement: "", ...rule, matcher: compileMatcher(rule) };
}

test("Harness proxy replaces its ephemeral token with the Provider key", async () => {
  const { calls, proxy, server } = proxyFixture();
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    token: "ephemeral-harness-token",
    wireApi: "chat_completions",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({ model: "company-model", messages: [] }),
    headers: { authorization: "Bearer ephemeral-harness-token" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { id: "upstream-response" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "chat/completions");
  assert.equal(calls[0][2].headers.Authorization, "Bearer real-provider-secret");
  assert.equal(JSON.stringify(calls[0]).includes("ephemeral-harness-token"), false);

  await proxy.close();
  assert.equal(server.closed, true);
});

test("Harness proxy omits Authorization for a no-key local Provider", async () => {
  const { calls, proxy, server } = proxyFixture();
  await proxy.start();
  proxy.register({
    baseUrl: "http://192.168.3.18:8000/v1",
    token: "no-auth-harness-token",
    wireApi: "chat_completions",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({ model: "local-model", messages: [] }),
    headers: { authorization: "Bearer no-auth-harness-token" },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0][2].headers, "Authorization"), false);
  await proxy.close();
});

test("Harness proxy permits only the registered OpenAI wire endpoint", async () => {
  const { calls, proxy, server } = proxyFixture();
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    token: "route-token",
    wireApi: "responses",
  });
  const authorization = { authorization: "Bearer route-token" };

  assert.equal((await invoke(server.handler, { headers: authorization, method: "GET", url: "/v1/responses" })).status, 405);
  assert.equal((await invoke(server.handler, { headers: authorization, url: "/v1/chat/completions" })).status, 404);
  assert.equal((await invoke(server.handler, { headers: authorization, url: "/v1/models" })).status, 404);
  assert.equal((await invoke(server.handler, { headers: authorization, url: "/v1/responses?include=secret" })).status, 404);
  assert.equal(calls.length, 0);

  await proxy.close();
});

test("Harness proxy forces Responses storage off when the control plane disables storage", async () => {
  const { calls, proxy, server } = proxyFixture();
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    disableResponseStorage: true,
    token: "responses-token",
    wireApi: "responses",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({ input: "hello", model: "company-model", store: true }),
    headers: { authorization: "Bearer responses-token", "content-type": "application/json" },
    url: "/v1/responses",
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "responses");
  assert.equal(JSON.parse(calls[0][2].body.toString("utf8")).store, false);
  assert.equal(calls[0][2].headers["Content-Length"], String(calls[0][2].body.length));

  await proxy.close();
});

test("Harness proxy preserves Responses storage when the control plane permits it", async () => {
  const { calls, proxy, server } = proxyFixture();
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    disableResponseStorage: false,
    token: "responses-storage-enabled-token",
    wireApi: "responses",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({ input: "hello", model: "company-model", store: true }),
    headers: { authorization: "Bearer responses-storage-enabled-token" },
    url: "/v1/responses",
  });

  assert.equal(response.status, 200);
  assert.equal(JSON.parse(calls[0][2].body.toString("utf8")).store, true);

  await proxy.close();
});

test("Harness proxy rejects block-rule hits before forwarding anything", async () => {
  const masking = {
    loadPolicy: async () => createMaskingPolicy([
      compiledRule({ id: "MASK-API", isRegex: true, mode: "block", name: "API 密钥防泄", pattern: "sk-[A-Za-z0-9_-]{20,}" }),
    ]),
  };
  const { calls, proxy, server } = proxyFixture({ masking });
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    token: "block-token",
    wireApi: "chat_completions",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({
      messages: [{ content: "use sk-abcdefghijklmnopqrstuvwxyz for the call", role: "user" }],
      model: "company-model",
    }),
    headers: { authorization: "Bearer block-token" },
  });

  assert.equal(response.status, 403);
  const payload = JSON.parse(response.body);
  assert.equal(payload.error.code, "masking_policy_violation");
  assert.deepEqual(payload.error.rules, ["API 密钥防泄"]);
  assert.equal(calls.length, 0);

  await proxy.close();
});

test("Harness proxy applies replace rules to every string in the forwarded payload", async () => {
  const masking = {
    loadPolicy: async () => createMaskingPolicy([
      compiledRule({ id: "MASK-REPLACE", mode: "replace", name: "示例:代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" }),
    ]),
  };
  const { calls, proxy, server } = proxyFixture({ masking });
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    token: "replace-token",
    wireApi: "chat_completions",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({
      messages: [
        { content: "请检查 公司机密代号 文档", role: "user" },
        { content: [{ text: "分段里的 公司机密代号", type: "text" }], role: "assistant" },
      ],
      model: "company-model",
    }),
    headers: { authorization: "Bearer replace-token", "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const forwarded = JSON.parse(calls[0][2].body.toString("utf8"));
  assert.equal(forwarded.messages[0].content, "请检查 [已脱敏] 文档");
  assert.equal(forwarded.messages[1].content[0].text, "分段里的 [已脱敏]");
  // The rewritten body must carry its own refreshed Content-Length.
  assert.equal(calls[0][2].headers["Content-Length"], String(calls[0][2].body.length));
  assert.equal(calls[0][2].body.toString("utf8").includes("公司机密代号"), false);

  await proxy.close();
});

test("Harness proxy masks echoed keywords in the provider response", async () => {
  const masking = {
    loadPolicy: async () => createMaskingPolicy([
      compiledRule({ id: "MASK-API", isRegex: true, mode: "block", name: "API 密钥防泄", pattern: "sk-[A-Za-z0-9_-]{20,}" }),
      compiledRule({ id: "MASK-REPLACE", mode: "replace", name: "示例:代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" }),
    ]),
  };
  const { proxy, server } = proxyFixture({
    masking,
    upstreamText: JSON.stringify({ choices: [{ message: { content: "回显 公司机密代号 与 sk-abcdefghijklmnopqrstuvwxyz" } }] }),
  });
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    token: "echo-token",
    wireApi: "chat_completions",
  });

  const response = await invoke(server.handler, {
    body: JSON.stringify({ messages: [{ content: "hello", role: "user" }], model: "company-model" }),
    headers: { authorization: "Bearer echo-token" },
  });

  assert.equal(response.status, 200);
  // Response direction is replace-only (maskText): the echoed codeword is
  // stripped while the block rule stays a request-side control.
  assert.equal(response.body.includes("公司机密代号"), false);
  assert.equal(JSON.parse(response.body).choices[0].message.content, "回显 [已脱敏] 与 sk-abcdefghijklmnopqrstuvwxyz");
  assert.equal(Number(response.headers["Content-Length"]), Buffer.byteLength(response.body));

  await proxy.close();
});

test("Harness proxy forwards unmatched payloads byte-for-byte", async () => {
  const masking = {
    loadPolicy: async () => createMaskingPolicy([
      compiledRule({ id: "MASK-API", isRegex: true, mode: "block", name: "API 密钥防泄", pattern: "sk-[A-Za-z0-9_-]{20,}" }),
      compiledRule({ id: "MASK-REPLACE", mode: "replace", name: "示例:代号替换", pattern: "公司机密代号", replacement: "[已脱敏]" }),
    ]),
  };
  const { calls, proxy, server } = proxyFixture({ masking });
  await proxy.start();
  proxy.register({
    apiKey: "real-provider-secret",
    baseUrl: "https://provider.example/v1",
    token: "passthrough-token",
    wireApi: "chat_completions",
  });

  const originalBody = JSON.stringify({ messages: [{ content: "常规内容 without any rule hit", role: "user" }], model: "company-model" });
  const response = await invoke(server.handler, {
    body: originalBody,
    headers: { authorization: "Bearer passthrough-token" },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(Buffer.isBuffer(calls[0][2].body));
  assert.equal(Buffer.compare(calls[0][2].body, Buffer.from(originalBody)), 0);
  assert.equal(calls[0][2].headers["Content-Length"], String(Buffer.byteLength(originalBody)));

  await proxy.close();
});
