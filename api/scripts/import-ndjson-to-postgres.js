/**
 * Import SQLite NDJSON export into PostgreSQL (W2 Wave 4).
 *
 * Pipeline: preflight → export:postgres → verify → [apply schema] → import:postgres
 *   → generate:postgres-target-report → reconcile:postgres-import
 *
 * Does not enable DATABASE_DIALECT=postgres runtime (still fail-closed).
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { createPgPool, maskDatabaseUrl, resolveDatabaseUrl } = require("../src/db/postgres");
const { applyPostgresSchema } = require("./apply-postgres-schema");

const EXPORT_FORMAT = "company-project-management/sqlite-ndjson-export/v1";
const DEFAULT_BATCH_SIZE = 200;

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveConflictTarget(tableName, columns) {
  if (tableName === "app_settings") return "key";
  if (tableName === "ai_jobs") return "job_id";
  if (tableName === "idempotency_keys") {
    return ["actor_id", "operation", "idempotency_key"];
  }
  if (columns.includes("id")) return "id";
  if (columns.includes("job_id")) return "job_id";
  if (columns.includes("key")) return "key";
  return columns[0];
}

function buildInsertSql(tableName, columns, { upsert = false } = {}) {
  const quotedTable = quoteIdentifier(tableName);
  const quotedCols = columns.map(quoteIdentifier);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  let sql = `INSERT INTO ${quotedTable} (${quotedCols.join(", ")}) VALUES (${placeholders.join(", ")})`;
  if (upsert) {
    const target = resolveConflictTarget(tableName, columns);
    if (Array.isArray(target)) {
      const assignments = columns
        .filter((column) => !target.includes(column))
        .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
        .join(", ");
      sql += assignments
        ? ` ON CONFLICT (${target.map(quoteIdentifier).join(", ")}) DO UPDATE SET ${assignments}`
        : ` ON CONFLICT (${target.map(quoteIdentifier).join(", ")}) DO NOTHING`;
    } else {
      // Quote identifiers (reserved words like "key"); do not reuse unquoted buildUpsertSql output.
      const assignments = columns
        .filter((column) => column !== target)
        .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
        .join(", ");
      sql = `INSERT INTO ${quotedTable} (${quotedCols.join(", ")}) VALUES (${placeholders.join(", ")})`;
      sql += assignments
        ? ` ON CONFLICT (${quoteIdentifier(target)}) DO UPDATE SET ${assignments}`
        : ` ON CONFLICT (${quoteIdentifier(target)}) DO NOTHING`;
    }
  }
  return sql;
}

function rowValues(columns, row) {
  return columns.map((column) => {
    if (!Object.prototype.hasOwnProperty.call(row, column)) return null;
    const value = row[column];
    if (value === undefined) return null;
    if (value !== null && typeof value === "object") return JSON.stringify(value);
    return value;
  });
}

async function* readNdjsonRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing NDJSON file: ${filePath}`);
  }
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    if (!line.length) continue;
    lineNo += 1;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON in ${path.basename(filePath)} at line ${lineNo}: ${error.message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`NDJSON row ${lineNo} in ${path.basename(filePath)} is not an object.`);
    }
    yield parsed;
  }
}

async function tableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  return result.rows.map((row) => row.column_name);
}

async function importTable(client, { tableName, filePath, expectedRowCount, batchSize, upsertTables }) {
  const columns = await tableColumns(client, tableName);
  if (!columns.length) {
    throw new Error(`Target table has no columns or does not exist: ${tableName}`);
  }

  const useUpsert = upsertTables.has(tableName);
  const insertSql = buildInsertSql(tableName, columns, { upsert: useUpsert });
  let imported = 0;
  let batch = [];

  async function flush() {
    if (!batch.length) return;
    for (const values of batch) {
      await client.query(insertSql, values);
    }
    imported += batch.length;
    batch = [];
  }

  for await (const row of readNdjsonRows(filePath)) {
    const filtered = {};
    for (const column of columns) {
      if (Object.prototype.hasOwnProperty.call(row, column)) filtered[column] = row[column];
    }
    batch.push(rowValues(columns, filtered));
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  if (Number.isInteger(expectedRowCount) && imported !== expectedRowCount) {
    throw new Error(`Row count mismatch for ${tableName}: expected ${expectedRowCount}, imported ${imported}`);
  }
  return { tableName, imported, columns: columns.length, upsert: useUpsert };
}

/**
 * Deferred reference rules are application-layer only (no SQL FK).
 * After import we count logical orphans the same way preflight does.
 */
