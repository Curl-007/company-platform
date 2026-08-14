const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");
const { createTestingRepository } = require("../src/modules/testing/repository");
const { createTestCaseTaskSync } = require("../src/modules/testing/taskSync");

function fixture() {
  const runtime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  runtime.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, priority TEXT,
      project_id TEXT, deleted_at TEXT
    );
    CREATE TABLE defects (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, severity TEXT,
      requirement_id TEXT, project_id TEXT
    );
    CREATE TABLE test_cases (
      id TEXT PRIMARY KEY, name TEXT, requirement_id TEXT, project_id TEXT,
      status TEXT, owner TEXT, assignee_role TEXT,
      total_cases INTEGER, passed_cases INTEGER, failed_cases INTEGER, blocked_cases INTEGER,
      description TEXT, steps TEXT, expected_result TEXT
    );
    CREATE TABLE test_runs (
      id TEXT PRIMARY KEY, test_case_id TEXT, result TEXT, notes TEXT,
      executed_by TEXT, created_at TEXT
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, status_text TEXT,
      project_id TEXT, owner TEXT, description TEXT, requirement_id TEXT,
      progress INTEGER, blocker TEXT, remaining_hours REAL, kanban_column TEXT,
      assignee_role TEXT, source_type TEXT, source_id TEXT,
      wbs_code TEXT, sort_order INTEGER, estimated_hours REAL, actual_hours REAL,
      type TEXT, parent_id TEXT, due_date TEXT, version INTEGER DEFAULT 1
    );
  `);
  const access = createSqliteAccess(runtime);
  return { runtime, access, repository: createTestingRepository(access) };
}

async function seedTestCase(access) {
  await access.insert("projects", { id: "PRJ-1", name: "Core project", deleted_at: null });
  await access.insert("requirements", {
    id: "REQ-1",
    title: "Login",
    status: "approved",
    priority: "high",
    project_id: "PRJ-1",
    deleted_at: null,
  });
  await access.insert("requirements", {
    id: "REQ-2",
    title: "Export",
    status: "approved",
    priority: "medium",
    project_id: "PRJ-1",
    deleted_at: null,
  });
  await access.insert("test_cases", {
    id: "TC-1",
    name: "Login happy path",
    requirement_id: "REQ-1",
    project_id: "PRJ-1",
    status: "active",
    owner: "Alice",
    assignee_role: "qa",
    total_cases: 2,
    passed_cases: 0,
    failed_cases: 0,
    blocked_cases: 0,
    description: "",
    steps: "[]",
    expected_result: "success",
  });
  await access.insert("defects", {
    id: "BUG-1",
    title: "Login error",
    status: "new",
    severity: "high",
    requirement_id: "REQ-1",
    project_id: "PRJ-1",
  });
}

test("testing repository returns test-plan inputs and dependency evidence", async () => {
  const { runtime, access, repository } = fixture();
  try {
    await seedTestCase(access);
    await repository.createTestRun({
      id: "TR-1",
      test_case_id: "TC-1",
      result: "passed",
      notes: "ok",
      executed_by: "Alice",
      created_at: "2026-08-14T00:00:00.000Z",
    });
    await repository.createTestCaseTask({
      id: "TASK-1",
      source_type: "test_case",
      source_id: "TC-1",
    });

    const inputs = await repository.getTestPlanInputs("PRJ-1");
    assert.deepEqual(inputs.requirements.map((item) => item.id), ["REQ-1", "REQ-2"]);
    assert.deepEqual(inputs.testCases.map((item) => item.id), ["TC-1"]);
    assert.deepEqual(inputs.defects.map((item) => item.id), ["BUG-1"]);

    const dependencies = await repository.testCaseDependencies("TC-1");
    assert.deepEqual(dependencies, {
      testRuns: { count: 1, sampleIds: ["TR-1"] },
      tasks: { count: 1, sampleIds: ["TASK-1"] },
    });

    const applied = await repository.applyTestRunResult({ id: "TC-1", result: "passed" });
    assert.equal(applied.changes, 1);
    const after = await repository.findTestCase("TC-1");
    assert.equal(after.passed_cases, 1);
    assert.equal(after.status, "passed");
  } finally {
    runtime.close();
  }
});

test("testing repository cascade remains part of the caller transaction", async () => {
  const { runtime, access, repository } = fixture();
  try {
    await seedTestCase(access);
    await repository.createTestRun({
      id: "TR-2",
      test_case_id: "TC-1",
      result: "failed",
      notes: "failed",
      executed_by: "Alice",
      created_at: "2026-08-14T00:00:00.000Z",
    });
    await repository.createTestCaseTask({
      id: "TASK-2",
      source_type: "test_case",
      source_id: "TC-1",
    });

    await assert.rejects(
      access.transaction(async () => {
        const snapshots = await repository.cascadeDeleteTestCase("TC-1");
        assert.equal(snapshots.before.id, "TC-1");
        assert.deepEqual(snapshots.runs.map((item) => item.id), ["TR-2"]);
        assert.deepEqual(snapshots.tasks.map((item) => item.id), ["TASK-2"]);
        throw new Error("audit write failed");
      }),
      /audit write failed/,
    );

    assert.equal((await repository.findTestCase("TC-1")).id, "TC-1");
    assert.equal((await repository.listTestRuns("TC-1")).length, 1);
    assert.equal((await repository.findTestCaseTask("TC-1")).id, "TASK-2");
  } finally {
    runtime.close();
  }
});

test("test-case task sync writes through the testing repository", async () => {
  const calls = [];
  const repository = {
    findTestCaseTask: async () => null,
    createTestCaseTask: async (task) => calls.push(task),
  };
  const { syncTestCaseTask } = createTestCaseTaskSync({
    nextId: async () => "TASK-NEW",
    repository,
  });

  const taskId = await syncTestCaseTask({
    id: "TC-9",
    name: "Smoke test",
    project_id: "PRJ-9",
    requirement_id: null,
    owner: "Alice",
    assignee_role: "qa",
    total_cases: 1,
    passed_cases: 1,
    failed_cases: 0,
    blocked_cases: 0,
    description: "",
  });

  assert.equal(taskId, "TASK-NEW");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "TASK-NEW");
  assert.equal(calls[0].source_type, "test_case");
  assert.equal(calls[0].source_id, "TC-9");
  assert.equal(calls[0].status, "done");
});
