const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const PLUGIN_URL = pathToFileURL(
  path.resolve(__dirname, "..", "config", "harness", "company-projections.mjs"),
).href;

function event(type, data, seq, time) {
  return { type, seq, time, data };
}

function fold(definition, events) {
  let state = definition.init();
  for (const item of events) state = definition.apply(state, item);
  return state;
}

test("company-projections registers the three company units on the session projection registry", async () => {
  const plugin = await import(PLUGIN_URL);
  assert.equal(plugin.name, "company-projections");
  assert.deepEqual(plugin.inject, ["sessionProjections"]);
  const registered = [];
  plugin.apply({ sessionProjections: { register: (definition) => registered.push(definition) } });
  assert.deepEqual(registered.map((definition) => definition.key), [
    "company.token-usage",
    "company.tool-calls",
    "company.turn-stats",
  ]);
  for (const definition of registered) {
    assert.equal(Number.isSafeInteger(definition.stateVersion), true);
    assert.equal(typeof definition.schema.parse, "function");
  }
});

test("company.token-usage starts empty, ignores unrelated events, and accumulates reported usage", async () => {
  const { tokenUsageProjection } = await import(PLUGIN_URL);
  const initial = tokenUsageProjection.init();
  assert.deepEqual(tokenUsageProjection.view(initial), {
    completionTokens: 0,
    promptTokens: 0,
    requests: 0,
    totalTokens: 0,
  });
  tokenUsageProjection.schema.parse(tokenUsageProjection.view(initial));

  const unrelated = [
    event("turn/start", { turn: 1 }, 0, 1000),
    event("assistant/chunk", { turn: 1, step: 1, chunk: {} }, 1, 1001),
    event("tool/call", { turn: 1, step: 1, callId: "call-1", name: "project_snapshot", arguments: "{}" }, 2, 1002),
    event("turn/end", { turn: 1, reason: { kind: "completed" } }, 3, 1003),
  ];
  for (const item of unrelated) {
    assert.equal(tokenUsageProjection.apply(initial, item), initial);
  }

  const state = fold(tokenUsageProjection, [
    event("assistant/message", { turn: 1, step: 1, message: {}, usage: { inputTokens: 12, outputTokens: 8 } }, 4, 1004),
    event("assistant/message", { turn: 1, step: 2, message: {}, usage: { inputTokens: 5, outputTokens: 5 } }, 5, 1005),
    event("assistant/message", { turn: 2, step: 1, message: {} }, 6, 1006),
    event("assistant/message", { turn: 2, step: 2, message: {}, usage: { inputTokens: -3, outputTokens: 4 } }, 7, 1007),
  ]);
  assert.deepEqual(tokenUsageProjection.view(state), {
    completionTokens: 17,
    promptTokens: 17,
    requests: 4,
    totalTokens: 34,
  });
  tokenUsageProjection.schema.parse(tokenUsageProjection.view(state));
});

test("company.tool-calls counts per tool name and keeps only the trailing dispatch timestamps", async () => {
  const { toolCallsProjection, RECENT_TOOL_CALL_LIMIT } = await import(PLUGIN_URL);
  const initial = toolCallsProjection.init();
  assert.deepEqual(toolCallsProjection.view(initial), { counts: {}, recent: [] });
  toolCallsProjection.schema.parse(toolCallsProjection.view(initial));

  const unrelated = [
    event("turn/start", { turn: 1 }, 0, 1000),
    event("assistant/message", { turn: 1, step: 1, message: {}, usage: { inputTokens: 1, outputTokens: 1 } }, 1, 1001),
    event("tool/result", { turn: 1, step: 1, message: { source: { callId: "call-9" } } }, 2, 1002),
    event("turn/end", { turn: 1, reason: { kind: "completed" } }, 3, 1003),
  ];
  for (const item of unrelated) {
    assert.equal(toolCallsProjection.apply(initial, item), initial);
  }

  const calls = [];
  for (let index = 0; index < 7; index += 1) {
    calls.push(event("tool/call", {
      arguments: "{}",
      callId: `call-${index}`,
      name: index % 2 === 0 ? "project_snapshot" : "web_search",
      step: 1,
      turn: 1,
    }, index, 2000 + index));
  }
  const state = fold(toolCallsProjection, calls);
  assert.deepEqual(toolCallsProjection.view(state), {
    counts: { project_snapshot: 4, web_search: 3 },
    recent: calls.slice(-RECENT_TOOL_CALL_LIMIT).map((item) => ({ name: item.data.name, time: item.time })),
  });
  assert.equal(toolCallsProjection.view(state).recent.length, RECENT_TOOL_CALL_LIMIT);
  toolCallsProjection.schema.parse(toolCallsProjection.view(state));
});

