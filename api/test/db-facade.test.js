const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuditService } = require("../src/db/audit");
const { createBurndownService } = require("../src/db/burndown");
const { createMappers } = require("../src/db/mappers");

function parse(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

test("extracted mappers preserve db facade normalization", () => {
  const { mapProduct, mapTask, mapUser } = createMappers({ parse });

  assert.deepEqual(mapProduct({
    id: "PROD-1",
    name: "Product",
    owner: "Owner",
    version: "1.0",
    stage: "beta",
    image_url: "[\"https://example.test/a.png\", \"\"]",
    modules: "[\"Core\"]",
    hardware_info: "{\"cpu\":\"x86\"}",
    system_info: "",
    application_info: null,
    hardware_metrics: "[]",
    system_metrics: "[]",
    app_metrics: "[]",
    roadmap: "[]",
  }), {
    id: "PROD-1",
    name: "Product",
    owner: "Owner",
    version: "1.0",
    stage: "beta",
    description: "",
    imageUrl: "https://example.test/a.png",
    imageUrls: ["https://example.test/a.png"],
    systemName: "",
    systemVersion: "",
    applicationVersion: "",
    modules: ["Core"],
    hardwareInfo: { cpu: "x86" },
    systemInfo: {},
    applicationInfo: {},
    hardwareMetrics: [],
    systemMetrics: [],
    appMetrics: [],
    roadmap: [],
  });
  assert.equal(mapTask({ id: "TASK-1", remaining_hours: null }).remainingHours, 0);
  assert.equal(mapUser(null), null);
});

test("extracted audit service validates project scope and redacts snapshots before writing", async () => {
  const writes = [];
  const audit = createAuditService({
    row: async (sql, params) => sql.includes("FROM projects") && params.id === "PRJ-1" ? { id: "PRJ-1" } : undefined,
    insert: async (table, value) => writes.push({ table, value }),
    json: JSON.stringify,
    now: () => "2026-08-14T01:02:03.000Z",
  });

  await audit.audit(
    { id: "USR-1", name: "Admin" },
    "project.update",
    "project",
    "PRJ-1",
    { password_hash: "hash" },
    { nested: { apiKey: "secret" } },
    "127.0.0.1",
    { scopeType: "project", projectId: "PRJ-1" },
  );

  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "audit_logs");
  assert.match(writes[0].value.id, /^AUD-/);
  assert.equal(writes[0].value.scope_type, "project");
  assert.equal(writes[0].value.project_id, "PRJ-1");
  assert.deepEqual(JSON.parse(writes[0].value.before_json), { password_hash: "[REDACTED]" });
  assert.deepEqual(JSON.parse(writes[0].value.after_json), { nested: { apiKey: "[REDACTED]" } });
});

test("extracted burndown service keeps the daily natural-key upsert contract", async () => {
  const upserts = [];
  const service = createBurndownService({
    row: async () => ({ id: "SPR-1", start_date: "2026-08-13", end_date: "2026-08-15" }),
    rows: async (sql) => {
      if (sql.includes("remaining_hours AS h")) return [{ h: 3 }, { h: "2" }];
      if (sql.includes("FROM tasks")) return [{ estimated_hours: 5, remaining_hours: 3 }, { estimated_hours: 8, remaining_hours: 2 }];
      return [{ date: "2026-08-13", remaining_hours: 13 }];
    },
    upsert: async (...args) => upserts.push(args),
    now: () => "2026-08-14T09:00:00.000Z",
  });

  await service.recordBurndownSnapshot("SPR-1");
  assert.deepEqual(upserts, [[
    "burndown_snapshots",
    {
      id: "BURN-SPR-1-2026-08-14",
      sprint_id: "SPR-1",
      date: "2026-08-14",
      remaining_hours: 5,
      created_at: "2026-08-14T09:00:00.000Z",
    },
    {
      conflictTarget: ["sprint_id", "date"],
      excludeUpdateColumns: ["id", "created_at"],
    },
  ]]);

  const chart = await service.buildSprintBurndown("SPR-1");
  assert.deepEqual(chart.ideal, [
    { date: "2026-08-13", ideal: 13 },
    { date: "2026-08-14", ideal: 6.5 },
    { date: "2026-08-15", ideal: 0 },
  ]);
  assert.deepEqual(chart.actual, [
    { date: "2026-08-13", remaining: 13 },
    { date: "2026-08-14", remaining: 5 },
  ]);
});

test("db facade continues to expose extracted public functions", () => {
  const database = require("../db");
  for (const name of [
    "initDb",
    "closeDatabase",
    "audit",
    "resolveAuditScope",
    "sanitizeAuditValue",
    "recordBurndownSnapshot",
    "buildSprintBurndown",
    "mapProject",
    "mapRequirement",
    "mapDocument",
    "mapTask",
    "mapSprint",
    "mapDefect",
    "mapTestCase",
    "mapTestRun",
    "mapUser",
    "mapProduct",
    "mapBuild",
    "mapRelease",
  ]) {
    assert.equal(typeof database[name], "function", `${name} should remain a db facade export`);
  }
});
