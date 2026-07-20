const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const MIGRATION_ID = "20260713_09_project_objective";
const ACTOR_ID = "system:migration-repair";
const ACTOR_NAME = "Migration Repair";
const ACTION = "migration.project_objective_repair";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizedMigrationChecksum() {
  const filename = path.resolve(__dirname, "..", "migrations", `${MIGRATION_ID}.js`);
  return sha256(fs.readFileSync(filename, "utf8").replace(/\r\n/g, "\n"));
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function copyWithChecksum(source, destination) {
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  return {
    source,
    destination,
    bytes: fs.statSync(destination).size,
    sha256: sha256(fs.readFileSync(destination)),
  };
}

function createBackup(databaseFile, backupRoot) {
  if (!fs.existsSync(databaseFile)) throw new Error(`Database file does not exist: ${databaseFile}`);
  const root = path.resolve(backupRoot || path.join(path.dirname(databaseFile), "backups"));
  fs.mkdirSync(root, { recursive: true });
  const directory = path.join(root, `project-objective-repair-${timestampForPath()}`);
  fs.mkdirSync(directory, { recursive: false });
  const files = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${databaseFile}${suffix}`;
    if (!fs.existsSync(source)) continue;
    files.push(copyWithChecksum(source, path.join(directory, path.basename(source))));
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    databaseFile,
    files,
  };
  const manifestFile = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { directory, manifestFile, files };
}

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function repairProjectObjectiveMigration({ databaseFile, backupRoot } = {}) {
  const resolvedDatabaseFile = path.resolve(databaseFile || process.env.DATABASE_FILE || path.resolve(__dirname, "..", "app.db"));
  const backup = createBackup(resolvedDatabaseFile, backupRoot);
  const checksum = normalizedMigrationChecksum();
  const db = new DatabaseSync(resolvedDatabaseFile);
  try {
    const projectColumns = tableColumns(db, "projects");
    const migrationColumns = tableColumns(db, "schema_migrations");
    const auditColumns = tableColumns(db, "audit_logs");
    for (const [table, columns, required] of [
      ["projects", projectColumns, ["id", "description", "objective"]],
      ["schema_migrations", migrationColumns, ["id", "checksum"]],
      ["audit_logs", auditColumns, ["id", "actor_id", "actor_name", "action", "resource_type", "resource_id", "before_json", "after_json", "ip", "created_at"]],
    ]) {
      const missing = required.filter((column) => !columns.includes(column));
      if (missing.length) throw new Error(`Cannot repair ${table}: missing columns ${missing.join(", ")}`);
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const migration = db.prepare("SELECT checksum, applied_at FROM schema_migrations WHERE id = @id").get({ id: MIGRATION_ID });
      if (!migration) throw new Error(`Cannot repair: migration record ${MIGRATION_ID} is missing.`);

      const candidates = db.prepare(`SELECT id, objective, description FROM projects
        WHERE COALESCE(TRIM(objective), '') = '' AND COALESCE(TRIM(description), '') != ''
        ORDER BY id`).all();
      const updateObjective = db.prepare("UPDATE projects SET objective = @objective WHERE id = @id");
      const insertAudit = db.prepare(`INSERT INTO audit_logs
        (id, actor_id, actor_name, action, resource_type, resource_id, before_json, after_json, ip, created_at)
        VALUES (@id, @actorId, @actorName, @action, @resourceType, @resourceId, @beforeJson, @afterJson, @ip, @createdAt)`);
      const repaired = candidates.map((project, index) => {
        const before = { objective: project.objective, description: project.description };
        const after = { objective: project.description, description: project.description };
        updateObjective.run({ id: project.id, objective: project.description });
        const auditId = `AUD-MIGRATION-${Date.now()}-${index + 1}`;
        insertAudit.run({
          id: auditId,
          actorId: ACTOR_ID,
          actorName: ACTOR_NAME,
          action: ACTION,
          resourceType: "project",
          resourceId: project.id,
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify({ ...after, migrationId: MIGRATION_ID, reason: "Historical migration backfill repair" }),
          ip: null,
          createdAt: new Date().toISOString(),
        });
        return { id: project.id, auditId };
      });

      db.prepare("UPDATE schema_migrations SET checksum = @checksum WHERE id = @id")
        .run({ id: MIGRATION_ID, checksum });
      const remaining = Number(db.prepare(`SELECT COUNT(*) AS count FROM projects
        WHERE COALESCE(TRIM(objective), '') = '' AND COALESCE(TRIM(description), '') != ''`).get().count || 0);
      if (remaining !== 0) throw new Error(`Repair verification failed: ${remaining} project objective(s) remain unbackfilled.`);
      db.exec("COMMIT");
      return {
        databaseFile: resolvedDatabaseFile,
        backup,
        migrationId: MIGRATION_ID,
        priorChecksum: migration.checksum,
        alignedChecksum: checksum,
        repaired,
      };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction was not opened */ }
      throw error;
    }
  } finally {
    db.close();
  }
}

function parseArgs(args) {
  const databaseIndex = args.indexOf("--database");
  const backupIndex = args.indexOf("--backup-root");
  return {
    acknowledged: args.includes("--acknowledge"),
    databaseFile: databaseIndex >= 0 ? args[databaseIndex + 1] : undefined,
    backupRoot: backupIndex >= 0 ? args[backupIndex + 1] : undefined,
    invalid: (databaseIndex >= 0 && !args[databaseIndex + 1]) || (backupIndex >= 0 && !args[backupIndex + 1]),
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.acknowledged || args.invalid) {
    console.error("Usage: node scripts/repair-project-objective-migration.js --acknowledge [--database path/to/app.db] [--backup-root path/to/backups]");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(repairProjectObjectiveMigration(args), null, 2));
    } catch (error) {
      console.error(`Project objective migration repair failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = { createBackup, normalizedMigrationChecksum, repairProjectObjectiveMigration };