async function countDeferredReferenceViolations(client, rules) {
  const violations = [];
  for (const rule of rules || []) {
    const { childTable, childColumn, parentTable, parentColumn } = rule;
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM ${quoteIdentifier(childTable)} child
      WHERE child.${quoteIdentifier(childColumn)} IS NOT NULL
        AND child.${quoteIdentifier(childColumn)}::text <> ''
        AND NOT EXISTS (
          SELECT 1 FROM ${quoteIdentifier(parentTable)} parent
          WHERE parent.${quoteIdentifier(parentColumn)} = child.${quoteIdentifier(childColumn)}
        )`;
    const result = await client.query(sql);
    const count = result.rows[0]?.count || 0;
    if (count) {
      violations.push({
        childTable,
        childColumn,
        parentTable,
        parentColumn,
        count,
        reason: rule.reason || "deferred",
      });
    }
  }
  return violations;
}

async function importNdjsonToPostgres(options = {}) {
  const env = options.env || process.env;
  const connectionString = options.connectionString || resolveDatabaseUrl(env);
  if (!connectionString) {
    throw new Error(
      "A PostgreSQL connection string is required. Pass --connection or set POSTGRES_TARGET_URL / DATABASE_URL.",
    );
  }

  const exportDirectory = path.resolve(options.exportDirectory);
  const manifestFile = path.join(exportDirectory, "manifest.json");
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Missing manifest.json in export directory: ${exportDirectory}`);
  }
  const manifest = options.manifest || readJson(manifestFile);
  if (manifest.format !== EXPORT_FORMAT) {
    throw new Error(`Unsupported export format: ${manifest.format || "<missing>"}`);
  }
  if (!manifest.postgresImport || !Array.isArray(manifest.postgresImport.tableOrder)) {
    throw new Error("manifest.postgresImport.tableOrder is required.");
  }

  const tableMeta = new Map((manifest.tables || []).map((table) => [table.name, table]));
  const tableOrder = manifest.postgresImport.tableOrder;
  const batchSize = Number(options.batchSize || DEFAULT_BATCH_SIZE);
  // app_settings PK is key; schema_migrations may already exist after --apply-schema bookkeeping.
  const upsertTables = new Set(options.upsertTables || ["app_settings", "schema_migrations"]);
  const failOnDeferredViolations = options.failOnDeferredViolations !== false;

  let ownHandle = null;
  let client = options.client || null;
  const tableResults = [];

  try {
    if (options.applySchema) {
      // Prefer export manifest appliedMigrations via NDJSON import of schema_migrations.
      // Do not pre-insert JS migration rows unless the caller opts in.
      await applyPostgresSchema({
        connectionString,
        env,
        Pool: options.Pool,
        baselinePath: options.baselinePath,
        migrationsDir: options.migrationsDir,
        recordJsMigrations: options.recordJsMigrations === true,
        recordBaselineMarker: Boolean(options.recordBaselineMarker),
        client: options.schemaClient,
      });
    }

    if (!client) {
      ownHandle = createPgPool({
        connectionString,
        env,
        Pool: options.Pool,
      });
      client = await ownHandle.connect();
    }

    await client.query("BEGIN");
    try {
      for (const tableName of tableOrder) {
        const meta = tableMeta.get(tableName);
        if (!meta) throw new Error(`manifest.postgresImport.tableOrder references unknown table: ${tableName}`);
        const filePath = path.join(exportDirectory, meta.file || `${tableName}.ndjson`);
        const result = await importTable(client, {
          tableName,
          filePath,
          expectedRowCount: meta.rowCount,
          batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
          upsertTables,
        });
        tableResults.push(result);
      }

      const deferred = await countDeferredReferenceViolations(
        client,
        manifest.postgresImport.deferredReferenceRules || [],
      );
      if (failOnDeferredViolations && deferred.length) {
        throw new Error(
          `Deferred reference violations after import: ${deferred
            .map((item) => `${item.childTable}.${item.childColumn}->${item.parentTable}.${item.parentColumn}=${item.count}`)
            .join("; ")}`,
        );
      }

      await client.query("COMMIT");
      return {
        ok: true,
        exportDirectory,
        connectionStringMasked: maskDatabaseUrl(connectionString),
        tableResults,
        deferredReferenceViolations: deferred,
        importedTables: tableResults.length,
        importedRows: tableResults.reduce((sum, item) => sum + item.imported, 0),
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    }
  } finally {
    if (client && typeof client.release === "function" && ownHandle) {
      client.release();
    }
    if (ownHandle) await ownHandle.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const exportDirectory = argumentValue(args, "--dir") || argumentValue(args, "--export");
  const connectionString = argumentValue(args, "--connection") || resolveDatabaseUrl(process.env);
  const applySchema = args.includes("--apply-schema");
  const batchSize = argumentValue(args, "--batch-size");
  const allowDeferredViolations = args.includes("--allow-deferred-violations");

  if (!exportDirectory) {
    console.error(
      "Usage: node scripts/import-ndjson-to-postgres.js --dir path/to/export [--connection postgres://...] [--apply-schema] [--batch-size 200]",
    );
    process.exitCode = 2;
  } else {
    importNdjsonToPostgres({
      exportDirectory,
      connectionString,
      applySchema,
      batchSize: batchSize ? Number(batchSize) : undefined,
      failOnDeferredViolations: !allowDeferredViolations,
    })
      .then((result) => {
        console.log(
          `Imported ${result.importedRows} rows across ${result.importedTables} tables into ${result.connectionStringMasked}`,
        );
        if (result.deferredReferenceViolations.length) {
          console.log(
            `Deferred reference violations (allowed): ${result.deferredReferenceViolations.length}`,
          );
        }
      })
      .catch((error) => {
        console.error(`PostgreSQL NDJSON import failed: ${error.message}`);
        process.exitCode = 1;
      });
  }
}

module.exports = {
  buildInsertSql,
  importNdjsonToPostgres,
  quoteIdentifier,
  resolveConflictTarget,
  rowValues,
};
