const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createPostgresAccess, createSqliteAccess } = require("../src/db/access");
const { createCapacityRepository } = require("../src/modules/capacity/repository");
const { createSprintCommitment } = require("../src/workflow/sprintCommitment");
const auditScopeMigration = require("../migrations/20260723_20_audit_scope");
const burndownUniquenessMigration = require("../migrations/20260723_22_burndown_snapshot_uniqueness");

const apiRoot = path.resolve(__dirname, "..");

function runDatabaseScript(databaseFile, source) {
  return spawnSync(process.execPath, ["-e", source], {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_DIALECT: "sqlite",
      DATABASE_FILE: databaseFile,
      NODE_ENV: "production",
      SEED_DEMO_DATA: "0",
      SEED_ADMIN_PASSWORD: "",
      SEED_PM_PASSWORD: "",
      SEED_DEV_PASSWORD: "",
      SEED_QA_PASSWORD: "",
      SEED_PDM_PASSWORD: "",
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("capacity natural-key upserts retain stored identities for stale concurrent candidates", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE capacity_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        working_days REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_capacity_plans_user_period
        ON capacity_plans(user_id, period_start, period_end);
      CREATE TABLE project_allocations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        allocation_percent REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_project_allocations_user_project_period
        ON project_allocations(project_id, user_id, period_start, period_end);
      CREATE TABLE work_calendar_exceptions (
        id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        calendar_date TEXT NOT NULL,
        is_working_day INTEGER NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_work_calendar_exceptions_date
        ON work_calendar_exceptions(calendar_id, calendar_date);
    `);
    const access = createSqliteAccess(db);
    const repository = createCapacityRepository(access);

    await Promise.all([
      repository.upsertPlan({ id: "CAP-RANDOM-A", user_id: "USR-1", period_start: "2026-07-01", period_end: "2026-07-31", working_days: 20, updated_at: "2026-07-01T00:00:00.000Z" }),
      repository.upsertPlan({ id: "CAP-RANDOM-B", user_id: "USR-1", period_start: "2026-07-01", period_end: "2026-07-31", working_days: 21, updated_at: "2026-07-02T00:00:00.000Z" }),
    ]);
    const plan = db.prepare("SELECT * FROM capacity_plans").get();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM capacity_plans").get().count, 1);
    assert.equal(plan.id, "CAP-RANDOM-A");
    assert.equal(plan.working_days, 21);
    assert.equal(plan.updated_at, "2026-07-02T00:00:00.000Z");

    await Promise.all([
      repository.upsertAllocation({ id: "ALLOC-RANDOM-A", project_id: "PRJ-1", user_id: "USR-1", period_start: "2026-07-01", period_end: "2026-07-31", allocation_percent: 40, updated_at: "2026-07-01T00:00:00.000Z" }),
      repository.upsertAllocation({ id: "ALLOC-RANDOM-B", project_id: "PRJ-1", user_id: "USR-1", period_start: "2026-07-01", period_end: "2026-07-31", allocation_percent: 60, updated_at: "2026-07-02T00:00:00.000Z" }),
    ]);
    const allocation = db.prepare("SELECT * FROM project_allocations").get();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_allocations").get().count, 1);
    assert.equal(allocation.id, "ALLOC-RANDOM-A");
    assert.equal(allocation.allocation_percent, 60);

    await Promise.all([
      repository.upsertCalendarException({ id: "CALX-RANDOM-A", calendar_id: "CAL-1", calendar_date: "2026-07-06", is_working_day: 0, name: "Initial", created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }),
      repository.upsertCalendarException({ id: "CALX-RANDOM-B", calendar_id: "CAL-1", calendar_date: "2026-07-06", is_working_day: 1, name: "Updated", created_at: "2026-07-02T00:00:00.000Z", updated_at: "2026-07-02T00:00:00.000Z" }),
    ]);
    const exception = db.prepare("SELECT * FROM work_calendar_exceptions").get();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM work_calendar_exceptions").get().count, 1);
    assert.equal(exception.id, "CALX-RANDOM-A");
    assert.equal(exception.created_at, "2026-07-01T00:00:00.000Z");
    assert.equal(exception.is_working_day, 1);
    assert.equal(exception.name, "Updated");
  } finally {
    db.close();
  }
});

test("PostgreSQL access forwards composite upsert options", async () => {
  const queries = [];
  const runtime = {
    dialect: "postgres",
    pool: { connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} }) },
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
  const access = createPostgresAccess(runtime);
  await access.upsert(
    "capacity_plans",
    { id: "CAP-B", user_id: "USR-1", period_start: "2026-07-01", period_end: "2026-07-31", working_days: 21 },
    {
      conflictTarget: ["user_id", "period_start", "period_end"],
      excludeUpdateColumns: ["id"],
    },
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /ON CONFLICT \(user_id, period_start, period_end\) DO UPDATE SET working_days = EXCLUDED\.working_days/);
  assert.doesNotMatch(queries[0].sql, /\bid = EXCLUDED\.id/);
  assert.deepEqual(queries[0].params, ["CAP-B", "USR-1", "2026-07-01", "2026-07-31", 21]);
});

test("concurrent sprint baseline creation keeps the first committed row", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE tasks (id TEXT PRIMARY KEY, sprint_id TEXT, estimated_hours REAL, remaining_hours REAL);
      CREATE TABLE sprint_commitments (
        id TEXT PRIMARY KEY,
        sprint_id TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        baseline_task_ids TEXT NOT NULL,
        baseline_task_count INTEGER NOT NULL,
        baseline_estimated_hours REAL NOT NULL,
        baseline_remaining_hours REAL NOT NULL,
        committed_by TEXT,
        committed_by_name TEXT,
        committed_at TEXT NOT NULL
      );
      INSERT INTO tasks (id, sprint_id, estimated_hours, remaining_hours) VALUES ('TASK-1', 'SPR-1', 8, 5);
    `);
    const access = createSqliteAccess(db);
    let sequence = 0;
    const commitment = createSprintCommitment({
      ...access,
      nextId: async () => `COM-RANDOM-${++sequence}`,
      now: () => `2026-07-23T00:00:0${sequence}.000Z`,
    });
    const sprint = { id: "SPR-1", project_id: "PRJ-1" };
    const [first, second] = await Promise.all([
      commitment.createBaseline(sprint, { id: "USR-A", name: "A" }),
      commitment.createBaseline(sprint, { id: "USR-B", name: "B" }),
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sprint_commitments").get().count, 1);
    assert.equal(first.id, second.id);
    assert.deepEqual(first.taskIds, ["TASK-1"]);
    assert.equal(first.estimatedHours, 8);
    assert.equal(first.remainingHours, 5);
  } finally {
    db.close();
  }
});

test("burndown uniqueness migration deduplicates legacy rows and enforces the daily natural key", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE burndown_snapshots (
        id TEXT PRIMARY KEY,
        sprint_id TEXT NOT NULL,
        date TEXT NOT NULL,
        remaining_hours REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO burndown_snapshots VALUES ('BURN-A', 'SPR-1', '2026-07-23', 8, '2026-07-23T01:00:00.000Z');
      INSERT INTO burndown_snapshots VALUES ('BURN-B', 'SPR-1', '2026-07-23', 5, '2026-07-23T02:00:00.000Z');
    `);
    burndownUniquenessMigration.up({ db });
    const rows = db.prepare("SELECT * FROM burndown_snapshots").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "BURN-B");
    assert.throws(
      () => db.prepare("INSERT INTO burndown_snapshots VALUES ('BURN-C', 'SPR-1', '2026-07-23', 3, '2026-07-23T03:00:00.000Z')").run(),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("startup validates applied migration checksums before compatibility DDL", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-stale-migration-"));
  const databaseFile = path.join(directory, "app.db");
  try {
    const db = new DatabaseSync(databaseFile);
    db.exec(`
      CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES ('20260713_01_work_calendar', 'stale-checksum', '2026-07-23T00:00:00.000Z');
    `);
    db.close();

    const result = runDatabaseScript(databaseFile, "require('./db').initDb();");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Applied migration was modified: 20260713_01_work_calendar/);
    const inspected = new DatabaseSync(databaseFile);
    try {
      const tables = inspected.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((item) => item.name);
      assert.deepEqual(tables, ["schema_migrations"]);
    } finally {
      inspected.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("startup allows pending migrations and daily burndown writes are atomic", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-pending-migrations-"));
  const databaseFile = path.join(directory, "app.db");
  try {
    const db = new DatabaseSync(databaseFile);
    db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    db.close();
    const result = runDatabaseScript(databaseFile, `
      (async () => {
        const database = require('./db');
        database.initDb();
        await Promise.all([
          database.recordBurndownSnapshot('SPR-ATOMIC'),
          database.recordBurndownSnapshot('SPR-ATOMIC'),
        ]);
        await database.closeDatabase();
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `);
    assert.equal(result.status, 0, result.stderr);
    const inspected = new DatabaseSync(databaseFile);
    try {
      assert.equal(inspected.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count, 23);
      assert.equal(inspected.prepare("SELECT COUNT(*) AS count FROM burndown_snapshots WHERE sprint_id = 'SPR-ATOMIC'").get().count, 1);
      assert.equal(
        inspected.prepare("SELECT COUNT(*) AS count FROM pragma_index_list('burndown_snapshots') WHERE name = 'idx_burndown_snapshots_sprint_date' AND \"unique\" = 1").get().count,
        1,
      );
    } finally {
      inspected.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("audit scope migration does not swallow unrelated ALTER TABLE failures", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.throws(() => auditScopeMigration.up({ db }), /no such table: audit_logs/);
  } finally {
    db.close();
  }
});
