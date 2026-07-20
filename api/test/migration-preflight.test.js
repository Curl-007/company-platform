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
