// In-process fan-out for live dsh session events. The harness runtime calls
// publish() with one message per SDK `session.event` notification; listeners
// (the WebSocket agent bridge, tests) receive it synchronously. A throwing
// listener is isolated: dispatch continues to the remaining listeners and the
// publishing inference run is never affected.

function createAgentEventBus() {
  const listeners = new Set();

  return {
    publish(message) {
      if (!message || typeof message !== "object") return;
      for (const listener of [...listeners]) {
        try {
          listener(message);
        } catch {
          // A broken subscriber must not break dispatch or the inference run.
        }
      }
    },
    status: () => ({ listeners: listeners.size }),
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Default dependency for service factories that can run without streaming;
// keeps existing tests and embedded usages unchanged when no bus is injected.
const NOOP_AGENT_EVENT_BUS = Object.freeze({
  publish: () => {},
  status: () => ({ listeners: 0 }),
  subscribe: () => () => {},
});

module.exports = {
  NOOP_AGENT_EVENT_BUS,
  createAgentEventBus,
};
