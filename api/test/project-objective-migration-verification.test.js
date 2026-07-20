const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { verifyProjectObjectiveMigration } = require("../scripts/verify-project-objective-migration");
const { normalizedMigrationChecksum, repairProjectObjectiveMigration } = require("../scripts/repair-project-objective-migration");

test("project-objective migration verifier proves the required schema and historical backfill", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-objective-verifier-"));
  const databaseFile = path.join(directory, "app.db");
  const db = new DatabaseSync(databaseFile);
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, description TEXT, objective TEXT);
    CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT);
    INSERT INTO projects (id, description, objective) VALUES ('PRJ-1', 'Deliver a secure migration', 'Deliver a secure migration');
    INSERT INTO schema_migrations (id, checksum, applied_at) VALUES ('20260713_09_project_objective', '${normalizedMigrationChecksum()}', '2026-07-13T00:00:00.000Z');
  `);
  db.close();
  const verified = verifyProjectObjectiveMigration(databaseFile);
  assert.equal(verified.ok, true);
  assert.equal(verified.checksumMatchesMigration, true);
  assert.equal(verified.expectedChecksum, normalizedMigrationChecksum());
  assert.equal(verified.hasObjective, true);
  assert.equal(verified.rowsWithDescriptionButNoObjective, 0);
});

test("project-objective migration verifier rejects a stale migration checksum", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-objective-stale-checksum-"));
  const databaseFile = path.join(directory, "app.db");
  const db = new DatabaseSync(databaseFile);
  try {
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY, description TEXT, objective TEXT);
      CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT);
      INSERT INTO schema_migrations (id, checksum, applied_at)
        VALUES ('20260713_09_project_objective', 'stale-checksum', '2026-07-13T00:00:00.000Z');
    `);
  } finally {
    db.close();
  }

  const verified = verifyProjectObjectiveMigration(databaseFile);
  assert.equal(verified.ok, false);
  assert.equal(verified.checksumMatchesMigration, false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("project-objective repair creates an evidence backup, audit record, and aligned checksum", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-objective-repair-"));
  const databaseFile = path.join(directory, "app.db");
  const db = new DatabaseSync(databaseFile);
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, description TEXT, objective TEXT);
    CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT);
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT, resource_type TEXT,
      resource_id TEXT, before_json TEXT, after_json TEXT, ip TEXT, created_at TEXT
    );
    INSERT INTO projects (id, description, objective) VALUES ('PRJ-1', 'Restore the migration objective', '');
    INSERT INTO schema_migrations (id, checksum, applied_at)
      VALUES ('20260713_09_project_objective', 'outdated-checksum', '2026-07-13T00:00:00.000Z');
  `);
  db.close();

  const report = repairProjectObjectiveMigration({ databaseFile, backupRoot: path.join(directory, "backups") });
  const repaired = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    assert.equal(report.repaired.length, 1);
    assert.equal(fs.existsSync(report.backup.manifestFile), true);
    assert.equal(repaired.prepare("SELECT objective FROM projects WHERE id = 'PRJ-1'").get().objective, "Restore the migration objective");
    assert.equal(repaired.prepare("SELECT checksum FROM schema_migrations WHERE id = '20260713_09_project_objective'").get().checksum, normalizedMigrationChecksum());
    const audit = repaired.prepare("SELECT actor_id, action, resource_type, resource_id FROM audit_logs").get();
    assert.equal(audit.actor_id, "system:migration-repair");
    assert.equal(audit.action, "migration.project_objective_repair");
    assert.equal(audit.resource_type, "project");
    assert.equal(audit.resource_id, "PRJ-1");
  } finally {
    repaired.close();
  }
});
