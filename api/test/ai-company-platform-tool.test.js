const assert = require("node:assert/strict");
const test = require("node:test");

const ENV_KEYS = [
  "DSH_EXECUTION_TOKEN",
  "DSH_EXECUTION_GATEWAY_URL",
  "DSH_EXECUTION_PROJECT_ID",
  "DSH_EXECUTION_CAPABILITY_ID",
  "DSH_EXECUTION_CAPABILITY_VERSION",
];

function setPlatformAssistantEnvironment() {
  process.env.DSH_EXECUTION_TOKEN = "platform-tool-test-token";
  process.env.DSH_EXECUTION_GATEWAY_URL = "http://127.0.0.1:43123";
  process.env.DSH_EXECUTION_PROJECT_ID = "PRJ-1";
  process.env.DSH_EXECUTION_CAPABILITY_ID = "platform-assistant";
  process.env.DSH_EXECUTION_CAPABILITY_VERSION = "1.0.0";
}

function restoreEnvironment(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("platform tool plugin registers domain tools only for platform assistant sessions", async () => {
  const plugin = await import("../config/harness/company-platform-tool.mjs");
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    setPlatformAssistantEnvironment();
    const registered = [];
    plugin.apply({
      approval: { request: async () => "allowed-once" },
      systemPrompt: { section: () => {} },
      tools: { register: (tool) => registered.push(tool) },
    });
    assert.equal(registered[0].name, "company_platform_catalog");
    assert.equal(registered.some((tool) => tool.name === "company_projects"), true);
    assert.equal(registered.some((tool) => tool.name === "company_requirements"), true);
    assert.equal(registered.length, 20);
    const catalog = await registered[0].execute({});
    assert.equal(catalog.domains.some((domain) => domain.id === "projects"), true);
  } finally {
    restoreEnvironment(previous);
  }
});

test("platform write tools require approval before calling the loopback gateway", async () => {
  const plugin = await import("../config/harness/company-platform-tool.mjs");
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    setPlatformAssistantEnvironment();
    const registered = [];
    let approvals = 0;
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ init, url: String(url) });
      return new Response(JSON.stringify({ data: { result: { data: { id: "PRJ-1" }, operation: { action: "post_projects" } } } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };
    plugin.apply({
      approval: { request: async () => { approvals += 1; return "allowed-once"; } },
      systemPrompt: { section: () => {} },
      tools: { register: (tool) => registered.push(tool) },
    });
    const projects = registered.find((tool) => tool.name === "company_projects");
    const value = await projects.execute(
      { operation: "post_projects", request: { body: { name: "AI project" } } },
      { agent: { session: { events: [] } }, callId: "call-1", signal: new AbortController().signal },
    );
    assert.equal(value.data.id, "PRJ-1");
    assert.equal(approvals, 1);
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].init.body).operation, "post_projects");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(previous);
  }
});
