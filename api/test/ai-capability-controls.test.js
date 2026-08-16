const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AI_CAPABILITY_CONTROLS_SETTING_KEY,
  createAiCapabilityControlStore,
} = require("../src/modules/ai/capabilityControls");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");

function createControlStore({ initialValue = JSON.stringify({}), synchronizeFirstReads = false } = {}) {
  let setting = initialValue === null ? null : {
    updated_at: "2026-08-14T00:00:00.000Z",
    value: initialValue,
  };
  let readCount = 0;
  let releaseFirstReads;
  const firstReadsReady = new Promise((resolve) => { releaseFirstReads = resolve; });
  let timestamp = Date.parse("2026-08-14T00:00:00.000Z");
  const store = createAiCapabilityControlStore({
    json: JSON.stringify,
    now: () => new Date(timestamp += 1_000).toISOString(),
    registry: createCapabilityRegistry(),
    row: async () => {
      const observed = setting ? { ...setting } : null;
      if (synchronizeFirstReads && readCount < 2) {
        readCount += 1;
        if (readCount === 2) releaseFirstReads();
        await firstReadsReady;
      }
      return observed;
    },
    run: async (sql, params) => {
      if (sql.startsWith("UPDATE app_settings")) {
        if (!setting || setting.value !== params.expectedValue) return { changes: 0 };
        setting = { updated_at: params.updatedAt, value: params.value };
        return { changes: 1 };
      }
      if (sql.startsWith("INSERT OR IGNORE")) {
        if (setting) return { changes: 0 };
        setting = { updated_at: params.updatedAt, value: params.value };
        return { changes: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  return {
    setting: () => setting,
    store,
  };
}

test("capability control updates retain independent concurrent changes", async () => {
  const { setting, store } = createControlStore({ synchronizeFirstReads: true });

  await Promise.all([
    store.update("project-snapshot", { enabled: false }, { id: "USR-1" }),
    store.update("project-snapshot", { reason: "maintenance" }, { id: "USR-2" }),
  ]);

  const control = await store.get("project-snapshot");
  assert.equal(control.enabled, false);
  assert.equal(control.reason, "maintenance");
  assert.equal(JSON.parse(setting().value)["project-snapshot"].enabled, false);
});

test("corrupt persisted capability controls fail closed", async () => {
  const { store } = createControlStore({ initialValue: "{not-json" });

  await assert.rejects(
    () => store.get("project-snapshot"),
    { code: "AI_CAPABILITY_CONTROL_STORE_CORRUPT", status: 503 },
  );
});

test("control store uses the dedicated application setting key", () => {
  assert.equal(AI_CAPABILITY_CONTROLS_SETTING_KEY, "ai_capability_controls");
});

test("approved DSH capabilities are enabled by default", async () => {
  const { store } = createControlStore();
  const controls = await store.list();

  assert.ok(controls.length > 0);
  assert.ok(controls
    .filter(({ manifest }) => manifest.status === "approved")
    .every(({ control }) => control.enabled));
});
