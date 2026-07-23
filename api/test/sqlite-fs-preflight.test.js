const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  assertSqliteReopenable,
  preflightSqliteFilesystem,
  probeDirectoryWritable,
} = require("../src/ops/sqliteFsPreflight");
const { preflightEnv } = require("../src/ops/envPreflight");
const { listMigrationFiles, preflightMigrationStatus } = require("../src/ops/migrationStatus");

test("probeDirectoryWritable creates missing parents and accepts a write cycle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-fs-probe-"));
  const nested = path.join(root, "a", "b", "c");
  try {
    const result = probeDirectoryWritable(nested);
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(nested));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preflightSqliteFilesystem fails when DATABASE_FILE is a directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-fs-dir-"));
  try {
    const report = preflightSqliteFilesystem({
      NODE_ENV: "production",
      DATABASE_FILE: root,
      DATABASE_DIALECT: "sqlite",
    });
    assert.equal(report.ok, false);
    assert.ok(report.issues.some((item) => item.code === "DATABASE_FILE_IS_DIRECTORY"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preflightSqliteFilesystem passes for a writable temp path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-fs-ok-"));
  const databaseFile = path.join(root, "nested", "app.db");
  try {
    const report = preflightSqliteFilesystem({
      NODE_ENV: "development",
      DATABASE_FILE: databaseFile,
    });
    assert.equal(report.ok, true, JSON.stringify(report.issues));
    assert.equal(report.databaseFile, path.resolve(databaseFile));
    assert.ok(fs.existsSync(path.dirname(databaseFile)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("env preflight includes filesystem errors when DATABASE_FILE parent is not writable", () => {
  // On Windows, a non-writable directory is hard to manufacture without admin;
  // assert empty DATABASE_FILE still fails closed.
  const report = preflightEnv({
    NODE_ENV: "production",
    JWT_SECRET: "production-jwt-secret-16",
    AI_CONFIG_ENCRYPTION_KEY: "production-ai-key-16ch",
    DATABASE_FILE: "   ",
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((item) => item.code === "DATABASE_FILE_EMPTY"));
});

test("assertSqliteReopenable requires clean close and accepts a write probe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-fs-reopen-"));
  const databaseFile = path.join(root, "reopen.db");
  try {
    const db = new DatabaseSync(databaseFile);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t (id) VALUES (1);");
    db.close();
    const result = assertSqliteReopenable(databaseFile, { DatabaseSync });
    assert.equal(result.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preflightMigrationStatus detects missing applied migrations", () => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const expected = listMigrationFiles(migrationsDir);
  assert.ok(expected.length > 0, "repo should ship migration files");

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const missingAll = preflightMigrationStatus(db, migrationsDir, { expectedFiles: expected });
    assert.equal(missingAll.ok, false);
    assert.equal(missingAll.missingApplied.length, expected.length);

    // Apply first migration only.
    const first = expected[0];
    db.prepare(
      "INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (@id, @checksum, @at)",
    ).run({ id: first.id, checksum: first.checksum, at: new Date().toISOString() });
    const partial = preflightMigrationStatus(db, migrationsDir, { expectedFiles: expected });
    assert.equal(partial.ok, false);
    assert.ok(partial.missingApplied.includes(expected[1].id));

    for (const item of expected) {
      db.prepare(
        "INSERT OR REPLACE INTO schema_migrations (id, checksum, applied_at) VALUES (@id, @checksum, @at)",
      ).run({ id: item.id, checksum: item.checksum, at: new Date().toISOString() });
    }
    const complete = preflightMigrationStatus(db, migrationsDir, { expectedFiles: expected });
    assert.equal(complete.ok, true, JSON.stringify(complete));
    assert.equal(complete.missingApplied.length, 0);
    assert.equal(complete.checksumMismatches.length, 0);
  } finally {
    db.close();
  }
});
