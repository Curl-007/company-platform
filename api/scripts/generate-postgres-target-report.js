const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function resolveManifestFile({ exportDirectory, manifestFile }) {
  if (manifestFile) return path.resolve(manifestFile);
  if (exportDirectory) return path.join(path.resolve(exportDirectory), "manifest.json");
  throw new Error("Either --manifest or --dir is required.");
}

function readManifest(manifestFile) {
  return JSON.parse(fs.readFileSync(path.resolve(manifestFile), "utf8"));
}

function buildTargetReportSql(tableNames) {
  const tableCountPairs = tableNames
    .map((name) => `'${name.replaceAll("'", "''")}', (SELECT COUNT(*) FROM ${quoteIdentifier(name)})`)
    .join(",\n        ");
  return `
WITH target_counts AS (
  SELECT jsonb_build_object(
        ${tableCountPairs || "'__empty__', 0"}
  ) AS table_counts
),
target_migrations AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'checksum', checksum,
    'applied_at', applied_at
  ) ORDER BY id), '[]'::jsonb) AS applied_migrations
  FROM schema_migrations
),
unvalidated_constraints AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'table', c.relname,
    'constraint', con.conname,
    'type', con.contype
  ) ORDER BY n.nspname, c.relname, con.conname), '[]'::jsonb) AS items
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND con.contype IN ('f', 'c')
    AND con.convalidated = false
)
SELECT jsonb_pretty(jsonb_build_object(
  'generatedAt', now(),
  'source', 'postgres-target',
  'tableCounts', (SELECT table_counts FROM target_counts),
  'appliedMigrations', (SELECT applied_migrations FROM target_migrations),
  'foreignKeyViolations', (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM jsonb_array_elements((SELECT items FROM unvalidated_constraints)) AS item
    WHERE item->>'type' = 'f'
  ),
  'referenceViolations', '[]'::jsonb,
  'constraintViolations', (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM jsonb_array_elements((SELECT items FROM unvalidated_constraints)) AS item
    WHERE item->>'type' <> 'f'
  ),
  'jsonViolations', '[]'::jsonb
)) AS report;
`.trim();
}

function runPsqlJson({ connectionString, sql, psqlBin = "psql" }) {
  const result = spawnSync(psqlBin, [connectionString, "--no-align", "--tuples-only", "--quiet", "--command", sql], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `psql exited with status ${result.status}`).trim());
  }
  return JSON.parse(String(result.stdout || "").trim());
}

function generateTargetReport({ connectionString, manifestFile, outputFile, psqlBin = "psql" }) {
  if (!connectionString) {
    throw new Error("A PostgreSQL target connection string is required. Pass --connection or set POSTGRES_TARGET_URL.");
  }
  const manifest = readManifest(manifestFile);
  const tableNames = (manifest.tables || []).map((table) => table.name).filter(Boolean);
  const report = runPsqlJson({ connectionString, sql: buildTargetReportSql(tableNames), psqlBin });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const outputFile = argumentValue(args, "--out");
  const connectionString = argumentValue(args, "--connection") || process.env.POSTGRES_TARGET_URL;
  try {
    if (!outputFile) {
      console.error("Usage: node scripts/generate-postgres-target-report.js (--manifest path/to/manifest.json | --dir path/to/export) --out path/to/target-report.json [--connection postgres://...] [--psql-bin psql]");
      process.exitCode = 2;
    } else {
      const manifestFile = resolveManifestFile({
        exportDirectory: argumentValue(args, "--dir"),
        manifestFile: argumentValue(args, "--manifest"),
      });
      const report = generateTargetReport({
        connectionString,
        manifestFile,
        outputFile,
        psqlBin: argumentValue(args, "--psql-bin") || "psql",
      });
      console.log(`Wrote PostgreSQL target report with ${Object.keys(report.tableCounts || {}).length} tables: ${path.resolve(outputFile)}`);
    }
  } catch (error) {
    console.error(`Unable to generate PostgreSQL target report: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildTargetReportSql,
  generateTargetReport,
  quoteIdentifier,
  runPsqlJson,
};
