const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION_ID = "20260713_09_project_objective";

function normalizedMigrationChecksum() {
  const migrationFile = path.resolve(__dirname, "..", "migrations", `${MIGRATION_ID}.js`);
  return crypto.createHash("sha256")
    .update(fs.readFileSync(migrationFile, "utf8").replace(/\r\n/g, "\n"))
    .digest("hex");
}

function verifyProjectObjectiveMigration(databaseFile) {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    const columns = db.prepare("PRAGMA table_info(projects)").all().map((column) => column.name);
    const hasObjective = columns.includes("objective");
    const unbackfilled = hasObjective
      ? Number(db.prepare(`SELECT COUNT(*) AS count FROM projects
          WHERE COALESCE(TRIM(objective), '') = '' AND COALESCE(TRIM(description), '') != ''`).get().count || 0)
      : null;
    const nullObjectives = hasObjective
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM projects WHERE objective IS NULL").get().count || 0)
      : null;
    const migration = db.prepare("SELECT id, checksum, applied_at FROM schema_migrations WHERE id = @id")
      .get({ id: MIGRATION_ID }) || null;
    const expectedChecksum = normalizedMigrationChecksum();
    const checksumMatchesMigration = Boolean(migration && migration.checksum === expectedChecksum);
    return {
      ok: Boolean(migration && checksumMatchesMigration && hasObjective && nullObjectives === 0 && unbackfilled === 0),
      migration,
      expectedChecksum,
      checksumMatchesMigration,
      hasObjective,
      nullObjectives,
      rowsWithDescriptionButNoObjective: unbackfilled,
    };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const databaseArgument = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const databaseFile = path.resolve(databaseArgument || process.env.DATABASE_FILE || path.resolve(__dirname, "..", "app.db"));
  const result = verifyProjectObjectiveMigration(databaseFile);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

module.exports = { normalizedMigrationChecksum, verifyProjectObjectiveMigration };