test("company.tool-calls treats a prototype property name as unseen instead of poisoning the count", async () => {
  const { toolCallsProjection } = await import(PLUGIN_URL);
  const state = fold(toolCallsProjection, [
    event("tool/call", { arguments: "{}", callId: "call-1", name: "constructor", step: 1, turn: 1 }, 0, 1000),
    event("tool/call", { arguments: "{}", callId: "call-2", name: "constructor", step: 1, turn: 1 }, 1, 1001),
  ]);
  assert.deepEqual(toolCallsProjection.view(state), {
    counts: { constructor: 2 },
    recent: [
      { name: "constructor", time: 1000 },
      { name: "constructor", time: 1001 },
    ],
  });
});

test("company.turn-stats counts turn ends by reason.kind with completed/error rollups", async () => {
  const { turnStatsProjection } = await import(PLUGIN_URL);
  const initial = turnStatsProjection.init();
  assert.deepEqual(turnStatsProjection.view(initial), { byKind: {}, failed: 0, succeeded: 0, total: 0 });
  turnStatsProjection.schema.parse(turnStatsProjection.view(initial));

  const unrelated = [
    event("turn/start", { turn: 1 }, 0, 1000),
    event("step/start", { turn: 1, step: 1 }, 1, 1001),
    event("assistant/message", { turn: 1, step: 1, message: {} }, 2, 1002),
    event("tool/result", { turn: 1, step: 1, message: { source: { callId: "call-1" } } }, 3, 1003),
  ];
  for (const item of unrelated) {
    assert.equal(turnStatsProjection.apply(initial, item), initial);
  }

  const state = fold(turnStatsProjection, [
    event("turn/end", { turn: 1, reason: { kind: "completed" } }, 4, 1004),
    event("turn/end", { turn: 2, reason: { kind: "error", error: { message: "boom", code: "UNKNOWN" } } }, 5, 1005),
    event("turn/end", { turn: 3, reason: { kind: "aborted", reason: { kind: "user" } } }, 6, 1006),
    event("turn/end", { turn: 4, reason: { kind: "max-tokens" } }, 7, 1007),
    event("turn/end", { turn: 5 }, 8, 1008),
  ]);
  assert.deepEqual(turnStatsProjection.view(state), {
    byKind: { completed: 1, error: 1, aborted: 1, "max-tokens": 1, unknown: 1 },
    failed: 1,
    succeeded: 1,
    total: 5,
  });
  turnStatsProjection.schema.parse(turnStatsProjection.view(state));
});

test("all three units fold one realistic committed sequence into consistent whole values", async () => {
  const plugin = await import(PLUGIN_URL);
  const events = [
    event("turn/start", { turn: 1 }, 0, 1000),
    event("request/header", { header: {}, reason: "initial" }, 1, 1001),
    event("assistant/chunk", { turn: 1, step: 1, chunk: { type: "text", text: "ok" } }, 2, 1002),
    event("assistant/message", { turn: 1, step: 1, message: {}, usage: { inputTokens: 12, outputTokens: 8 } }, 3, 1004),
    event("tool/call", { arguments: "{}", callId: "call-1", name: "project_snapshot", step: 1, turn: 1 }, 4, 1005),
    event("tool/result", { turn: 1, step: 1, message: { source: { callId: "call-1", name: "project_snapshot" } } }, 5, 1100),
    event("turn/end", { turn: 1, reason: { kind: "completed" } }, 6, 1101),
  ];
  for (const definition of [plugin.tokenUsageProjection, plugin.toolCallsProjection, plugin.turnStatsProjection]) {
    definition.schema.parse(definition.view(fold(definition, events)));
  }
  assert.deepEqual(plugin.tokenUsageProjection.view(fold(plugin.tokenUsageProjection, events)), {
    completionTokens: 8,
    promptTokens: 12,
    requests: 1,
    totalTokens: 20,
  });
  assert.deepEqual(plugin.toolCallsProjection.view(fold(plugin.toolCallsProjection, events)), {
    counts: { project_snapshot: 1 },
    recent: [{ name: "project_snapshot", time: 1005 }],
  });
  assert.deepEqual(plugin.turnStatsProjection.view(fold(plugin.turnStatsProjection, events)), {
    byKind: { completed: 1 },
    failed: 0,
    succeeded: 1,
    total: 1,
  });
});
