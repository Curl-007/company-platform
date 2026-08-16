const assert = require("node:assert/strict");
const test = require("node:test");

const ENV_KEYS = [
  "DSH_EXECUTION_TOKEN",
  "DSH_EXECUTION_GATEWAY_URL",
  "DSH_EXECUTION_PROJECT_ID",
  "DSH_EXECUTION_CAPABILITY_ID",
  "DSH_EXECUTION_CAPABILITY_VERSION",
];

function setEnvironment(capabilityId = "platform-assistant") {
  process.env.DSH_EXECUTION_TOKEN = "ui-tool-test-token";
  process.env.DSH_EXECUTION_GATEWAY_URL = "http://127.0.0.1:43124";
  process.env.DSH_EXECUTION_PROJECT_ID = "PRJ-1";
  process.env.DSH_EXECUTION_CAPABILITY_ID = capabilityId;
  process.env.DSH_EXECUTION_CAPABILITY_VERSION = "1.0.0";
}

function restoreEnvironment(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function pluginContext(registered) {
  return {
    systemPrompt: { section: () => {} },
    tools: { register: (tool) => registered.push(tool) },
  };
}

test("standalone UI plugin registers the complete closed UI toolset only for assistant sessions", async () => {
  const plugin = await import("../config/harness/company-ui-tool.mjs");
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    setEnvironment();
    const registered = [];
    plugin.apply(pluginContext(registered));
    assert.deepEqual(registered.map((tool) => tool.name), [
      "company_ui_catalog",
      "company_ui_control",
      "company_ui_layout",
      "company_ui_style",
      "company_ui_view_upsert",
      "company_ui_view_remove",
      "company_ui_view_open",
    ]);
    const catalog = await registered[0].execute({});
    assert.equal(catalog.safety.rendering, "closed-declarative-schema");
    assert.equal(catalog.safety.arbitraryJavaScript, false);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "dashboard" && surface.supportsStyle && !surface.supportsLayout), true);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "projects.detail" && surface.supportsLayout), true);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "mywork.task-detail" && surface.blocks.includes("status-history")), true);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "mywork.requirement-detail" && surface.blocks.includes("acceptance-criteria")), true);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "mywork.defect-detail" && surface.blocks.includes("handoff")), true);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "teamlogs.member-summary" && surface.blocks.includes("weekly-markdown")), true);
    assert.equal(catalog.surfaces.find((surface) => surface.id === "delivery.build-detail").blocks.includes("release-report"), false);
    assert.equal(catalog.surfaces.some((surface) => surface.id === "dsh-ui"), true);
    assert.equal(catalog.platformDomains.reduce((sum, domain) => sum + domain.operationCount, 0), 152);

    setEnvironment("requirements-list");
    const narrow = [];
    plugin.apply(pluginContext(narrow));
    assert.deepEqual(narrow, []);
  } finally {
    restoreEnvironment(previous);
  }
});

test("UI plugin validates locally and sends only normalized declarations to the loopback gateway", async () => {
  const plugin = await import("../config/harness/company-ui-tool.mjs");
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    setEnvironment();
    const registered = [];
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ body: JSON.parse(init.body), url: String(url) });
      return new Response(JSON.stringify({ data: { result: { delivered: 1, ok: true } } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };
    plugin.apply(pluginContext(registered));
    const viewTool = registered.find((tool) => tool.name === "company_ui_view_upsert");
    const result = await viewTool.execute({
      view: {
        id: "quality-room",
        title: "质量视图",
        blocks: [{ id: "open-defects", type: "stat", label: "未关闭缺陷", value: 4, tone: "negative", javascript: "alert(1)" }],
        html: "<script>alert(1)</script>",
      },
    }, { signal: new AbortController().signal });
    assert.deepEqual(result, { delivered: 1, ok: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:43124/v1/execution");
    assert.deepEqual(requests[0].body, {
      capabilityId: "platform-assistant",
      capabilityVersion: "1.0.0",
      directive: {
        kind: "viewUpsert",
        view: {
          blocks: [{ id: "open-defects", type: "stat", label: "未关闭缺陷", value: 4, tone: "negative" }],
          id: "quality-room",
          surface: "dsh-view:quality-room",
          title: "质量视图",
        },
      },
    });

    const control = registered.find((tool) => tool.name === "company_ui_control");
    await assert.rejects(
      () => control.execute({ directive: { kind: "script", source: "alert(1)" } }, { signal: new AbortController().signal }),
      { code: "AI_UI_DIRECTIVE_INVALID" },
    );
    assert.equal(requests.length, 1, "invalid declarations never reach the gateway");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(previous);
  }
});
