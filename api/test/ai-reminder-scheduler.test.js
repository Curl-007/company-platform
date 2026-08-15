const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createAccess } = require("../src/db/access");
const { createDatabaseBootstrap } = require("../src/db/bootstrap");
const { CORE_TABLES } = require("../src/db/migrationPreflight");
const { applyCompatibilityColumns, inspectSqliteSchema } = require("../src/db/sqliteSchema");
const {
  DEFAULT_SWEEP_INTERVAL_MS,
  REMINDER_BUCKET,
  createAiReminderRepository,
  createDynamicCenterReminderDelivery,
  createReminderScheduler,
} = require("../src/modules/ai/reminderScheduler");
const reminderMigration = require("../migrations/20260814_27_ai_reminders");

function createReminderDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-ai-reminders-"));
  const db = new DatabaseSync(":memory:");
  const runtime = {
    dialect: "sqlite",
    connection: db,
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    close: () => db.close(),
  };
  const access = createAccess(runtime);
  const bootstrap = createDatabaseBootstrap({
    applyCompatibilityColumns,
    coreTables: CORE_TABLES,
    db,
    databaseRuntime: runtime,
    dialect: "sqlite",
    exec: access._sync.exec,
    fs,
    inspectSqliteSchema,
    migrationsDir: path.join(__dirname, "..", "migrations"),
    now: () => "2026-08-14T00:00:00.000Z",
    runSync: access._sync.run,
    seed: () => undefined,
    storageDir: path.join(directory, "storage"),
  });
  bootstrap.initDbSqlite();
  return {
    access,
    cleanup: () => {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
    db,
  };
}

function reminderRow(id, { projectId = "PRJ-1", remindAt = "2026-08-14T01:00:00.000Z", status = "pending", message = `Reminder ${id}`, invocationId = null, createdAt = "2026-08-14T00:00:00.000Z" } = {}) {
  return {
    id,
    project_id: projectId,
    actor_id: "USR-AGENT",
    message,
    remind_at: remindAt,
    status,
    invocation_id: invocationId,
    created_at: createdAt,
    sent_at: null,
  };
}

test("ai_reminders migration is ledger-applied, idempotent, and carries the delivery indexes", (t) => {
  const { cleanup, db } = createReminderDatabase();
  t.after(cleanup);

  assert.equal(reminderMigration.id, "20260814_27_ai_reminders");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = @id").get({ id: reminderMigration.id }).count,
    1,
  );
  const columns = db.prepare("PRAGMA table_info(ai_reminders)").all().map((column) => column.name);
  assert.deepEqual(columns, [
    "id", "project_id", "actor_id", "message", "remind_at", "status", "invocation_id", "created_at", "sent_at",
  ]);
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ai_reminders' AND name LIKE 'idx_ai_reminders_%'",
  ).all().map((index) => index.name).sort();
  assert.deepEqual(indexes, ["idx_ai_reminders_project", "idx_ai_reminders_status_remind_at"]);

  db.prepare(`
    INSERT INTO ai_reminders (id, project_id, actor_id, message, remind_at, created_at)
    VALUES ('REM-DEFAULTS', 'PRJ-1', 'USR-1', 'defaults', '2026-08-14T01:00:00.000Z', '2026-08-14T00:00:00.000Z')
  `).run();
  const defaults = db.prepare("SELECT status, sent_at FROM ai_reminders WHERE id = 'REM-DEFAULTS'").get();
  assert.equal(defaults.status, "pending");
  assert.equal(defaults.sent_at, null);

  reminderMigration.up({ db });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_reminders").get().count, 1);
});

test("reminder repository returns pending due rows oldest-first and transitions each row at most once", async (t) => {
  const { access, cleanup } = createReminderDatabase();
  t.after(cleanup);
  const repository = createAiReminderRepository({ insert: access.insert, rows: access.rows, run: access.run });

  await repository.create(reminderRow("REM-DUE-1", { remindAt: "2026-08-14T00:30:00.000Z" }));
  await repository.create(reminderRow("REM-DUE-2", { remindAt: "2026-08-14T00:15:00.000Z" }));
  await repository.create(reminderRow("REM-FUTURE", { remindAt: "2026-08-15T00:00:00.000Z" }));
  await repository.create(reminderRow("REM-SENT", { remindAt: "2026-08-14T00:05:00.000Z", status: "sent" }));

  const due = await repository.listDue("2026-08-14T01:00:00.000Z");
  assert.deepEqual(due.map((row) => row.id), ["REM-DUE-2", "REM-DUE-1"]);

  assert.equal(await repository.markSent("REM-DUE-2", "2026-08-14T01:00:01.000Z"), true);
  assert.equal(await repository.markSent("REM-DUE-2", "2026-08-14T01:00:02.000Z"), false);
  const stored = await access.row("SELECT status, sent_at FROM ai_reminders WHERE id = 'REM-DUE-2'");
  assert.equal(stored.status, "sent");
  assert.equal(stored.sent_at, "2026-08-14T01:00:01.000Z");
});

