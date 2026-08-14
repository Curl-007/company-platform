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
  const original = Object.fromEntries(EXECUTION_ENV_KEYS.map((key) => [key, process.env[key]]));
  let registered;
  const sections = [];
  try {
    const port = server.address().port;
    Object.assign(process.env, {
      DSH_EXECUTION_CAPABILITY_ID: "project-snapshot",
      DSH_EXECUTION_CAPABILITY_VERSION: "1.0.0",
      DSH_EXECUTION_GATEWAY_URL: `http://127.0.0.1:${port}`,
      DSH_EXECUTION_PROJECT_ID: "PRJ-1",
      DSH_EXECUTION_TOKEN: "scoped-tool-token",
    });
    const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "config", "harness", "company-execution-tool.mjs")).href;
    const executionTool = await import(moduleUrl);
    executionTool.apply({
      systemPrompt: { section: (section) => sections.push(section) },
      tools: { register: (tool) => { registered = tool; } },
    });

    assert.equal(registered.name, "project_snapshot");
    assert.equal(registered.parameters.properties.projectId.type, "string");
    assert.equal(sections[0].name, "company:execution-policy");
    const snapshot = await registered.execute({ projectId: "PRJ-1" }, { signal: undefined });
    assert.equal(snapshot.project.id, "PRJ-1");
    assert.deepEqual(requests, [{
      authorization: "Bearer scoped-tool-token",
      body: { projectId: "PRJ-1" },
      method: "POST",
      url: "/v1/project-snapshot",
    }]);

    await assert.rejects(
      () => registered.execute({ projectId: "PRJ-2" }, { signal: undefined }),
      /restricted to the invocation project/,
    );
    assert.equal(requests.length, 1);
  } finally {
    for (const key of EXECUTION_ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await new Promise((resolve) => server.close(resolve));
  }
});
