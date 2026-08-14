const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createHarnessProviderProxy } = require("../src/modules/ai/harnessProxy");

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

function proxyFixture() {
  const calls = [];
  const server = createServerFactory();
  const proxy = createHarnessProviderProxy({
    requestResolvedTarget: async (...args) => {
      calls.push(args);
      return {
        headers: { "content-type": "application/json" },
        status: 200,
        text: async () => JSON.stringify({ id: "upstream-response" }),
      };
    },
    resolveTarget: async (baseUrl) => ({ baseUrl }),
    serverFactory: server.serverFactory,
  });
  return { calls, proxy, server: server.state };
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