function schedulerHarness() {
  const { access, cleanup } = createReminderDatabase();
  const repository = createAiReminderRepository({ insert: access.insert, rows: access.rows, run: access.run });
  const delivered = [];
  const failures = [];
  const logger = { warn: (...args) => failures.push(args.join(" ")) };
  return { access, cleanup, delivered, failures, logger, repository };
}

test("reminder scheduler sweep delivers due reminders once, leaves future rows pending, and is idempotent", async (t) => {
  const harness = schedulerHarness();
  t.after(harness.cleanup);
  let clock = "2026-08-14T01:00:00.000Z";
  const scheduler = createReminderScheduler({
    repository: harness.repository,
    deliver: async (reminder) => { harness.delivered.push(reminder.id); },
    now: () => clock,
    logger: harness.logger,
  });

  await harness.repository.create(reminderRow("REM-DUE", { remindAt: "2026-08-14T00:59:00.000Z" }));
  await harness.repository.create(reminderRow("REM-EXACT-NOW", { remindAt: "2026-08-14T01:00:00.000Z" }));
  await harness.repository.create(reminderRow("REM-LATER", { remindAt: "2026-08-14T01:00:00.001Z" }));

  assert.equal(await scheduler.sweep(), 2);
  assert.deepEqual(harness.delivered, ["REM-DUE", "REM-EXACT-NOW"]);
  const statuses = await harness.access.rows("SELECT id, status, sent_at FROM ai_reminders ORDER BY id");
  assert.deepEqual(
    statuses.map((row) => [row.id, row.status, Boolean(row.sent_at)]),
    [
      ["REM-DUE", "sent", true],
      ["REM-EXACT-NOW", "sent", true],
      ["REM-LATER", "pending", false],
    ],
  );

  // Repeated sweeps are no-ops: rows already sent never re-enter the batch.
  assert.equal(await scheduler.sweep(), 0);
  assert.deepEqual(harness.delivered, ["REM-DUE", "REM-EXACT-NOW"]);

  // Time passes: the remaining reminder becomes due exactly once.
  clock = "2026-08-14T02:00:00.000Z";
  assert.equal(await scheduler.sweep(), 1);
  assert.deepEqual(harness.delivered, ["REM-DUE", "REM-EXACT-NOW", "REM-LATER"]);
});

test("reminder scheduler keeps a failed delivery pending and continues the batch", async (t) => {
  const harness = schedulerHarness();
  t.after(harness.cleanup);
  const scheduler = createReminderScheduler({
    repository: harness.repository,
    deliver: async (reminder) => {
      if (reminder.id === "REM-BROKEN") throw new Error("delivery channel down");
      harness.delivered.push(reminder.id);
    },
    now: () => "2026-08-14T01:00:00.000Z",
    logger: harness.logger,
  });

  await harness.repository.create(reminderRow("REM-BROKEN", { remindAt: "2026-08-14T00:30:00.000Z" }));
  await harness.repository.create(reminderRow("REM-OK", { remindAt: "2026-08-14T00:40:00.000Z" }));

  assert.equal(await scheduler.sweep(), 1);
  assert.deepEqual(harness.delivered, ["REM-OK"]);
  assert.ok(harness.failures.some((line) => line.includes("REM-BROKEN") && line.includes("delivery channel down")));
  const broken = await harness.access.row("SELECT status, sent_at FROM ai_reminders WHERE id = 'REM-BROKEN'");
  assert.equal(broken.status, "pending");
  assert.equal(broken.sent_at, null);
});

test("reminder scheduler recovers reminders that came due across a simulated restart", async (t) => {
  const harness = schedulerHarness();
  t.after(harness.cleanup);
  let clock = "2026-08-14T12:00:00.000Z";
  const first = createReminderScheduler({
    repository: harness.repository,
    deliver: async (reminder) => { harness.delivered.push(`first:${reminder.id}`); },
    now: () => clock,
    logger: harness.logger,
  });
  await harness.repository.create(reminderRow("REM-BEFORE-RESTART", { remindAt: "2026-08-14T12:05:00.000Z" }));
  assert.equal(await first.sweep(), 0);
  first.stop();

  // Process restarts later; the reminder became due while it was down.
  clock = "2026-08-14T13:00:00.000Z";
  const second = createReminderScheduler({
    repository: harness.repository,
    deliver: async (reminder) => { harness.delivered.push(`second:${reminder.id}`); },
    now: () => clock,
    logger: harness.logger,
  });
  assert.equal(await second.sweep(), 1);
  assert.equal(await second.sweep(), 0);
  assert.deepEqual(harness.delivered, ["second:REM-BEFORE-RESTART"]);
  const stored = await harness.access.row("SELECT status, sent_at FROM ai_reminders WHERE id = 'REM-BEFORE-RESTART'");
  assert.equal(stored.status, "sent");
  assert.equal(stored.sent_at, "2026-08-14T13:00:00.000Z");
});

