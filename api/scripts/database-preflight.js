const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { preflightDatabase } = require("../src/db/migrationPreflight");
const { preflightMigrationStatus } = require("../src/ops/migrationStatus");
const { preflightSqliteFilesystem } = require("../src/ops/sqliteFsPreflight");

const args = process.argv.slice(2);
const databaseFlag = args.indexOf("--database");
const databaseFile = databaseFlag >= 0
  ? path.resolve(args[databaseFlag + 1] || "")
  : process.env.DATABASE_FILE
    ? path.resolve(process.env.DATABASE_FILE)
    : path.resolve(__dirname, "..", "app.db");
const jsonOutput = args.includes("--json");
const migrationsDir = path.resolve(__dirname, "..", "migrations");

if (databaseFlag >= 0 && !args[databaseFlag + 1]) {
  console.error("Usage: node scripts/database-preflight.js [--database path/to/app.db] [--json]");
  process.exitCode = 2;
} else {
  const fsReport = preflightSqliteFilesystem(
    { ...process.env, DATABASE_FILE: databaseFile, DATABASE_DIALECT: "sqlite" },
    { defaultDatabaseFile: databaseFile },
  );
  if (!fsReport.ok) {
    if (jsonOutput) console.log(JSON.stringify({ databaseFile, ok: false, filesystem: fsReport }, null, 2));
    else {
      console.log("Database migration preflight: FAIL");
      for (const issue of fsReport.issues) console.log(`- [${issue.level}] ${issue.code}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    const db = new DatabaseSync(databaseFile);
    try {
      const data = preflightDatabase(db);
      const migrations = preflightMigrationStatus(db, migrationsDir);
      const ok = Boolean(data.ok && migrations.ok && fsReport.ok);
      const report = {
        databaseFile,
        filesystem: fsReport,
        migrations,
        ...data,
        ok,
      };
      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`Database migration preflight: ${report.ok ? "PASS" : "FAIL"}`);
        console.log(`Tables checked: ${Object.keys(report.counts).length}`);
        console.log(`Reference violations: ${report.referenceViolations.length}`);
        console.log(`JSON violations: ${report.jsonViolations.length}`);
        console.log(`Migrations on disk / applied: ${migrations.diskCount} / ${migrations.appliedCount}`);
        if (migrations.missingApplied.length) {
          console.log(`Missing applied migrations: ${migrations.missingApplied.join(", ")}`);
        }
        if (migrations.checksumMismatches.length) {
          console.log(`Checksum mismatches: ${migrations.checksumMismatches.map((item) => item.id).join(", ")}`);
        }
        if (report.missingTables.length) console.log(`Missing tables: ${report.missingTables.join(", ")}`);
      }
      if (!report.ok) process.exitCode = 1;
    } finally {
      db.close();
    }
  }
}
