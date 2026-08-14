const fs = require("fs");
const path = require("path");

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveManifestFile({ exportDirectory, manifestFile }) {
  if (manifestFile) return path.resolve(manifestFile);
  if (exportDirectory) return path.join(path.resolve(exportDirectory), "manifest.json");
  throw new Error("Either --manifest or --dir is required.");
}

function normalizeTableCounts(report) {
  const source = report.tableCounts || report.counts || report.tables;
  if (Array.isArray(source)) {
    return Object.fromEntries(source.map((item) => [item.name || item.table, Number(item.rowCount ?? item.count)]));
  }
  if (source && typeof source === "object") {
    return Object.fromEntries(Object.entries(source).map(([name, count]) => [name, Number(count)]));
  }
  return {};
}

function normalizeMigrations(report) {
  const source = report.appliedMigrations || report.schemaMigrations || report.migrations || [];
  return Array.isArray(source) ? source : [];
}

function migrationKey(item) {
  return `${item.id || item.name || ""}:${item.checksum || ""}`;
}

function reconcileImport({ manifestFile, targetReportFile }) {
  const manifest = readJson(path.resolve(manifestFile));
  const targetReport = readJson(path.resolve(targetReportFile));
  const errors = [];
  const warnings = [];

  const expectedTables = Array.isArray(manifest.tables) ? manifest.tables : [];
  const expectedCounts = Object.fromEntries(expectedTables.map((table) => [table.name, Number(table.rowCount) || 0]));
  const targetCounts = normalizeTableCounts(targetReport);
  const targetTableNames = new Set(Object.keys(targetCounts));

  for (const [tableName, expectedCount] of Object.entries(expectedCounts)) {
    if (!targetTableNames.has(tableName)) {
      errors.push(`Target report is missing table count: ${tableName}`);
      continue;
    }
    const actualCount = targetCounts[tableName];
    if (!Number.isFinite(actualCount)) {
      errors.push(`Target table ${tableName} has a non-numeric count.`);
    } else if (actualCount !== expectedCount) {
      errors.push(`Row count mismatch for ${tableName}: expected ${expectedCount}, got ${actualCount}`);
    }
  }

  const extraTables = [...targetTableNames].filter((tableName) => !Object.prototype.hasOwnProperty.call(expectedCounts, tableName));
  if (extraTables.length) errors.push(`Target report contains tables not present in manifest: ${extraTables.join(", ")}`);

  const expectedMigrations = manifest.postgresImport?.appliedMigrations || [];
  const targetMigrations = normalizeMigrations(targetReport);
  const targetMigrationKeys = new Set(targetMigrations.map(migrationKey));
  for (const migration of expectedMigrations) {
    if (!targetMigrationKeys.has(migrationKey(migration))) {
      errors.push(`Target migrations missing or changed checksum: ${migration.id || migration.name || "<unknown>"}`);
    }
  }

  const violationFields = ["foreignKeyViolations", "referenceViolations", "constraintViolations", "jsonViolations"];
  for (const field of violationFields) {
    if (!Array.isArray(targetReport[field])) {
      errors.push(`Target report is missing ${field} validation data.`);
    } else if (targetReport[field].length) {
      errors.push(`Target report includes ${field}: ${targetReport[field].length}`);
    }
  }

  return {
    ok: errors.length === 0,
    manifestFile: path.resolve(manifestFile),
    targetReportFile: path.resolve(targetReportFile),
    expectedTableCount: expectedTables.length,
    matchedTableCount: Object.keys(expectedCounts).filter((tableName) => targetCounts[tableName] === expectedCounts[tableName]).length,
    expectedRowCount: Object.values(expectedCounts).reduce((sum, count) => sum + count, 0),
    targetRowCount: Object.keys(expectedCounts).reduce((sum, tableName) => sum + (Number(targetCounts[tableName]) || 0), 0),
    expectedMigrationCount: expectedMigrations.length,
    matchedMigrationCount: expectedMigrations.filter((migration) => targetMigrationKeys.has(migrationKey(migration))).length,
    errors,
    warnings,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const targetReportFile = argumentValue(args, "--target-report");
  try {
    if (!targetReportFile) {
      console.error("Usage: node scripts/reconcile-postgres-import.js (--manifest path/to/manifest.json | --dir path/to/export) --target-report path/to/target-report.json [--json]");
      process.exitCode = 2;
    } else {
      const manifestFile = resolveManifestFile({
        exportDirectory: argumentValue(args, "--dir"),
        manifestFile: argumentValue(args, "--manifest"),
      });
      const report = reconcileImport({ manifestFile, targetReportFile });
      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`PostgreSQL import reconciliation: ${report.ok ? "PASS" : "FAIL"}`);
        console.log(`Tables matched: ${report.matchedTableCount}/${report.expectedTableCount}`);
        console.log(`Rows expected/target: ${report.expectedRowCount}/${report.targetRowCount}`);
        console.log(`Migrations matched: ${report.matchedMigrationCount}/${report.expectedMigrationCount}`);
        if (report.warnings.length) console.log(`Warnings: ${report.warnings.join("; ")}`);
        if (report.errors.length) console.log(`Errors: ${report.errors.join("; ")}`);
      }
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`PostgreSQL import reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { reconcileImport };
