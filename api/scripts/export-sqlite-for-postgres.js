const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { REFERENCE_RULES, preflightDatabase } = require("../src/db/migrationPreflight");

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function importPlan(tableNames) {
  const knownTables = new Set(tableNames);
  const applicableRules = REFERENCE_RULES
    .filter(([childTable, , parentTable]) => knownTables.has(childTable) && knownTables.has(parentTable));
  const remaining = new Set(tableNames);
  const ordered = [];
  const deferredReferenceRules = [];
  const dependencies = new Map(tableNames.map((table) => [table, new Set()]));
  for (const [childTable, childColumn, parentTable, parentColumn] of applicableRules) {
    if (childTable === parentTable) {
      deferredReferenceRules.push({ childTable, childColumn, parentTable, parentColumn, reason: "self_reference" });
      continue;
    }
    dependencies.get(childTable).add(parentTable);
  }
  while (remaining.size) {
    const ready = [...remaining].filter((table) => [...dependencies.get(table)].every((dependency) => !remaining.has(dependency))).sort();
    if (ready.length) {
      ready.forEach((table) => { remaining.delete(table); ordered.push(table); });
      continue;
    }
    // SQLite permits logical mutual references. PostgreSQL import must load
    // these rows before adding or validating the matching FK constraints.
    const table = [...remaining].sort()[0];
    for (const dependency of dependencies.get(table)) {
      if (remaining.has(dependency)) {
        applicableRules.filter(([childTable, , parentTable]) => childTable === table && parentTable === dependency)
          .forEach(([childTable, childColumn, parentTable, parentColumn]) => deferredReferenceRules.push({ childTable, childColumn, parentTable, parentColumn, reason: "cyclic_reference" }));
      }
    }
    remaining.delete(table);
    ordered.push(table);
  }
  return { tableOrder: ordered, referenceRules: applicableRules.map(([childTable, childColumn, parentTable, parentColumn]) => ({ childTable, childColumn, parentTable, parentColumn })), deferredReferenceRules };
}

function exportDatabase({ databaseFile, outputDirectory }) {
  if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length > 0) {
    throw new Error(`Export directory must be empty: ${outputDirectory}`);
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tableNames = tables.map((table) => table.name);
    const preflight = preflightDatabase(db, { expectedTables: tableNames });
    if (!preflight.ok) throw new Error("Source database failed export validation; run database preflight and repair violations before exporting.");
    const appliedMigrations = tableNames.includes("schema_migrations")
      ? db.prepare("SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id").all()
      : [];
    const manifest = {
      format: "company-project-management/sqlite-ndjson-export/v1",
      generatedAt: new Date().toISOString(),
      sourceDatabase: path.basename(databaseFile),
      sourceValidation: {
        integrity: preflight.integrity,
        referenceViolations: preflight.referenceViolations,
        jsonViolations: preflight.jsonViolations,
      },
      postgresImport: {
        ...importPlan(tableNames),
        appliedMigrations,
      },
      tables: [],
    };
    for (const table of tables) {
      const safeTable = `"${table.name.replaceAll('"', '""')}"`;
      const rows = db.prepare(`SELECT * FROM ${safeTable} ORDER BY rowid`).all();
      const fileName = `${table.name}.ndjson`;
      const file = path.join(outputDirectory, fileName);
      const content = rows.map((item) => JSON.stringify(item)).join("\n");
      fs.writeFileSync(file, content ? `${content}\n` : "", "utf8");
      manifest.tables.push({
        name: table.name,
        file: fileName,
        rowCount: rows.length,
        sha256: sha256File(file),
        sqliteSchema: table.sql,
      });
    }
    const manifestFile = path.join(outputDirectory, "manifest.json");
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { manifestFile, tableCount: manifest.tables.length };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const output = argumentValue(args, "--out");
  const database = argumentValue(args, "--database") || process.env.DATABASE_FILE || path.resolve(__dirname, "..", "app.db");
  if (!output) {
    console.error("Usage: node scripts/export-sqlite-for-postgres.js --out path/to/empty-export-dir [--database path/to/app.db]");
    process.exitCode = 2;
  } else {
    try {
      const result = exportDatabase({ databaseFile: path.resolve(database), outputDirectory: path.resolve(output) });
      console.log(`Exported ${result.tableCount} tables. Manifest: ${result.manifestFile}`);
    } catch (error) {
      console.error(`SQLite export failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = { exportDatabase };
