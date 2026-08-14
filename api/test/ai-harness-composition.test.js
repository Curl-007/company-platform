const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createHarnessProviderProxy } = require("../src/modules/ai/harnessProxy");
const { createHarnessRuntime } = require("../src/modules/ai/harnessRuntime");

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Smoke Provider did not expose a TCP port.");
  return { port: address.port, server };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

function localResolvedTarget(baseUrl) {
  const url = new URL(baseUrl);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  return {
    addresses: Object.freeze([{ address: "127.0.0.1", family: 4 }]),
    hostname: "127.0.0.1",
    lookup: null,
    url,
  };
}

function runtimeEnvironment(home) {
  const env = { HARNESS_HOME: home };
  for (const key of ["ComSpec", "LANG", "LC_ALL", "LC_CTYPE", "NODE_ENV", "PATHEXT", "PATH", "SystemRoot", "TEMP", "TMP", "TZ", "WINDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

test("Harness rc.6 composition sends chat completions through the local Provider proxy", { timeout: 30000 }, async () => {
  const providerKey = "smoke-real-provider-key";
  const upstreamRequests = [];
  const { port, server } = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    upstreamRequests.push({
      authorization: String(req.headers.authorization || ""),
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: req.method,
      url: req.url,
    });
    res.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: { content: "Harness composition smoke response" }, finish_reason: null, index: 0 }],
      created: 0,
      id: "chatcmpl-smoke",
      model: "smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`);
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
      created: 0,
      id: "chatcmpl-smoke",
      model: "smoke-model",
      object: "chat.completion.chunk",
    })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-smoke-"));
  let childEnv;
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: runtimeEnvironment(home),
    importSdk: async () => {
      const sdk = await import("@deepseek-ai/dsh-sdk-client");
      class ObservedHarness extends sdk.DeepSeekHarness {
        constructor(options) {
          childEnv = options.launch.env;
          super(options);
        }
      }
      return { DeepSeekHarness: ObservedHarness };
    },
    logger: { warn: () => {} },
  });

  try {
    const text = await runtime.run({
      config: {
        apiKey: providerKey,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-model",
        wireApi: "chat_completions",
      },
      prompt: "Return the smoke response.",
      timeoutMs: 15000,
    });

    assert.equal(text, "Harness composition smoke response");
    assert.equal(upstreamRequests.length, 1);
    assert.deepEqual({ method: upstreamRequests[0].method, url: upstreamRequests[0].url }, {
      method: "POST",
      url: "/v1/chat/completions",
    });
    assert.equal(upstreamRequests[0].authorization, `Bearer ${providerKey}`);
    assert.equal(upstreamRequests[0].body.model, "smoke-model");
    assert.match(childEnv.DSH_API_KEY, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(childEnv.DSH_API_KEY, providerKey);
    assert.equal(upstreamRequests[0].authorization.includes(childEnv.DSH_API_KEY), false);
    assert.equal(JSON.stringify(upstreamRequests[0]).includes(childEnv.DSH_API_KEY), false);
  } finally {
    await runtime.close();
    await closeServer(server);
    await fs.rm(home, { force: true, recursive: true });
  }
});

test("Harness rc.6 composition sends Responses API requests through the local Provider proxy", { timeout: 30000 }, async () => {
  const providerKey = "smoke-responses-provider-key";
  const upstreamRequests = [];
  const responseText = "Harness Responses composition smoke response";
  const outputItem = {
    content: [{ annotations: [], text: responseText, type: "output_text" }],
    id: "msg-smoke-response",
    role: "assistant",
    status: "completed",
    type: "message",
  };
  const terminalResponse = {
    id: "resp-smoke",
    output: [outputItem],
    status: "completed",
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 8,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 20,
    },
  };
  const { port, server } = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    upstreamRequests.push({
      authorization: String(req.headers.authorization || ""),
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: req.method,
      url: req.url,
    });
    res.writeHead(200, {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    for (const event of [
      { response: { id: terminalResponse.id }, type: "response.created" },
      { item: { ...outputItem, content: [], status: "in_progress" }, output_index: 0, type: "response.output_item.added" },
      { content_index: 0, delta: responseText, output_index: 0, type: "response.output_text.delta" },
      { item: outputItem, output_index: 0, type: "response.output_item.done" },
      { response: terminalResponse, type: "response.completed" },
    ]) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "company-harness-responses-smoke-"));
  let childEnv;
  const runtime = createHarnessRuntime({
    createProxy: () => createHarnessProviderProxy({ resolveTarget: async (baseUrl) => localResolvedTarget(baseUrl) }),
    env: runtimeEnvironment(home),
    importSdk: async () => {
      const sdk = await import("@deepseek-ai/dsh-sdk-client");
      class ObservedHarness extends sdk.DeepSeekHarness {
        constructor(options) {
          childEnv = options.launch.env;
          super(options);
        }
      }
      return { DeepSeekHarness: ObservedHarness };
    },
    logger: { warn: () => {} },
  });

  try {
    const text = await runtime.run({
      config: {
        apiKey: providerKey,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        disableResponseStorage: true,
        model: "smoke-responses-model",
        wireApi: "responses",
      },
      prompt: "Return the Responses smoke response.",
      timeoutMs: 15000,
    });

    assert.equal(text, responseText);
    assert.equal(upstreamRequests.length, 1);
    assert.deepEqual({ method: upstreamRequests[0].method, url: upstreamRequests[0].url }, {
      method: "POST",
      url: "/v1/responses",
    });
    assert.equal(upstreamRequests[0].authorization, `Bearer ${providerKey}`);
    assert.equal(upstreamRequests[0].body.model, "smoke-responses-model");
    assert.equal(upstreamRequests[0].body.store, false);
    assert.equal(childEnv.DSH_API_KEY === providerKey, false);
    assert.equal(upstreamRequests[0].authorization.includes(childEnv.DSH_API_KEY), false);
    assert.equal(JSON.stringify(upstreamRequests[0]).includes(childEnv.DSH_API_KEY), false);
  } finally {
    await runtime.close();
    await closeServer(server);
    await fs.rm(home, { force: true, recursive: true });
  }
});
