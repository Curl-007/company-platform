const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXPORT_FORMAT = "company-project-management/sqlite-ndjson-export/v1";

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function verifyExport({ exportDirectory }) {
  const directory = path.resolve(exportDirectory);
  const manifestFile = path.join(directory, "manifest.json");
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Missing manifest.json in export directory: ${directory}`);
  }

  const manifest = readJson(manifestFile);
  const errors = [];
  const warnings = [];
  if (manifest.format !== EXPORT_FORMAT) errors.push(`Unsupported export format: ${manifest.format || "<missing>"}`);
  if (!Array.isArray(manifest.tables)) errors.push("manifest.tables must be an array.");
  if (!manifest.postgresImport || typeof manifest.postgresImport !== "object") errors.push("manifest.postgresImport is required.");

  const tables = Array.isArray(manifest.tables) ? manifest.tables : [];
  const tableNames = new Set();
  for (const table of tables) {
    if (!table?.name) {
      errors.push("Encountered a table entry without a name.");
      continue;
    }
    if (tableNames.has(table.name)) errors.push(`Duplicate table in manifest: ${table.name}`);
    tableNames.add(table.name);
    if (!table.file) errors.push(`Table ${table.name} is missing a file entry.`);
    if (!Number.isInteger(table.rowCount) || table.rowCount < 0) errors.push(`Table ${table.name} has an invalid rowCount.`);
    if (!/^[a-f0-9]{64}$/.test(String(table.sha256 || ""))) errors.push(`Table ${table.name} has an invalid sha256.`);
    if (!table.sqliteSchema) warnings.push(`Table ${table.name} does not include sqliteSchema.`);
  }

  for (const table of tables) {
    if (!table?.file) continue;
    const file = path.join(directory, table.file);
    if (!fs.existsSync(file)) {
      errors.push(`Missing NDJSON file for table ${table.name}: ${table.file}`);
      continue;
    }
    const actualSha = sha256File(file);
    if (actualSha !== table.sha256) errors.push(`SHA-256 mismatch for ${table.file}: expected ${table.sha256}, got ${actualSha}`);
    const content = fs.readFileSync(file, "utf8");
    const lines = content.length ? content.split(/\r?\n/).filter((line) => line.length > 0) : [];
    if (lines.length !== table.rowCount) errors.push(`Row count mismatch for ${table.file}: expected ${table.rowCount}, got ${lines.length}`);
    lines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          errors.push(`NDJSON row ${index + 1} in ${table.file} is not an object.`);
        }
      } catch (error) {
        errors.push(`Invalid JSON in ${table.file} at row ${index + 1}: ${error.message}`);
      }
    });
  }

  const importPlan = manifest.postgresImport || {};
  const tableOrder = Array.isArray(importPlan.tableOrder) ? importPlan.tableOrder : [];
  const orderedSet = new Set(tableOrder);
  if (tableOrder.length !== orderedSet.size) errors.push("postgresImport.tableOrder contains duplicate tables.");
  const missingFromOrder = [...tableNames].filter((name) => !orderedSet.has(name));
  const unknownInOrder = tableOrder.filter((name) => !tableNames.has(name));
  if (missingFromOrder.length) errors.push(`postgresImport.tableOrder is missing tables: ${missingFromOrder.join(", ")}`);
  if (unknownInOrder.length) errors.push(`postgresImport.tableOrder contains unknown tables: ${unknownInOrder.join(", ")}`);

  const allRules = [
    ...(Array.isArray(importPlan.referenceRules) ? importPlan.referenceRules : []),
    ...(Array.isArray(importPlan.deferredReferenceRules) ? importPlan.deferredReferenceRules : []),
  ];
  allRules.forEach((rule, index) => {
    if (!tableNames.has(rule.childTable)) errors.push(`Reference rule ${index + 1} has unknown childTable: ${rule.childTable}`);
    if (!tableNames.has(rule.parentTable)) errors.push(`Reference rule ${index + 1} has unknown parentTable: ${rule.parentTable}`);
    if (!rule.childColumn || !rule.parentColumn) errors.push(`Reference rule ${index + 1} is missing childColumn or parentColumn.`);
  });

  const sourceValidation = manifest.sourceValidation || {};
  if (!Array.isArray(sourceValidation.integrity) || !sourceValidation.integrity.every((item) => item === "ok")) {
    errors.push("Source validation integrity did not pass.");
  }
  if ((sourceValidation.referenceViolations || []).length) errors.push("Source validation includes reference violations.");
  if ((sourceValidation.jsonViolations || []).length) errors.push("Source validation includes JSON violations.");

  return {
    ok: errors.length === 0,
    manifestFile,
    tableCount: tables.length,
    rowCount: tables.reduce((sum, table) => sum + (Number(table.rowCount) || 0), 0),
    errors,
    warnings,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const exportDirectory = argumentValue(args, "--dir") || argumentValue(args, "--export");
  const jsonOutput = args.includes("--json");
  if (!exportDirectory) {
    console.error("Usage: node scripts/verify-postgres-export.js --dir path/to/export [--json]");
    process.exitCode = 2;
  } else {
    try {
      const report = verifyExport({ exportDirectory });
      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`PostgreSQL export verification: ${report.ok ? "PASS" : "FAIL"}`);
        console.log(`Tables checked: ${report.tableCount}`);
        console.log(`Rows checked: ${report.rowCount}`);
        if (report.warnings.length) console.log(`Warnings: ${report.warnings.join("; ")}`);
        if (report.errors.length) console.log(`Errors: ${report.errors.join("; ")}`);
      }
      if (!report.ok) process.exitCode = 1;
    } catch (error) {
      console.error(`PostgreSQL export verification failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = { verifyExport };
