const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const {
  assertAiProviderUrlAllowed,
  isPublicIp,
  requestAiProviderUrl,
  validateAiProviderBaseUrl,
} = require("../src/modules/ai/outboundUrlPolicy");

function createFakeTransport({ capture, payload = "{}", statusCode = 200, systemLookup }) {
  return (options, onResponse) => {
    const request = new EventEmitter();
    request.destroy = (error) => queueMicrotask(() => request.emit("error", error));
    request.end = () => {
      const socketLookup = options.lookup || systemLookup;
      socketLookup(options.hostname, { family: 0 }, (error, address, family) => {
        if (error) {
          request.emit("error", error);
          return;
        }
        capture({ address, family, options });
        const response = new EventEmitter();
        response.statusCode = statusCode;
        response.headers = statusCode >= 300 && statusCode < 400 ? { location: "http://127.0.0.1/private" } : {};
        response.resume = () => {};
        onResponse(response);
        queueMicrotask(() => {
          response.emit("data", Buffer.from(payload));
          response.emit("end");
        });
      });
    };
    return request;
  };
}

test("AI outbound policy rejects URL credentials, queries, localhost, and private literals", () => {
  assert.throws(() => validateAiProviderBaseUrl("https://user:pass@example.com/v1"), { code: "AI_PROVIDER_URL_CREDENTIALS_FORBIDDEN" });
  assert.throws(() => validateAiProviderBaseUrl("https://example.com/v1?target=x"), { code: "AI_PROVIDER_URL_INVALID" });
  assert.throws(() => validateAiProviderBaseUrl("http://localhost:11434/v1"), { code: "AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN" });
  assert.throws(() => validateAiProviderBaseUrl("http://127.0.0.1/v1"), { code: "AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN" });
  assert.throws(() => validateAiProviderBaseUrl("http://[::ffff:127.0.0.1]/v1"), { code: "AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN" });
});

test("AI outbound policy classifies representative public and non-public addresses", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("10.1.2.3"), false);
  assert.equal(isPublicIp("169.254.169.254"), false);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("fc00::1"), false);
  assert.equal(isPublicIp("2001:db8::1"), false);
});

test("AI outbound policy rejects a public hostname when any DNS result is private", async () => {
  await assert.rejects(
    () => assertAiProviderUrlAllowed("https://provider.example/v1", {
      lookup: async () => [
        { address: "203.0.114.10", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    }),
    { code: "AI_PROVIDER_PRIVATE_ADDRESS_FORBIDDEN" },
  );
});

test("AI outbound policy permits public DNS results and pins explicit private-host opt-ins", async () => {
  const publicUrl = await assertAiProviderUrlAllowed("https://provider.example/v1/", {
    lookup: async () => [{ address: "203.0.114.10", family: 4 }],
  });
  assert.equal(publicUrl.toString(), "https://provider.example/v1/");

  let lookups = 0;
  const privateUrl = await assertAiProviderUrlAllowed("http://model.internal:11434/v1", {
    allowedPrivateHosts: "model.internal",
    lookup: async () => {
      lookups += 1;
      return [{ address: "10.0.0.5", family: 4 }];
    },
  });
  assert.equal(privateUrl.hostname, "model.internal");
  assert.equal(lookups, 1);
});

test("AI provider request pins policy DNS into socket lookup and preserves Host and SNI", async () => {
  let policyLookups = 0;
  let systemLookups = 0;
  const connections = [];
  const systemLookup = (_hostname, _options, callback) => {
    systemLookups += 1;
    callback(null, "10.0.0.5", 4);
  };

  const response = await requestAiProviderUrl(
    "https://provider.example/v1/",
    "chat/completions",
    { method: "POST", body: "{}", redirect: "error" },
    {
      lookup: async () => {
        policyLookups += 1;
        return [{ address: "8.8.8.8", family: 4 }];
      },
      httpsRequest: createFakeTransport({
        capture: (connection) => connections.push(connection),
        payload: JSON.stringify({ choices: [] }),
        systemLookup,
      }),
    },
  );

  assert.equal(response.ok, true);
  assert.equal(policyLookups, 1);
  assert.equal(systemLookups, 0);
  assert.equal(connections[0].address, "8.8.8.8");
  assert.equal(connections[0].options.hostname, "provider.example");
  assert.equal(connections[0].options.servername, "provider.example");
  assert.equal(connections[0].options.headers.Host, "provider.example");
  assert.equal(connections[0].options.path, "/v1/chat/completions");
  assert.equal(connections[0].options.agent, false);
});

test("AI provider request rejects redirects without issuing a second request", async () => {
  let requests = 0;
  await assert.rejects(
    () => requestAiProviderUrl(
      "https://provider.example/v1",
      "responses",
      { method: "POST", body: "{}", redirect: "error" },
      {
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
        httpsRequest: createFakeTransport({
          capture: () => { requests += 1; },
          statusCode: 302,
          systemLookup: assert.fail,
        }),
      },
    ),
    { code: "AI_PROVIDER_REDIRECT_FORBIDDEN" },
  );
  assert.equal(requests, 1);
});
