#!/usr/bin/env node
/**
 * Online-safe-ish SQLite file backup for this product's default dialect.
 * Copies the main DB plus -wal/-shm sidecars when present, with a manifest.
 *
 * Usage:
 *   node scripts/sqlite-backup.js [--database path/to/app.db] [--out path/to/backups] [--label nightly]
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function copyWithChecksum(source, destination) {
  fs.copyFileSync(source, destination);
  const bytes = fs.statSync(destination).size;
  const digest = sha256(fs.readFileSync(destination));
  return {
    source,
    destination,
    basename: path.basename(destination),
    bytes,
    sha256: digest,
  };
}

function createSqliteBackup({ databaseFile, backupRoot, label = "manual" } = {}) {
  const resolvedDatabaseFile = path.resolve(
    databaseFile || process.env.DATABASE_FILE || path.resolve(__dirname, "..", "app.db"),
  );
  if (!fs.existsSync(resolvedDatabaseFile)) {
    throw new Error(`Database file does not exist: ${resolvedDatabaseFile}`);
  }

  const root = path.resolve(backupRoot || path.join(path.dirname(resolvedDatabaseFile), "backups"));
  fs.mkdirSync(root, { recursive: true });
  const safeLabel = String(label || "manual").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40) || "manual";
  const directory = path.join(root, `sqlite-${safeLabel}-${timestampForPath()}`);
  fs.mkdirSync(directory, { recursive: false });

  const files = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${resolvedDatabaseFile}${suffix}`;
    if (!fs.existsSync(source)) continue;
    files.push(copyWithChecksum(source, path.join(directory, path.basename(source))));
  }
  if (!files.length) {
    throw new Error(`No database files found for backup at ${resolvedDatabaseFile}`);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    label: safeLabel,
    databaseFile: resolvedDatabaseFile,
    files,
  };
  const manifestFile = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { directory, manifestFile, files, manifest };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const databaseIndex = args.indexOf("--database");
  const outIndex = args.indexOf("--out");
  const labelIndex = args.indexOf("--label");
  return {
    databaseFile: databaseIndex >= 0 ? args[databaseIndex + 1] : undefined,
    backupRoot: outIndex >= 0 ? args[outIndex + 1] : undefined,
    label: labelIndex >= 0 ? args[labelIndex + 1] : "manual",
    json: args.includes("--json"),
    invalid:
      (databaseIndex >= 0 && !args[databaseIndex + 1]) ||
      (outIndex >= 0 && !args[outIndex + 1]) ||
      (labelIndex >= 0 && !args[labelIndex + 1]),
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv);
  if (options.invalid) {
    console.error("Usage: node scripts/sqlite-backup.js [--database path/to/app.db] [--out path/to/backups] [--label nightly] [--json]");
    process.exitCode = 2;
  } else {
    try {
      const result = createSqliteBackup(options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`SQLite backup created: ${result.directory}`);
        console.log(`Files: ${result.files.map((file) => file.basename).join(", ")}`);
        console.log(`Manifest: ${result.manifestFile}`);
      }
    } catch (error) {
      console.error(error.message || error);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  createSqliteBackup,
};
