#!/usr/bin/env node
/**
 * Disposable SQLite backup → mutate → restore → verify drill for RC readiness.
 *
 * Flow:
 *   1. Bootstrap a temporary source DB (schema + seed accounts)
 *   2. Insert a marker row and record baseline counts
 *   3. Create a backup
 *   4. Mutate the source DB (marker gone / extra noise row)
 *   5. Restore backup to a second path
 *   6. Assert restored DB has pre-mutation data (marker present, noise absent)
 *   7. Run migration preflight on the restored file
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createSqliteBackup } = require("./sqlite-backup");
const { restoreSqliteBackup } = require("./sqlite-restore");
const { preflightDatabase } = require("../src/db/migrationPreflight");

const MARKER_PRODUCT_ID = "PROD-BACKUP-DRILL";
const MARKER_NAME = "backup-drill-marker-product";
const NOISE_PRODUCT_ID = "PROD-BACKUP-NOISE";

function openDb(file) {
  return new DatabaseSync(file);
}

function tableCount(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0);
}

function hasProduct(db, id) {
  return Boolean(db.prepare("SELECT id FROM products WHERE id = ?").get(id));
}

function insertProduct(db, { id, name, owner = "系统管理员" }) {
  db.prepare(
    `INSERT INTO products (
      id, name, owner, version, stage, description, image_url,
      system_name, system_version, application_version,
      modules, hardware_info, system_info, application_info,
      hardware_metrics, system_metrics, app_metrics, roadmap
    ) VALUES (
      @id, @name, @owner, '1.0.0', 'growth', 'sqlite backup drill marker', NULL,
      '', '', '',
      '[]', '{}', '{}', '{}',
      '[]', '[]', '[]', '[]'
    )`,
  ).run({ id, name, owner });
}

function deleteProduct(db, id) {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

function readBaseline(db) {
  return {
    users: tableCount(db, "users"),
    products: tableCount(db, "products"),
    migrations: tableCount(db, "schema_migrations"),
    markerPresent: hasProduct(db, MARKER_PRODUCT_ID),
  };
}

/**
 * @returns {Promise<object>}
 */
async function runDrill() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-sqlite-drill-"));
  const sourceDb = path.join(root, "source.db");
  const restoreDb = path.join(root, "restored.db");
  const backupRoot = path.join(root, "backups");
  const report = {
    ok: false,
    root,
    sourceDb,
    restoreDb,
    backupDir: null,
    steps: {},
    cleaned: false,
  };

  try {
    process.env.DATABASE_FILE = sourceDb;
    process.env.SEED_DEMO_DATA = process.env.SEED_DEMO_DATA || "0";
    // Isolate module cache so repeated drills (or tests) do not reuse another DB path.
    const dbModulePath = require.resolve("../db");
    delete require.cache[dbModulePath];
    const dbModule = require("../db");
    await Promise.resolve(dbModule.initDb());
    if (typeof dbModule.closeDatabase === "function") {
      await dbModule.closeDatabase();
    }
    // Drop cached module so subsequent requires do not hold the closed handle.
    delete require.cache[dbModulePath];

    let source = openDb(sourceDb);
    try {
      insertProduct(source, { id: MARKER_PRODUCT_ID, name: MARKER_NAME });
      const baseline = readBaseline(source);
      if (!baseline.markerPresent || baseline.users < 1) {
        throw new Error(`Baseline invalid: ${JSON.stringify(baseline)}`);
      }
      report.steps.baseline = baseline;
    } finally {
      source.close();
    }

    const backup = createSqliteBackup({
      databaseFile: sourceDb,
      backupRoot,
      label: "drill",
    });
    report.backupDir = backup.directory;
    report.steps.backup = {
      directory: backup.directory,
      files: backup.files.map((file) => file.basename),
      manifestFile: backup.manifestFile,
    };

    // Mutate live source after backup: remove marker, add noise product.
    source = openDb(sourceDb);
    try {
      deleteProduct(source, MARKER_PRODUCT_ID);
      insertProduct(source, { id: NOISE_PRODUCT_ID, name: "post-backup-noise" });
      const mutated = readBaseline(source);
      report.steps.mutated = mutated;
      if (mutated.markerPresent) {
        throw new Error("Mutation failed: marker still present on source after delete.");
      }
      if (!hasProduct(source, NOISE_PRODUCT_ID)) {
        throw new Error("Mutation failed: noise product missing on source.");
      }
    } finally {
      source.close();
    }

    const restored = restoreSqliteBackup({
      backupDir: backup.directory,
      databaseFile: restoreDb,
      force: true,
      verifyChecksum: true,
    });
    report.steps.restore = {
      files: restored.restored.map((file) => path.basename(file.destination)),
      databaseFile: restored.databaseFile,
    };

    const restoredHandle = openDb(restoreDb);
    let preflight;
    try {
      const afterRestore = readBaseline(restoredHandle);
      report.steps.afterRestore = afterRestore;
      if (!afterRestore.markerPresent) {
        throw new Error("Restore verification failed: marker product missing on restored DB.");
      }
      if (hasProduct(restoredHandle, NOISE_PRODUCT_ID)) {
        throw new Error("Restore verification failed: post-backup noise leaked into restored DB.");
      }
      if (afterRestore.users !== report.steps.baseline.users) {
        throw new Error(
          `Restore verification failed: users count ${afterRestore.users} !== baseline ${report.steps.baseline.users}`,
        );
      }
      if (afterRestore.products !== report.steps.baseline.products) {
        throw new Error(
          `Restore verification failed: products count ${afterRestore.products} !== baseline ${report.steps.baseline.products}`,
        );
      }
      preflight = preflightDatabase(restoredHandle);
      report.preflight = preflight;
      if (!preflight?.ok) {
        throw new Error(`Restored database failed migration preflight: ${JSON.stringify(preflight)}`);
      }
    } finally {
      restoredHandle.close();
    }

    report.ok = true;
    report.restoredFiles = restored.restored.map((file) => path.basename(file.destination));
  } catch (error) {
    report.ok = false;
    report.error = error && error.message ? error.message : String(error);
    throw error;
  } finally {
    if (report.ok) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
        report.cleaned = true;
      } catch {
        report.cleaned = false;
      }
    }
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

module.exports = { runDrill, MARKER_PRODUCT_ID, NOISE_PRODUCT_ID };
