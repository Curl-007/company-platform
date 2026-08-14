const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const {
  ACTION,
  ACTOR_ID,
  repairOrphanedRequirementProducts,
} = require("../scripts/repair-orphaned-requirement-products");

function createDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE requirements (id TEXT PRIMARY KEY, title TEXT NOT NULL, product_id TEXT, project_id TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT NOT NULL,
      resource_type TEXT NOT NULL, resource_id TEXT, before_json TEXT, after_json TEXT,
      ip TEXT, created_at TEXT NOT NULL, scope_type TEXT NOT NULL DEFAULT 'global',
      project_id TEXT, subject_user_id TEXT
    );
    INSERT INTO projects (id) VALUES ('PRJ-1');
    INSERT INTO products (id, name) VALUES ('PROD-1', 'Live product');
    INSERT INTO requirements (id, title, product_id, project_id) VALUES
      ('REQ-1', 'Keep this requirement', 'MISSING-PROD', 'PRJ-1'),
      ('REQ-2', 'Keep the valid link', 'PROD-1', 'PRJ-1');
  `);
  db.close();
}

test("orphaned requirement product repair creates a verifiable backup, preserves requirements, and is idempotent", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-requirement-product-repair-"));
  const databaseFile = path.join(directory, "app.db");
  const backupRoot = path.join(directory, "backups");
  createDatabase(databaseFile);

  const report = repairOrphanedRequirementProducts({ databaseFile, backupRoot, now: () => "2026-08-14T00:00:00.000Z" });
  assert.equal(report.repaired.length, 1);
  assert.equal(report.repaired[0].id, "REQ-1");
  assert.equal(fs.existsSync(report.backup.databaseFile), true);
  assert.equal(report.backup.sourceDatabaseFile, databaseFile);
  assert.notEqual(report.backup.databaseFile, databaseFile);
  assert.equal(fs.existsSync(report.backup.manifestFile), true);

  const repaired = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    assert.equal(repaired.prepare("SELECT product_id FROM requirements WHERE id = 'REQ-1'").get().product_id, null);
    assert.equal(repaired.prepare("SELECT product_id FROM requirements WHERE id = 'REQ-2'").get().product_id, "PROD-1");
    const audit = repaired.prepare("SELECT actor_id, action, resource_type, resource_id, scope_type, project_id FROM audit_logs").get();
    assert.equal(audit.actor_id, ACTOR_ID);
    assert.equal(audit.action, ACTION);
    assert.equal(audit.resource_type, "requirement");
    assert.equal(audit.resource_id, "REQ-1");
    assert.equal(audit.scope_type, "project");
    assert.equal(audit.project_id, "PRJ-1");
  } finally {
    repaired.close();
  }

  const rerun = repairOrphanedRequirementProducts({ databaseFile, backupRoot });
  assert.equal(rerun.alreadyClean, true);
  assert.equal(rerun.backup, null);
  assert.deepEqual(rerun.repaired, []);
});
