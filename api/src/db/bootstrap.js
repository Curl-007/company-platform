const crypto = require("crypto");
const {
  PROJECT_MEMBER_USER_BACKFILL_SQL,
  SQLITE_BASELINE_SCHEMA,
  SQLITE_BOOTSTRAP_INDEXES,
  SQLITE_WORKFLOW_INDEXES,
  SQLITE_WORKFLOW_SCHEMA,
} = require("./sqliteBaseline");

function createDatabaseBootstrap({
  applyCompatibilityColumns,
  coreTables,
  db,
  dialect,
  exec,
  fs,
  inspectSqliteSchema,
  migrationsDir,
  now,
  databaseRuntime,
  runSync,
  seed,
  storageDir,
}) {
  function validateAppliedMigrationChecksums() {
    const ledgerExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    ).get();
    if (!ledgerExists) return;

    const diskMigrations = new Map();
    const files = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter((file) => /^\d+_.+\.js$/.test(file)).sort()
      : [];
    for (const file of files) {
      const filename = require("path").join(migrationsDir, file);
      const migration = require(filename);
      if (!migration?.id || typeof migration.up !== "function") throw new Error("Invalid database migration: " + file);
      if (diskMigrations.has(migration.id)) throw new Error("Duplicate database migration id: " + migration.id);
      const rawSource = fs.readFileSync(filename, "utf8");
      const normalizedSource = rawSource.replace(/\r\n/g, "\n");
      diskMigrations.set(migration.id, {
        normalizedChecksum: crypto.createHash("sha256").update(normalizedSource).digest("hex"),
        legacyChecksum: crypto.createHash("sha256").update(rawSource).digest("hex"),
      });
    }

    const appliedMigrations = db.prepare("SELECT id, checksum FROM schema_migrations ORDER BY id").all();
    for (const applied of appliedMigrations) {
      const expected = diskMigrations.get(applied.id);
      if (!expected) throw new Error("Applied migration file is missing: " + applied.id);
      if (applied.checksum !== expected.normalizedChecksum && applied.checksum !== expected.legacyChecksum) {
        throw new Error("Applied migration was modified: " + applied.id);
      }
    }
  }

  function runMigrations() {
    if (dialect !== "sqlite") {
      throw new Error("runMigrations() is SQLite-only. Apply PostgreSQL schema via npm run apply:postgres-schema -w api.");
    }
    exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL" +
      ");",
    );
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => /^\d+_.+\.js$/.test(file))
      .sort();
    for (const file of files) {
      const filename = require("path").join(migrationsDir, file);
      const migration = require(filename);
      if (!migration?.id || typeof migration.up !== "function") throw new Error("Invalid database migration: " + file);
      const rawSource = fs.readFileSync(filename, "utf8");
      const source = rawSource.replace(/\r\n/g, "\n");
      const checksum = crypto.createHash("sha256").update(source).digest("hex");
      const applied = db.prepare("SELECT checksum FROM schema_migrations WHERE id = @id").get({ id: migration.id });
      if (applied) {
        if (applied.checksum !== checksum) {
          const legacyChecksum = crypto.createHash("sha256").update(rawSource).digest("hex");
          if (applied.checksum !== legacyChecksum) throw new Error("Applied migration was modified: " + migration.id);
          db.prepare("UPDATE schema_migrations SET checksum = @checksum WHERE id = @id").run({ id: migration.id, checksum });
        }
        continue;
      }
      try {
        exec("BEGIN IMMEDIATE");
        migration.up({ db, now });
        db.prepare("INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (@id, @checksum, @appliedAt)")
          .run({ id: migration.id, checksum, appliedAt: now() });
        exec("COMMIT");
      } catch (error) {
        try { exec("ROLLBACK"); } catch { /* transaction was not opened */ }
        throw error;
      }
    }
  }

  async function initDbPostgres() {
    fs.mkdirSync(storageDir, { recursive: true });
    if (typeof databaseRuntime.ping === "function") {
      const ok = await databaseRuntime.ping();
      if (!ok) {
        throw new Error("PostgreSQL ping failed (SELECT 1). Check DATABASE_URL connectivity.");
      }
    }

    const required = [...coreTables];
    const listed = await databaseRuntime.query(
      [
        "SELECT table_name",
        "  FROM information_schema.tables",
        " WHERE table_schema = 'public'",
        "   AND table_name = ANY($1::text[])",
      ].join("\n"),
      [required],
    );
    const present = new Set((listed.rows || []).map((item) => item.table_name));
    const missing = required.filter((name) => !present.has(name));
    if (missing.length) {
      throw new Error(
        "PostgreSQL is missing required tables: " + missing.join(", ") + ". " +
          "Apply baseline schema first: npm run apply:postgres-schema -w api -- --connection $DATABASE_URL " +
          "(see docs/postgresql-migration-runbook.md).",
      );
    }

    return { dialect: "postgres", seeded: false };
  }

  function initDbSqlite() {
    fs.mkdirSync(storageDir, { recursive: true });
    validateAppliedMigrationChecksums();
    exec(SQLITE_BASELINE_SCHEMA);
    applyCompatibilityColumns(db);
    runSync(PROJECT_MEMBER_USER_BACKFILL_SQL);
    for (const statement of SQLITE_BOOTSTRAP_INDEXES) exec(statement);
    exec(SQLITE_WORKFLOW_SCHEMA);
    for (const statement of SQLITE_WORKFLOW_INDEXES) exec(statement);
    runMigrations();
    const schemaReport = inspectSqliteSchema(db, { requiredTables: coreTables });
    if (!schemaReport.ok) {
      throw new Error("SQLite schema readiness failed: " + JSON.stringify(schemaReport));
    }
    seed();
  }

  function initDb() {
    if (dialect === "postgres") {
      return initDbPostgres();
    }
    return initDbSqlite();
  }

  return {
    initDb,
    initDbPostgres,
    initDbSqlite,
    runMigrations,
    validateAppliedMigrationChecksums,
  };
}

module.exports = {
  createDatabaseBootstrap,
};
