const assert = require("node:assert/strict");
const test = require("node:test");
const { createServerLifecycle } = require("../src/ops/serverLifecycle");

function createLifecycleFixture() {
  const calls = [];
  const listeners = { server: {}, wss: {} };
  const logs = [];
  const timer = { unref: () => calls.push("timer.unref") };
  const server = {
    close(callback) { calls.push("server.close"); callback(); },
    listen(port, callback) { calls.push(["server.listen", port]); callback(); },
    on(event, callback) { listeners.server[event] = callback; },
  };
  const wss = {
    clients: [{ close: (...args) => calls.push(["client.close", ...args]) }],
    close(callback) { calls.push("wss.close"); callback(); },
    on(event, callback) { listeners.wss[event] = callback; },
  };
  const lifecycle = createServerLifecycle({
    aiExecutionGateway: { close: async () => calls.push("gateway.close") },
    aiJobTimeoutMs: 300000,
    aiJobTimeoutSweepMs: 60000,
    aiJobsRepository: { id: "repository" },
    aiModelClient: { close: async () => calls.push("model.close") },
    audit: async () => {},
    clearIntervalFn: (value) => calls.push(["clearInterval", value]),
    clearTimeoutFn: (value) => calls.push(["clearTimeout", value]),
    closeDatabase: async () => calls.push("database.close"),
    logger: {
      error: (...args) => logs.push(["error", ...args]),
      log: (...args) => logs.push(["log", ...args]),
      warn: (...args) => logs.push(["warn", ...args]),
    },
    now: () => "2026-08-14T00:00:00.000Z",
    processExit: (code) => calls.push(["exit", code]),
    recoverPendingAiJobs: () => calls.push("recover"),
    server,
    serveWeb: true,
    setTimeoutFn: () => timer,
    startAiJobTimeoutMonitor: (options) => {
      calls.push(["timeoutMonitor", options]);
      return "monitor-timer";
    },
    wss,
  });
  return { calls, lifecycle, listeners, logs };
}

test("server lifecycle starts recovery and tears down resources in dependency order", async () => {
  const { calls, lifecycle, listeners, logs } = createLifecycleFixture();
  lifecycle.start(4010);

  assert.deepEqual(calls.slice(0, 2), [["server.listen", 4010], "recover"]);
  const monitorCall = calls.find((entry) => Array.isArray(entry) && entry[0] === "timeoutMonitor");
  assert.equal(typeof monitorCall[1].audit, "function");
  assert.deepEqual({
    actor: monitorCall[1].actor,
    repository: monitorCall[1].repository,
    sweepMs: monitorCall[1].sweepMs,
    timeoutMs: monitorCall[1].timeoutMs,
  }, {
    actor: { id: "system", name: "AI Worker Monitor" },
    repository: { id: "repository" },
    sweepMs: 60000,
    timeoutMs: 300000,
  });
  assert.equal(lifecycle.status().timeoutMonitorActive, true);
  assert.equal(typeof listeners.server.error, "function");
  assert.equal(logs.some((entry) => entry[1].includes("4010")), true);

  await lifecycle.shutdown("TEST");
  assert.equal(lifecycle.status().shuttingDown, true);
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "client.close"), true);
  assert.equal(calls.includes("wss.close"), true);
  assert.equal(calls.includes("server.close"), true);
  assert.equal(calls.includes("model.close"), true);
  assert.equal(calls.includes("gateway.close"), true);
  assert.equal(calls.includes("database.close"), true);
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "exit" && entry[1] === 0), true);
  await lifecycle.shutdown("SECOND_CALL");
  assert.equal(calls.filter((entry) => Array.isArray(entry) && entry[0] === "exit").length, 1);
});

test("server lifecycle handles port conflicts and process signals through the same controller", async () => {
  const { calls, lifecycle, listeners, logs } = createLifecycleFixture();
  lifecycle.start(4011);
  listeners.server.error({ code: "EADDRINUSE" });
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "exit" && entry[1] === 1), true);
  assert.match(logs.find((entry) => entry[0] === "error")[1], /4011/);

  const signalHandlers = {};
  lifecycle.installSignalHandlers({ on: (signal, handler) => { signalHandlers[signal] = handler; } });
  signalHandlers.SIGTERM();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "exit" && entry[1] === 0), true);
});
