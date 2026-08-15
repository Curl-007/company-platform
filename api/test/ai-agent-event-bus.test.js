const assert = require("node:assert/strict");
const test = require("node:test");
const { NOOP_AGENT_EVENT_BUS, createAgentEventBus } = require("../src/modules/ai/agentEventBus");

test("agent event bus delivers each message to every subscriber synchronously", () => {
  const bus = createAgentEventBus();
  const receivedA = [];
  const receivedB = [];
  const unsubscribeA = bus.subscribe((message) => receivedA.push(message));
  bus.subscribe((message) => receivedB.push(message));

  const message = { event: { seq: 1, type: "user/message" }, invocationId: "AIC-1", projectId: "PRJ-1", userId: "USR-1" };
  bus.publish(message);

  assert.deepEqual(receivedA, [message]);
  assert.deepEqual(receivedB, [message]);
  assert.equal(bus.status().listeners, 2);
  assert.equal(receivedA[0] === message, true, "the raw dsh event object is passed by reference");

  unsubscribeA();
  bus.publish(message);
  assert.deepEqual(receivedA, [message], "an unsubscribed listener receives nothing further");
  assert.deepEqual(receivedB, [message, message]);
  assert.equal(bus.status().listeners, 1);
});

test("agent event bus isolates throwing listeners", () => {
  const bus = createAgentEventBus();
  const received = [];
  bus.subscribe(() => {
    throw new Error("listener one exploded");
  });
  bus.subscribe((message) => received.push(message));

  const message = { event: { type: "turn/end" }, invocationId: "AIC-2", projectId: "PRJ-1", userId: "USR-1" };
  assert.doesNotThrow(() => bus.publish(message));
  assert.doesNotThrow(() => bus.publish(null));
  assert.doesNotThrow(() => bus.publish(undefined));
  assert.deepEqual(received, [message], "the healthy listener still receives every message");
});

test("agent event bus ignores non-function subscribers and double unsubscribe", () => {
  const bus = createAgentEventBus();
  const unsubscribe = bus.subscribe(null);
  assert.equal(typeof unsubscribe, "function");
  assert.doesNotThrow(() => unsubscribe());
  assert.equal(bus.status().listeners, 0);

  const listener = () => {};
  const remove = bus.subscribe(listener);
  remove();
  remove();
  assert.equal(bus.status().listeners, 0);
});

test("the noop agent event bus keeps non-streaming deployments silent", () => {
  const received = [];
  const unsubscribe = NOOP_AGENT_EVENT_BUS.subscribe((message) => received.push(message));
  NOOP_AGENT_EVENT_BUS.publish({ event: { type: "turn/end" }, invocationId: "AIC-3" });
  assert.deepEqual(received, []);
  assert.deepEqual(NOOP_AGENT_EVENT_BUS.status(), { listeners: 0 });
  assert.doesNotThrow(() => unsubscribe());
});