test("reminder scheduler start/stop drives the interval and the immediate recovery sweep", async (t) => {
  const harness = schedulerHarness();
  t.after(harness.cleanup);
  const timers = [];
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  t.mock.method(global, "setInterval", (handler, interval) => {
    const timer = { handler, interval };
    timers.push(timer);
    return timer;
  });
  t.mock.method(global, "clearInterval", (timer) => {
    const index = timers.indexOf(timer);
    if (index >= 0) timers.splice(index, 1);
  });

  try {
    await harness.repository.create(reminderRow("REM-OVERDUE", { remindAt: "2026-08-14T00:30:00.000Z" }));
    const scheduler = createReminderScheduler({
      repository: harness.repository,
      deliver: async (reminder) => { harness.delivered.push(reminder.id); },
      now: () => "2026-08-14T01:00:00.000Z",
      intervalMs: 5_000,
      logger: harness.logger,
    });
    scheduler.start();
    assert.equal(timers.length, 1);
    assert.equal(timers[0].interval, 5_000);
    // The immediate recovery sweep is fire-and-forget: flush the microtask
    // queue before asserting it delivered the overdue row without a tick.
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(harness.delivered, ["REM-OVERDUE"]);

    scheduler.stop();
    assert.equal(timers.length, 0);
    scheduler.stop();
    assert.equal(timers.length, 0);
  } finally {
    t.mock.restoreAll();
    void originalSetInterval;
    void originalClearInterval;
  }
});

test("dynamic-center reminder delivery writes one objects row per reminder", async (t) => {
  const { access, cleanup } = createReminderDatabase();
  t.after(cleanup);
  let counter = 0;
  const nextId = async (prefix) => `${prefix}-${(counter += 1)}`;
  const deliver = createDynamicCenterReminderDelivery({
    insert: access.insert,
    nextId,
    now: () => "2026-08-14T01:00:05.000Z",
  });

  const result = await deliver({
    id: "REM-1",
    project_id: "PRJ-1",
    actor_id: "USR-AGENT",
    message: "Review the release checklist",
    remind_at: "2026-08-14T01:00:00.000Z",
    invocation_id: "AIC-42",
    status: "pending",
    created_at: "2026-08-14T00:00:00.000Z",
  });
  assert.equal(result.objectId, "OBJ-1");

  const stored = await access.row("SELECT * FROM objects WHERE id = 'OBJ-1'");
  assert.equal(stored.bucket, REMINDER_BUCKET);
  assert.equal(stored.storage_key, "ai-reminders/PRJ-1/REM-1");
  assert.equal(stored.mime_type, "application/json");
  assert.equal(stored.created_by, "USR-AGENT");
  assert.equal(stored.created_at, "2026-08-14T01:00:05.000Z");
  const expectedPayload = JSON.stringify({
    type: "agent.reminder",
    reminderId: "REM-1",
    projectId: "PRJ-1",
    message: "Review the release checklist",
    remindAt: "2026-08-14T01:00:00.000Z",
    invocationId: "AIC-42",
  });
  assert.equal(stored.size, Buffer.byteLength(expectedPayload, "utf8"));
  assert.ok(stored.original_name.includes("REM-1"));

  assert.equal((await access.rows("SELECT id FROM objects")).length, 1);
});

test("full sweep with dynamic-center delivery lands the reminder in the objects table", async (t) => {
  const { access, cleanup } = createReminderDatabase();
  t.after(cleanup);
  const repository = createAiReminderRepository({ insert: access.insert, rows: access.rows, run: access.run });
  let counter = 0;
  const scheduler = createReminderScheduler({
    repository,
    deliver: createDynamicCenterReminderDelivery({
      insert: access.insert,
      nextId: async (prefix) => `${prefix}-${(counter += 1)}`,
      now: () => "2026-08-14T01:00:00.000Z",
    }),
    now: () => "2026-08-14T01:00:00.000Z",
  });
  await repository.create(reminderRow("REM-LIVE", { remindAt: "2026-08-14T00:45:00.000Z", invocationId: "AIC-7" }));

  assert.equal(await scheduler.sweep(), 1);
  const objectRow = await access.row("SELECT * FROM objects WHERE bucket = @bucket", { bucket: REMINDER_BUCKET });
  assert.equal(objectRow.storage_key, "ai-reminders/PRJ-1/REM-LIVE");
  assert.equal(objectRow.created_by, "USR-AGENT");
  const reminder = await access.row("SELECT status, sent_at FROM ai_reminders WHERE id = 'REM-LIVE'");
  assert.equal(reminder.status, "sent");
  assert.equal(reminder.sent_at, "2026-08-14T01:00:00.000Z");
  assert.equal(DEFAULT_SWEEP_INTERVAL_MS, 30_000);
});

test("reminder scheduler validates its dependencies", () => {
  assert.throws(() => createReminderScheduler({ repository: {}, deliver: async () => {} }), /reminder repository/);
  const repository = createAiReminderRepository({ rows: async () => [], run: async () => ({ changes: 0 }) });
  assert.throws(() => createReminderScheduler({ repository }), /deliver function/);
});
