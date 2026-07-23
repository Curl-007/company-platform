const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { preflightDatabase } = require("../src/db/migrationPreflight");

test("database migration preflight detects orphan relations and invalid JSON before export", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE requirements (id TEXT PRIMARY KEY, project_id TEXT, linked_tasks TEXT, acceptance_criteria TEXT);
      CREATE TABLE ai_jobs (
        job_id TEXT PRIMARY KEY,
        scene TEXT,
        status TEXT,
        progress INTEGER,
        current_step TEXT,
        source_type TEXT,
        source_id TEXT,
        goals TEXT,
        result TEXT,
        evidence TEXT,
        written_requirement_id TEXT,
        created_at TEXT,
        confirmed_at TEXT
      );
      INSERT INTO projects (id) VALUES ('PRJ-001');
      INSERT INTO requirements (id, project_id, linked_tasks, acceptance_criteria) VALUES ('REQ-001', 'PRJ-001', '[]', '[]');
      INSERT INTO ai_jobs (
        job_id, scene, status, progress, current_step, source_type, source_id, goals, result, evidence, written_requirement_id, created_at
      ) VALUES (
        'JOB-001', 'document_analysis', 'done', 100, 'done', 'document', 'DOC-001', '[]', '{}', '[]', 'REQ-001', '2026-07-15T00:00:00.000Z'
      );
    `);
    const clean = preflightDatabase(db, { expectedTables: ["projects", "requirements", "ai_jobs"] });
    assert.equal(clean.ok, true);

    db.exec("INSERT INTO requirements (id, project_id, linked_tasks, acceptance_criteria) VALUES ('REQ-002', 'PRJ-MISSING', 'not-json', '[]')");
    db.exec(`
      INSERT INTO ai_jobs (
        job_id, scene, status, progress, current_step, source_type, source_id, goals, result, evidence, written_requirement_id, created_at
      ) VALUES (
        'JOB-002', 'document_analysis', 'done', 100, 'done', 'document', 'DOC-002', '[]', '{}', '[]', 'REQ-MISSING', '2026-07-15T00:00:00.000Z'
      );
    `);
    const invalid = preflightDatabase(db, { expectedTables: ["projects", "requirements", "ai_jobs"] });
    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.referenceViolations[0], {
      childTable: "requirements",
      childColumn: "project_id",
      parentTable: "projects",
      parentColumn: "id",
      count: 1,
    });
    assert.ok(
      invalid.referenceViolations.some((item) => (
        item.childTable === "ai_jobs"
        && item.childColumn === "written_requirement_id"
        && item.parentTable === "requirements"
        && item.count === 1
      )),
    );
    assert.deepEqual(invalid.jsonViolations[0], { table: "requirements", column: "linked_tasks", count: 1, sampleRowIds: [2] });
  } finally {
    db.close();
  }
});

test("database migration preflight requires audit scope columns and validates their references", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        project_id TEXT,
        subject_user_id TEXT
      );
      INSERT INTO users (id) VALUES ('U-001');
      INSERT INTO projects (id) VALUES ('PRJ-001');
      INSERT INTO audit_logs (id, actor_id, project_id, subject_user_id)
      VALUES ('AUD-001', 'U-001', 'PRJ-MISSING', 'U-MISSING');
    `);

    const missingScope = preflightDatabase(db, { expectedTables: ["users", "projects", "audit_logs"] });
    assert.equal(missingScope.ok, false);
    assert.deepEqual(missingScope.missingColumns, ["audit_logs.scope_type"]);
    assert.ok(missingScope.referenceViolations.some((item) => (
      item.childTable === "audit_logs" && item.childColumn === "project_id" && item.count === 1
    )));
    assert.ok(missingScope.referenceViolations.some((item) => (
      item.childTable === "audit_logs" && item.childColumn === "subject_user_id" && item.count === 1
    )));

    db.exec("ALTER TABLE audit_logs ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'global'");
    db.exec("UPDATE audit_logs SET project_id = 'PRJ-001', subject_user_id = 'U-001'");
    const clean = preflightDatabase(db, { expectedTables: ["users", "projects", "audit_logs"] });
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.missingColumns, []);
  } finally {
    db.close();
  }
});
