const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const EXECUTION_ENV_KEYS = [
  "DSH_EXECUTION_CAPABILITY_ID",
  "DSH_EXECUTION_CAPABILITY_VERSION",
  "DSH_EXECUTION_GATEWAY_URL",
  "DSH_EXECUTION_PROJECT_ID",
  "DSH_EXECUTION_TOKEN",
];

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

async function applyToolModule(env) {
  const original = Object.fromEntries(EXECUTION_ENV_KEYS.map((key) => [key, process.env[key]]));
  const sections = [];
  const tools = new Map();
  let moduleUrl;
  try {
    Object.assign(process.env, env);
    moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "config", "harness", "company-execution-tool.mjs")).href;
    const executionTool = await import(moduleUrl);
    executionTool.apply({
      systemPrompt: { section: (section) => sections.push(section) },
      tools: { register: (tool) => { tools.set(tool.name, tool); } },
    });
    return { sections, tools };
  } finally {
    for (const key of EXECUTION_ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

function baseEnv(port, { capabilityId = "project-snapshot", capabilityVersion = "1.0.0" } = {}) {
  return {
    DSH_EXECUTION_CAPABILITY_ID: capabilityId,
    DSH_EXECUTION_CAPABILITY_VERSION: capabilityVersion,
    DSH_EXECUTION_GATEWAY_URL: `http://127.0.0.1:${port}`,
    DSH_EXECUTION_PROJECT_ID: "PRJ-1",
    DSH_EXECUTION_TOKEN: "scoped-tool-token",
  };
}

test("company execution tool registers only the signed project snapshot and rejects a project mismatch before I/O", async () => {
  const requests = [];
  const server = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: req.method,
      url: req.url,
    });
    const body = JSON.stringify({ data: { snapshot: { metrics: {}, project: { id: "PRJ-1" } } } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  try {
    const port = server.address().port;
    const { sections, tools } = await applyToolModule(baseEnv(port));

    assert.equal(tools.size, 11);
    assert.deepEqual([...tools.keys()].sort(), [
      "browser_control",
      "defects_list",
      "project_snapshot",
      "reminder_create",
      "reminders_list",
      "requirement_create",
      "requirement_get",
      "requirements_list",
      "task_create",
      "tasks_list",
      "ui_control",
    ]);
    assert.equal(sections[0].name, "company:execution-policy");
    const snapshot = await tools.get("project_snapshot").execute({ projectId: "PRJ-1" }, { signal: undefined });
    assert.equal(snapshot.project.id, "PRJ-1");
    assert.deepEqual(requests, [{
      authorization: "Bearer scoped-tool-token",
      body: { projectId: "PRJ-1" },
      method: "POST",
      url: "/v1/project-snapshot",
    }]);

    await assert.rejects(
      () => tools.get("project_snapshot").execute({ projectId: "PRJ-2" }, { signal: undefined }),
      /restricted to the invocation project/,
    );
    assert.equal(requests.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool forwards requirements_list through the scoped domain route", async () => {
  const requests = [];
  const server = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: req.method,
      url: req.url,
    });
    const body = JSON.stringify({
      data: {
        evidence: { capabilityId: "requirements-list", event: "execution-gateway.requirements-list" },
        result: { count: 1, projectId: "PRJ-1", requirements: [{ id: "REQ-1", title: "Login" }] },
      },
    });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "requirements-list" }));
    const result = await tools.get("requirements_list").execute({ projectId: "PRJ-1" }, { signal: undefined });
    assert.equal(result.requirements[0].id, "REQ-1");
    assert.deepEqual(requests, [{
      authorization: "Bearer scoped-tool-token",
      body: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      method: "POST",
      url: "/v1/execution",
    }]);

    await assert.rejects(
      () => tools.get("requirements_list").execute({ projectId: "PRJ-OTHER" }, { signal: undefined }),
      /restricted to the invocation project/,
    );
    assert.equal(requests.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool forwards write tools with validated payloads", async () => {
  const requests = [];
  const server = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const body = JSON.stringify({ data: { evidence: {}, result: { requirement: { id: "REQ-9" } } } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "requirement-create" }));
    const created = await tools.get("requirement_create").execute({
      projectId: "PRJ-1",
      title: "  AI drafted requirement  ",
      description: "scoped write",
      priority: "high",
    }, { signal: undefined });
    assert.equal(created.requirement.id, "REQ-9");
    assert.deepEqual(requests, [{
      capabilityId: "requirement-create",
      capabilityVersion: "1.0.0",
      description: "scoped write",
      priority: "high",
      projectId: "PRJ-1",
      title: "AI drafted requirement",
    }]);

    const task = await tools.get("task_create").execute({
      projectId: "PRJ-1",
      requirementId: "REQ-1",
      title: "AI drafted task",
      estimatedHours: "12",
    }, { signal: undefined });
    assert.equal(task.requirement.id, "REQ-9");
    assert.equal(requests[1].estimatedHours, 12);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool rejects invalid arguments locally without calling the gateway", async () => {
  let requests = 0;
  const server = await listen(() => { requests += 1; });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "requirement-create" }));
    const cases = [
      [tools.get("requirements_list"), {}],
      [tools.get("requirements_list"), { projectId: " " }],
      [tools.get("requirement_get"), { projectId: "PRJ-1" }],
      [tools.get("requirement_create"), { projectId: "PRJ-1" }],
      [tools.get("requirement_create"), { projectId: "PRJ-1", title: "x".repeat(201) }],
      [tools.get("requirement_create"), { projectId: "PRJ-1", title: "ok", priority: "urgent" }],
      [tools.get("requirement_create"), { projectId: "PRJ-1", title: "ok", description: "d".repeat(4001) }],
      [tools.get("task_create"), { projectId: "PRJ-1", title: "ok" }],
      [tools.get("task_create"), { projectId: "PRJ-1", requirementId: "REQ-1", title: "ok", estimatedHours: -4 }],
      [tools.get("task_create"), { projectId: "PRJ-1", requirementId: "REQ-1", title: "ok", estimatedHours: "soon" }],
      [tools.get("defects_list"), { projectId: 42 }],
    ];
    for (const [tool, args] of cases) {
      // Rejected either by the dsh tool wrapper (missing/typed arguments) or
      // by the tool's own structured validation; neither path performs I/O.
      await assert.rejects(
        () => tool.execute(args, { signal: undefined }),
        (error) => error.code === "AI_EXECUTION_TOOL_INVALID_INPUT" || error.name === "ToolArgsError",
      );
    }
    assert.equal(requests, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool forwards reminder tools with validated payloads", async () => {
  const requests = [];
  const server = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const body = JSON.stringify({ data: { evidence: {}, result: { reminder: { id: "REM-9" } } } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "reminder-create" }));
    const created = await tools.get("reminder_create").execute({
      projectId: "PRJ-1",
      message: "  Check the burn-down tomorrow  ",
      remindAt,
      invocationId: "AIC-REM",
    }, { signal: undefined });
    assert.equal(created.reminder.id, "REM-9");
    assert.deepEqual(requests, [{
      capabilityId: "reminder-create",
      capabilityVersion: "1.0.0",
      invocationId: "AIC-REM",
      message: "Check the burn-down tomorrow",
      projectId: "PRJ-1",
      remindAt,
    }]);

    const listed = await tools.get("reminders_list").execute({ projectId: "PRJ-1" }, { signal: undefined });
    assert.equal(listed.reminder.id, "REM-9");
    assert.deepEqual(requests[1], {
      capabilityId: "reminders-list",
      capabilityVersion: "1.0.0",
      projectId: "PRJ-1",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool rejects invalid reminder arguments locally without calling the gateway", async () => {
  let requests = 0;
  const server = await listen(() => { requests += 1; });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "reminder-create" }));
    const validRemindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const cases = [
      [tools.get("reminder_create"), { projectId: "PRJ-1", remindAt: validRemindAt }],
      [tools.get("reminder_create"), { projectId: "PRJ-1", remindAt: validRemindAt, message: "x".repeat(501) }],
      [tools.get("reminder_create"), { projectId: "PRJ-1", message: "ok", remindAt: "next tuesday" }],
      [tools.get("reminder_create"), { projectId: "PRJ-1", message: "ok", remindAt: new Date().toISOString() }],
      [tools.get("reminder_create"), {
        projectId: "PRJ-1",
        message: "ok",
        remindAt: new Date(Date.now() + 30_000).toISOString(),
      }],
      [tools.get("reminder_create"), {
        projectId: "PRJ-1",
        message: "ok",
        remindAt: new Date(Date.now() + 181 * 24 * 60 * 60 * 1000).toISOString(),
      }],
      [tools.get("reminders_list"), {}],
    ];
    for (const [tool, args] of cases) {
      await assert.rejects(
        () => tool.execute(args, { signal: undefined }),
        (error) => error.code === "AI_EXECUTION_TOOL_INVALID_INPUT" || error.name === "ToolArgsError",
      );
    }
    assert.equal(requests, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool validates the execution environment itself", async () => {
  const port = 43210;
  await assert.rejects(
    () => applyToolModule(baseEnv(port, { capabilityId: "requirements-export" })),
    /unsupported company capability/,
  );
  await assert.rejects(
    () => applyToolModule(baseEnv(port, { capabilityId: "requirements-list", capabilityVersion: "9.9.9" })),
    /unsupported company capability/,
  );
  await assert.rejects(
    () => applyToolModule({ ...baseEnv(port), DSH_EXECUTION_TOKEN: "" }),
    /incomplete execution gateway environment/,
  );
  await assert.rejects(
    () => applyToolModule({ ...baseEnv(port), DSH_EXECUTION_GATEWAY_URL: `http://10.0.0.5:${port}` }),
    /IPv4 loopback/,
  );
  const absent = await applyToolModule(Object.fromEntries(Object.entries(baseEnv(port)).map(([key]) => [key, ""])));
  assert.equal(absent.tools.size, 0);
  assert.equal(absent.sections.length, 0);
});

