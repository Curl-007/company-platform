#!/usr/bin/env node
/**
 * Restore a SQLite database from a backup directory produced by sqlite-backup.js.
 *
 * Usage:
 *   node scripts/sqlite-restore.js --from path/to/backup-dir --database path/to/target.db [--force]
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function loadManifest(backupDir) {
  const manifestFile = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Backup manifest not found: ${manifestFile}`);
  }
  return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
}

function restoreSqliteBackup({ backupDir, databaseFile, force = false, verifyChecksum = true } = {}) {
  const resolvedBackupDir = path.resolve(backupDir);
  const resolvedDatabaseFile = path.resolve(
    databaseFile || process.env.DATABASE_FILE || path.resolve(__dirname, "..", "app.db"),
  );
  if (!fs.existsSync(resolvedBackupDir)) {
    throw new Error(`Backup directory does not exist: ${resolvedBackupDir}`);
  }

  const manifest = loadManifest(resolvedBackupDir);
  const mainEntry = (manifest.files || []).find((file) => !file.basename.endsWith("-wal") && !file.basename.endsWith("-shm"));
  if (!mainEntry) {
    throw new Error("Backup manifest does not include a primary database file.");
  }

  if (fs.existsSync(resolvedDatabaseFile) && !force) {
    throw new Error(`Refusing to overwrite existing database without --force: ${resolvedDatabaseFile}`);
  }

  fs.mkdirSync(path.dirname(resolvedDatabaseFile), { recursive: true });

  // Remove target sidecars so a restore does not mix old WAL with new main file.
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${resolvedDatabaseFile}${suffix}`;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }

  const restored = [];
  for (const file of manifest.files || []) {
    const source = path.join(resolvedBackupDir, file.basename);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing backup file: ${source}`);
    }
    if (verifyChecksum && file.sha256) {
      const actual = sha256File(source);
      if (actual !== file.sha256) {
        throw new Error(`Checksum mismatch for ${file.basename}: expected ${file.sha256}, got ${actual}`);
      }
    }
    let destination;
    if (file.basename.endsWith("-wal")) destination = `${resolvedDatabaseFile}-wal`;
    else if (file.basename.endsWith("-shm")) destination = `${resolvedDatabaseFile}-shm`;
    else destination = resolvedDatabaseFile;
    fs.copyFileSync(source, destination);
    restored.push({ source, destination, basename: path.basename(destination), bytes: fs.statSync(destination).size });
  }

  return {
    backupDir: resolvedBackupDir,
    databaseFile: resolvedDatabaseFile,
    restored,
    manifest,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const fromIndex = args.indexOf("--from");
  const databaseIndex = args.indexOf("--database");
  return {
    backupDir: fromIndex >= 0 ? args[fromIndex + 1] : undefined,
    databaseFile: databaseIndex >= 0 ? args[databaseIndex + 1] : undefined,
    force: args.includes("--force"),
    json: args.includes("--json"),
    invalid: fromIndex < 0 || !args[fromIndex + 1] || (databaseIndex >= 0 && !args[databaseIndex + 1]),
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv);
  if (options.invalid) {
    console.error("Usage: node scripts/sqlite-restore.js --from path/to/backup-dir [--database path/to/app.db] [--force] [--json]");
    process.exitCode = 2;
  } else {
    try {
      const result = restoreSqliteBackup(options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Restored SQLite database: ${result.databaseFile}`);
        console.log(`Files: ${result.restored.map((file) => path.basename(file.destination)).join(", ")}`);
      }
    } catch (error) {
      console.error(error.message || error);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  restoreSqliteBackup,
};
