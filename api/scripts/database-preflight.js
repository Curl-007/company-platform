const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { preflightDatabase } = require("../src/db/migrationPreflight");

const args = process.argv.slice(2);
const databaseFlag = args.indexOf("--database");
const databaseFile = databaseFlag >= 0
  ? path.resolve(args[databaseFlag + 1] || "")
  : process.env.DATABASE_FILE
    ? path.resolve(process.env.DATABASE_FILE)
    : path.resolve(__dirname, "..", "app.db");
const jsonOutput = args.includes("--json");

if (databaseFlag >= 0 && !args[databaseFlag + 1]) {
  console.error("Usage: node scripts/database-preflight.js [--database path/to/app.db] [--json]");
  process.exitCode = 2;
} else {
  const db = new DatabaseSync(databaseFile);
  try {
    const report = { databaseFile, ...preflightDatabase(db) };
    if (jsonOutput) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Database migration preflight: ${report.ok ? "PASS" : "FAIL"}`);
      console.log(`Tables checked: ${Object.keys(report.counts).length}`);
      console.log(`Reference violations: ${report.referenceViolations.length}`);
      console.log(`JSON violations: ${report.jsonViolations.length}`);
      if (report.missingTables.length) console.log(`Missing tables: ${report.missingTables.join(", ")}`);
    }
    if (!report.ok) process.exitCode = 1;
  } finally {
    db.close();
  }
}