test("company execution tool forwards ui_control directives without a project reference", async () => {
  const requests = [];
  const server = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const body = JSON.stringify({ data: { evidence: {}, result: { delivered: 2, ok: true } } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "ui-control" }));
    const result = await tools.get("ui_control").execute({ action: "setTheme", value: "dark" }, { signal: undefined });
    assert.deepEqual(result, { delivered: 2, ok: true });
    assert.deepEqual(requests, [{
      capabilityId: "ui-control",
      capabilityVersion: "1.0.0",
      directive: { kind: "theme", mode: "dark" },
    }]);

    const navigation = await tools.get("ui_control").execute({ action: "navigate", value: "  projects  " }, { signal: undefined });
    assert.equal(navigation.ok, true);
    assert.deepEqual(requests[1].directive, { kind: "navigate", page: "projects" });

    const toggles = await tools.get("ui_control").execute({ action: "openAiSidebar", value: "true" }, { signal: undefined });
    assert.equal(toggles.ok, true);
    assert.deepEqual(requests[2].directive, { kind: "openAiSidebar", open: true });

    const sizing = await tools.get("ui_control").execute({ action: "setContentPadding", value: "96" }, { signal: undefined });
    assert.equal(sizing.ok, true);
    assert.deepEqual(requests[3].directive, { kind: "contentPadding", value: 96 });

    // No ui_control request ever carries a projectId.
    assert.ok(requests.every((body) => body.projectId === undefined));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool rejects invalid ui_control actions and values locally", async () => {
  let requests = 0;
  const server = await listen(() => { requests += 1; });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "ui-control" }));
    const cases = [
      [tools.get("ui_control"), {}],
      [tools.get("ui_control"), { action: "setTheme" }],
      [tools.get("ui_control"), { action: "runShell", value: "dir" }],
      [tools.get("ui_control"), { action: "setTheme", value: "blue" }],
      [tools.get("ui_control"), { action: "setFontSize", value: "12" }],
      [tools.get("ui_control"), { action: "setFontSize", value: "big" }],
      [tools.get("ui_control"), { action: "setFontFamily", value: "comic-sans" }],
      [tools.get("ui_control"), { action: "setDensity", value: "cozy" }],
      [tools.get("ui_control"), { action: "setAccentColor", value: "blue" }],
      [tools.get("ui_control"), { action: "setContentPadding", value: "241" }],
      [tools.get("ui_control"), { action: "setReduceMotion", value: "maybe" }],
      [tools.get("ui_control"), { action: "openAiSidebar", value: "yes" }],
      [tools.get("ui_control"), { action: "navigate", value: "   " }],
    ];
    for (const [tool, args] of cases) {
      await assert.rejects(
        () => tool.execute(args, { signal: undefined }),
        (error) => error.code === "AI_EXECUTION_TOOL_INVALID_INPUT" || error.name === "ToolArgsError",
      );
    }
    assert.equal(requests, 0, "invalid ui_control input never reaches the gateway");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool forwards browser_control actions without a project reference", async () => {
  const requests = [];
  const server = await listen(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const body = JSON.stringify({ data: { evidence: {}, result: { ok: true, action: "open", url: "https://example.com/", title: "Example", text: "hi", screenshotKey: "AIC-1" } } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "browser-control" }));
    const tool = tools.get("browser_control");
    assert.ok(tool, "browser_control tool is registered");

    const result = await tool.execute({ action: "open", url: "https://example.com/", waitMs: "50" }, { signal: undefined });
    assert.equal(result.ok, true);
    assert.equal(result.screenshotKey, "AIC-1");
    assert.deepEqual(requests, [{
      capabilityId: "browser-control",
      capabilityVersion: "1.0.0",
      action: "open",
      url: "https://example.com/",
      waitMs: "50",
    }]);

    const typed = await tool.execute({ action: "type", selector: "#q", text: "hello" }, { signal: undefined });
    assert.equal(typed.ok, true);
    assert.deepEqual(requests[1], {
      capabilityId: "browser-control",
      capabilityVersion: "1.0.0",
      action: "type",
      selector: "#q",
      text: "hello",
    });

    const pressed = await tool.execute({ action: "press", selector: "#q", key: "Enter" }, { signal: undefined });
    assert.equal(pressed.ok, true);
    assert.deepEqual(requests[2], {
      capabilityId: "browser-control",
      capabilityVersion: "1.0.0",
      action: "press",
      selector: "#q",
      key: "Enter",
    });

    const clicked = await tool.execute({ action: "click", selector: "#submit" }, { signal: undefined });
    assert.equal(clicked.ok, true);
    assert.deepEqual(requests[3], {
      capabilityId: "browser-control",
      capabilityVersion: "1.0.0",
      action: "click",
      selector: "#submit",
    });

    // No browser_control request ever carries a projectId.
    assert.ok(requests.every((body) => body.projectId === undefined));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company execution tool rejects invalid browser_control input locally", async () => {
  let requests = 0;
  const server = await listen(() => { requests += 1; });
  try {
    const port = server.address().port;
    const { tools } = await applyToolModule(baseEnv(port, { capabilityId: "browser-control" }));
    const tool = tools.get("browser_control");
    const cases = [
      [tool, {}],
      [tool, { action: "explode" }],
      [tool, { action: "open" }],
      [tool, { action: "open", url: "   " }],
      [tool, { action: "click" }],
      [tool, { action: "type", selector: "#q" }],
      [tool, { action: "type", selector: "#q", text: "" }],
      [tool, { action: "press", selector: "#q" }],
    ];
    for (const [item, args] of cases) {
      await assert.rejects(
        () => item.execute(args, { signal: undefined }),
        (error) => error.code === "AI_EXECUTION_TOOL_INVALID_INPUT" || error.name === "ToolArgsError",
      );
    }
    assert.equal(requests, 0, "invalid browser_control input never reaches the gateway");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
