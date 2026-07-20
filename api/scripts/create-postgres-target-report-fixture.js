const fs = require("fs");
const path = require("path");

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function createTargetReportFixture({ exportDirectory, outputFile }) {
  const manifestFile = path.join(path.resolve(exportDirectory), "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const report = {
    generatedAt: new Date().toISOString(),
    source: "manifest-fixture",
    tableCounts: Object.fromEntries((manifest.tables || []).map((table) => [table.name, table.rowCount])),
    appliedMigrations: manifest.postgresImport?.appliedMigrations || [],
    foreignKeyViolations: [],
    referenceViolations: [],
    constraintViolations: [],
    jsonViolations: [],
  };
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const exportDirectory = argumentValue(args, "--dir");
  const outputFile = argumentValue(args, "--out");
  if (!exportDirectory || !outputFile) {
    console.error("Usage: node scripts/create-postgres-target-report-fixture.js --dir path/to/export --out path/to/target-report.json");
    process.exitCode = 2;
  } else {
    try {
      const report = createTargetReportFixture({ exportDirectory, outputFile });
      console.log(`Wrote PostgreSQL target report fixture with ${Object.keys(report.tableCounts).length} tables: ${path.resolve(outputFile)}`);
    } catch (error) {
      console.error(`Unable to create target report fixture: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = { createTargetReportFixture };
