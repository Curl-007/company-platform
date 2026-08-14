const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createDatabaseRuntime, resolveDatabaseDialect } = require("./src/db/runtime");
const { createAccess } = require("./src/db/access");
const { createDatabaseBootstrap } = require("./src/db/bootstrap");
const { createSeedService } = require("./src/db/seed");
const { CORE_TABLES } = require("./src/db/migrationPreflight");
const { applyCompatibilityColumns, inspectSqliteSchema } = require("./src/db/sqliteSchema");
const { createMappers } = require("./src/db/mappers");
const { createAuditService, sanitizeAuditValue } = require("./src/db/audit");
const { createBurndownService } = require("./src/db/burndown");

// DATABASE_FILE is primarily used by isolated integration tests and local
// environments. Production continues to use the configured persistent volume.
const DB_FILE = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : path.join(__dirname, "app.db");
const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(__dirname, "storage");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const dialect = resolveDatabaseDialect(process.env);
const databaseRuntime = createDatabaseRuntime({
  DatabaseSync,
  databaseFile: DB_FILE,
  env: process.env,
});
const access = createAccess(databaseRuntime);
// SQLite: sync connection. Postgres: null (use async access / pool only).
const db = databaseRuntime.connection;

// Private sync helpers for migrations / seed / init only (sqlite). Public contract is async.
const sync = dialect === "sqlite" ? access._sync : null;
const rowSync = sync ? sync.row : null;
const rowsSync = sync ? sync.rows : null;
const runSync = sync ? sync.run : null;
const insertSync = sync ? sync.insert : null;
const exec = sync ? sync.exec : null;

function json(value, fallback = null) {
  if (value === undefined) return fallback;
  return JSON.stringify(value);
}

function parse(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function now() {
  return new Date().toISOString();
}

const seedService = dialect === "sqlite"
  ? createSeedService({
      db,
      env: process.env,
      insertSync,
      json,
      now,
      rowSync,
      rowsSync,
    })
  : null;

const { initDb } = createDatabaseBootstrap({
  applyCompatibilityColumns,
  coreTables: CORE_TABLES,
  db,
  databaseRuntime,
  dialect,
  exec,
  fs,
  inspectSqliteSchema,
  migrationsDir: MIGRATIONS_DIR,
  now,
  runSync,
  seed: seedService ? seedService.seed : () => undefined,
  storageDir: STORAGE_DIR,
});

async function closeDatabase() {
  if (typeof databaseRuntime.close === "function") {
    await databaseRuntime.close();
  }
}

// Public async access contract (Promise-based). Prefer these at all call sites.
const row = access.row;
const rows = access.rows;
const run = access.run;
const insert = access.insert;
const upsert = access.upsert;
const transaction = access.transaction;

const mappers = createMappers({ parse });
const {
  mapProject,
  mapRequirement,
  mapDocument,
  mapTask,
  mapSprint,
  mapDefect,
  mapTestCase,
  mapTestRun,
  mapUser,
  mapProduct,
  mapBuild,
  mapRelease,
} = mappers;

const { audit, resolveAuditScope } = createAuditService({ row, insert, json, now });
const { recordBurndownSnapshot, buildSprintBurndown } = createBurndownService({ row, rows, upsert, now });

module.exports = {
  db,
  dialect,
  databaseRuntime,
  initDb,
  closeDatabase,
  insert,
  upsert,
  rows,
  row,
  run,
  transaction,
  json,
  parse,
  now,
  audit,
  resolveAuditScope,
  sanitizeAuditValue,
  recordBurndownSnapshot,
  buildSprintBurndown,
  mapProject,
  mapRequirement,
  mapDocument,
  mapTask,
  mapSprint,
  mapDefect,
  mapTestCase,
  mapTestRun,
  mapUser,
  mapProduct,
  mapBuild,
  mapRelease,
  STORAGE_DIR,
};
