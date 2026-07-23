/**
 * Compare on-disk JS migrations with schema_migrations rows (SQLite).
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MIGRATION_FILE_RE = /^\d+_.+\.js$/;

/**
 * @param {string} migrationsDir
 * @param {{ fsImpl?: typeof fs }} [options]
 * @returns {Array<{ id: string, file: string, checksum: string }>}
 */
function listMigrationFiles(migrationsDir, { fsImpl = fs } = {}) {
  if (!fsImpl.existsSync(migrationsDir)) return [];
  const files = fsImpl
    .readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILE_RE.test(name))
    .sort();
  return files.map((file) => {
    const full = path.join(migrationsDir, file);
    const rawSource = fsImpl.readFileSync(full, "utf8");
    const source = rawSource.replace(/\r\n/g, "\n");
    // Prefer migration.id from module when available; fall back to filename stem.
    let id = path.basename(file, ".js");
    try {
      const migration = require(full);
      if (migration && migration.id) id = String(migration.id);
    } catch {
      /* checksum still useful for applied-file comparison via filename */
    }
    const checksum = crypto.createHash("sha256").update(source).digest("hex");
    return { id, file, checksum };
  });
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} migrationsDir
 * @param {{ fsImpl?: typeof fs, expectedFiles?: Array<{ id: string, file: string, checksum: string }> }} [options]
 * @returns {{
 *   ok: boolean,
 *   missingApplied: string[],
 *   extraApplied: string[],
 *   checksumMismatches: Array<{ id: string, expected: string, actual: string }>,
 *   diskCount: number,
 *   appliedCount: number,
 * }}
 */
function preflightMigrationStatus(db, migrationsDir, options = {}) {
  const expected = options.expectedFiles || listMigrationFiles(migrationsDir, { fsImpl: options.fsImpl || fs });
  let appliedRows = [];
  try {
    appliedRows = db.prepare("SELECT id, checksum FROM schema_migrations ORDER BY id").all();
  } catch (error) {
    return {
      ok: false,
      missingApplied: expected.map((item) => item.id),
      extraApplied: [],
      checksumMismatches: [],
      diskCount: expected.length,
      appliedCount: 0,
      error: error && error.message ? error.message : String(error),
    };
  }

  const appliedMap = new Map(appliedRows.map((row) => [String(row.id), String(row.checksum || "")]));
  const expectedIds = new Set(expected.map((item) => item.id));
  const missingApplied = expected.filter((item) => !appliedMap.has(item.id)).map((item) => item.id);
  const extraApplied = [...appliedMap.keys()].filter((id) => !expectedIds.has(id));
  const checksumMismatches = [];

  for (const item of expected) {
    const actual = appliedMap.get(item.id);
    if (actual === undefined) continue;
    if (actual && actual !== item.checksum) {
      // Allow legacy CRLF checksums that initDb normalizes.
      const full = path.join(migrationsDir, item.file);
      try {
        const fsImpl = options.fsImpl || fs;
        const raw = fsImpl.readFileSync(full, "utf8");
        const legacy = crypto.createHash("sha256").update(raw).digest("hex");
        if (actual === legacy) continue;
      } catch {
        /* treat as mismatch */
      }
      checksumMismatches.push({ id: item.id, expected: item.checksum, actual });
    }
  }

  const ok = missingApplied.length === 0 && checksumMismatches.length === 0;
  return {
    ok,
    missingApplied,
    extraApplied,
    checksumMismatches,
    diskCount: expected.length,
    appliedCount: appliedRows.length,
  };
}

module.exports = {
  listMigrationFiles,
  preflightMigrationStatus,
};
