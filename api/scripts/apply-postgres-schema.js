/**
 * Apply PostgreSQL baseline schema + record schema_migrations for dual-migration path.
 *
 * SQLite continues to use api/db.js initDb + api/migrations/*.js.
 * PostgreSQL empty databases use the final-state baseline SQL, then bookkeeping rows
 * in schema_migrations so export manifest appliedMigrations can be reconciled.
 *
 * Runtime remains fail-closed (DATABASE_DIALECT=postgres not enabled).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createPgPool, maskDatabaseUrl, resolveDatabaseUrl } = require("../src/db/postgres");

const DEFAULT_BASELINE = path.resolve(__dirname, "..", "src", "db", "schema", "postgres-baseline.sql");
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");
const BASELINE_MIGRATION_ID = "postgres_baseline_final";

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function nowIso() {
  return new Date().toISOString();
}

function listMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.js$/.test(file))
    .sort()
    .map((file) => {
      const fullPath = path.join(migrationsDir, file);
      const rawSource = fs.readFileSync(fullPath, "utf8");
      const source = rawSource.replace(/\r\n/g, "\n");
      const mod = require(fullPath);
      if (!mod?.id) throw new Error(`Invalid migration (missing id): ${file}`);
      return {
        id: mod.id,
        file,
        checksum: crypto.createHash("sha256").update(source).digest("hex"),
      };
    });
}

function splitSqlStatements(sqlText) {
  const text = String(sqlText || "");
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "'" && !inDouble) {
      // handle escaped ''
      if (inSingle && next === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (ch === ";" && !inSingle && !inDouble) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) statements.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail && !tail.startsWith("--")) statements.push(tail);
  return statements;
}

function baselineChecksum(baselineSql) {
  return crypto.createHash("sha256").update(String(baselineSql).replace(/\r\n/g, "\n")).digest("hex");
}

async function recordMigrations(client, migrations, { includeBaseline, baselineSql, appliedAt }) {
  const upsert = `
    INSERT INTO schema_migrations (id, checksum, applied_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = EXCLUDED.applied_at
  `;
  const recorded = [];
  if (includeBaseline) {
    const checksum = baselineChecksum(baselineSql);
    await client.query(upsert, [BASELINE_MIGRATION_ID, checksum, appliedAt]);
    recorded.push({ id: BASELINE_MIGRATION_ID, checksum, applied_at: appliedAt });
  }
  for (const migration of migrations) {
    await client.query(upsert, [migration.id, migration.checksum, appliedAt]);
    recorded.push({ id: migration.id, checksum: migration.checksum, applied_at: appliedAt });
  }
  return recorded;
}

/**
 * Apply baseline schema to an empty (or compatible) PostgreSQL database.
 * @param {object} options
 * @param {string} [options.connectionString]
 * @param {string} [options.baselinePath]
 * @param {string} [options.migrationsDir]
 * @param {boolean} [options.recordJsMigrations=true] record 16 JS migration checksums for reconcile
 * @param {boolean} [options.recordBaselineMarker=false] optional baseline marker row
 * @param {object} [options.env]
 * @param {import('pg').Pool} [options.Pool] injectable for tests
 * @param {object} [options.client] injectable client { query, release? }
 */
async function applyPostgresSchema(options = {}) {
  const env = options.env || process.env;
  const connectionString = options.connectionString || resolveDatabaseUrl(env);
  if (!connectionString) {
    throw new Error(
      "A PostgreSQL connection string is required. Pass --connection or set POSTGRES_TARGET_URL / DATABASE_URL.",
    );
  }

  const baselinePath = path.resolve(options.baselinePath || DEFAULT_BASELINE);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline schema file not found: ${baselinePath}`);
  }
  const baselineSql = fs.readFileSync(baselinePath, "utf8");
  const statements = splitSqlStatements(baselineSql);
  if (!statements.length) throw new Error(`Baseline schema is empty: ${baselinePath}`);

  const migrationsDir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);
  const migrations = options.recordJsMigrations === false ? [] : listMigrationFiles(migrationsDir);
  const appliedAt = options.appliedAt || nowIso();

  let ownHandle = null;
  let client = options.client || null;
  try {
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
      for (const statement of statements) {
        await client.query(statement);
      }
      const recorded = await recordMigrations(client, migrations, {
        includeBaseline: Boolean(options.recordBaselineMarker),
        baselineSql,
        appliedAt,
      });
      await client.query("COMMIT");
      return {
        ok: true,
        baselinePath,
        statementCount: statements.length,
        connectionStringMasked: maskDatabaseUrl(connectionString),
        appliedMigrations: recorded,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback errors */
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
  const connectionString = argumentValue(args, "--connection") || resolveDatabaseUrl(process.env);
  const baselinePath = argumentValue(args, "--baseline");
  const migrationsDir = argumentValue(args, "--migrations-dir");
  const recordBaselineMarker = args.includes("--record-baseline-marker");
  const skipJsMigrations = args.includes("--skip-js-migration-records");

  applyPostgresSchema({
    connectionString,
    baselinePath: baselinePath || undefined,
    migrationsDir: migrationsDir || undefined,
    recordBaselineMarker,
    recordJsMigrations: !skipJsMigrations,
  })
    .then((result) => {
      console.log(
        `Applied PostgreSQL baseline (${result.statementCount} statements) to ${result.connectionStringMasked}`,
      );
      console.log(`Recorded ${result.appliedMigrations.length} schema_migrations row(s).`);
    })
    .catch((error) => {
      console.error(`PostgreSQL schema apply failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  BASELINE_MIGRATION_ID,
  DEFAULT_BASELINE,
  applyPostgresSchema,
  baselineChecksum,
  listMigrationFiles,
  splitSqlStatements,
};
