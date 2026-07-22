#!/usr/bin/env node
/**
 * Disposable SQLite backup → restore → preflight drill for RC readiness.
 *
 * Creates a temporary source DB, backs it up, restores to another path,
 * and verifies migration preflight on the restored file.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createSqliteBackup } = require("./sqlite-backup");
const { restoreSqliteBackup } = require("./sqlite-restore");
const { preflightDatabase } = require("../src/db/migrationPreflight");

async function runDrill() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-sqlite-drill-"));
  const sourceDb = path.join(root, "source.db");
  const restoreDb = path.join(root, "restored.db");
  const backupRoot = path.join(root, "backups");

  process.env.DATABASE_FILE = sourceDb;
  process.env.SEED_DEMO_DATA = process.env.SEED_DEMO_DATA || "0";
  // Initialize schema + seed via product bootstrap.
  require("../db").initDb();

  const backup = createSqliteBackup({
    databaseFile: sourceDb,
    backupRoot,
    label: "drill",
  });
  const restored = restoreSqliteBackup({
    backupDir: backup.directory,
    databaseFile: restoreDb,
    force: true,
  });

  const db = new DatabaseSync(restoreDb);
  let preflight;
  try {
    preflight = preflightDatabase(db);
  } finally {
    db.close();
  }

  const report = {
    ok: Boolean(preflight?.ok),
    root,
    sourceDb,
    restoreDb,
    backupDir: backup.directory,
    restoredFiles: restored.restored.map((file) => path.basename(file.destination)),
    preflight,
  };

  // Best-effort cleanup of temp artifacts; keep on failure for inspection.
  if (report.ok) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      report.cleaned = true;
    } catch {
      report.cleaned = false;
    }
  } else {
    report.cleaned = false;
  }
  return report;
}

if (require.main === module) {
  runDrill()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = { runDrill };
