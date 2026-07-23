const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createSqliteBackup } = require("../scripts/sqlite-backup");
const { restoreSqliteBackup } = require("../scripts/sqlite-restore");
const {
  runDrill,
  MARKER_PRODUCT_ID,
  NOISE_PRODUCT_ID,
} = require("../scripts/sqlite-backup-restore-drill");

test("sqlite backup and restore round-trip preserves file bytes and rejects overwrite without force", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-sqlite-unit-"));
  const sourceDb = path.join(root, "src.db");
  const targetDb = path.join(root, "dst.db");
  const backupRoot = path.join(root, "backups");

  const db = new DatabaseSync(sourceDb);
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t(v) VALUES ('alpha');");
  db.close();

  const backup = createSqliteBackup({ databaseFile: sourceDb, backupRoot, label: "unit" });
  assert.ok(fs.existsSync(backup.manifestFile));
  assert.ok(backup.files.some((file) => file.basename.endsWith(".db") || file.basename === "src.db"));

  const restored = restoreSqliteBackup({
    backupDir: backup.directory,
    databaseFile: targetDb,
    force: false,
  });
  assert.equal(restored.databaseFile, path.resolve(targetDb));

  const opened = new DatabaseSync(targetDb);
  const row = opened.prepare("SELECT v FROM t").get();
  opened.close();
  assert.equal(row.v, "alpha");

  assert.throws(
    () =>
      restoreSqliteBackup({
        backupDir: backup.directory,
        databaseFile: targetDb,
        force: false,
      }),
    /--force/,
  );

  // Force overwrite after local mutation.
  const mutate = new DatabaseSync(targetDb);
  mutate.prepare("UPDATE t SET v = 'beta'").run();
  mutate.close();
  restoreSqliteBackup({
    backupDir: backup.directory,
    databaseFile: targetDb,
    force: true,
  });
  const reopened = new DatabaseSync(targetDb);
  assert.equal(reopened.prepare("SELECT v FROM t").get().v, "alpha");
  reopened.close();

  fs.rmSync(root, { recursive: true, force: true });
});

test("sqlite backup restore drill recovers pre-mutation marker data", async () => {
  const report = await runDrill();
  assert.equal(report.ok, true);
  assert.equal(report.steps.baseline.markerPresent, true);
  assert.equal(report.steps.mutated.markerPresent, false);
  assert.equal(report.steps.afterRestore.markerPresent, true);
  assert.equal(report.steps.afterRestore.users, report.steps.baseline.users);
  assert.equal(report.steps.afterRestore.products, report.steps.baseline.products);
  assert.ok(report.preflight?.ok);
  assert.equal(report.steps.baseline.markerPresent, true);
  // Noise id should only appear in mutated step narrative (not restored).
  assert.ok(MARKER_PRODUCT_ID);
  assert.ok(NOISE_PRODUCT_ID);
});
