const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { exportDatabase } = require("../scripts/export-sqlite-for-postgres");
const { buildTargetReportSql, generateTargetReport, quoteIdentifier } = require("../scripts/generate-postgres-target-report");
const { reconcileImport } = require("../scripts/reconcile-postgres-import");
const { verifyExport } = require("../scripts/verify-postgres-export");

test("SQLite export writes deterministic table files and a validation manifest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-export-"));
  const databaseFile = path.join(directory, "source.db");
  const outputDirectory = path.join(directory, "export");
  const db = new DatabaseSync(databaseFile);
  try {
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL); INSERT INTO projects (id, name) VALUES ('PRJ-001', 'Migration test');");
  } finally {
    db.close();
  }
  try {
    const result = exportDatabase({ databaseFile, outputDirectory });
    assert.equal(result.tableCount, 1);
    const manifest = JSON.parse(fs.readFileSync(result.manifestFile, "utf8"));
    assert.equal(manifest.format, "company-project-management/sqlite-ndjson-export/v1");
    assert.equal(manifest.tables[0].name, "projects");
    assert.equal(manifest.tables[0].rowCount, 1);
    assert.match(manifest.tables[0].sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(manifest.sourceValidation.referenceViolations, []);
    assert.deepEqual(manifest.postgresImport.tableOrder, ["projects"]);
    assert.deepEqual(manifest.postgresImport.appliedMigrations, []);
    assert.equal(fs.readFileSync(path.join(outputDirectory, "projects.ndjson"), "utf8"), '{"id":"PRJ-001","name":"Migration test"}\n');
    const verification = verifyExport({ exportDirectory: outputDirectory });
    assert.equal(verification.ok, true);
    assert.equal(verification.tableCount, 1);
    assert.equal(verification.rowCount, 1);

    const targetReportFile = path.join(directory, "target-report.json");
    fs.writeFileSync(targetReportFile, JSON.stringify({ tableCounts: { projects: 1 }, appliedMigrations: [] }, null, 2));
    const reconciliation = reconcileImport({ manifestFile: result.manifestFile, targetReportFile });
    assert.equal(reconciliation.ok, true);
    assert.equal(reconciliation.matchedTableCount, 1);
    assert.equal(reconciliation.expectedRowCount, 1);
    assert.equal(reconciliation.targetRowCount, 1);

    const mismatchReportFile = path.join(directory, "target-report-mismatch.json");
    fs.writeFileSync(mismatchReportFile, JSON.stringify({ tableCounts: { projects: 0 }, appliedMigrations: [] }, null, 2));
    const mismatch = reconcileImport({ manifestFile: result.manifestFile, targetReportFile: mismatchReportFile });
    assert.equal(mismatch.ok, false);
    assert.ok(mismatch.errors.some((item) => item.includes("Row count mismatch")));

    fs.appendFileSync(path.join(outputDirectory, "projects.ndjson"), '{"id":"PRJ-002","name":"Tampered"}\n');
    const tampered = verifyExport({ exportDirectory: outputDirectory });
    assert.equal(tampered.ok, false);
    assert.ok(tampered.errors.some((item) => item.includes("SHA-256 mismatch")));
    assert.ok(tampered.errors.some((item) => item.includes("Row count mismatch")));

    assert.throws(() => exportDatabase({ databaseFile, outputDirectory }), /must be empty/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PostgreSQL target report generator quotes manifest tables and fails closed without a connection", () => {
  assert.equal(quoteIdentifier('odd"name'), '"odd""name"');
  const sql = buildTargetReportSql(["projects", 'odd"name']);
  assert.match(sql, /FROM "projects"/);
  assert.match(sql, /FROM "odd""name"/);
  assert.match(sql, /FROM schema_migrations/);
  assert.match(sql, /convalidated = false/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-target-report-"));
  const manifestFile = path.join(directory, "manifest.json");
  const outputFile = path.join(directory, "target-report.json");
  try {
    fs.writeFileSync(manifestFile, JSON.stringify({ tables: [{ name: "projects", rowCount: 1 }] }));
    assert.throws(
      () => generateTargetReport({ manifestFile, outputFile }),
      /connection string is required/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
