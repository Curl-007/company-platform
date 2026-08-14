const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ACTOR_ID = "system:data-repair";
const ACTOR_NAME = "Data Repair";
const ACTION = "data.requirement_product_orphan_repair";

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function tableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(\"${String(tableName).replaceAll('"', '""')}\")`).all().map((column) => column.name));
}

function requireColumns(db, requirements) {
  for (const [table, columns] of requirements) {
    const present = tableColumns(db, table);
    const missing = columns.filter((column) => !present.has(column));
    if (missing.length) throw new Error(`Cannot repair ${table}: missing columns ${missing.join(", ")}`);
  }
}

function listOrphanedRequirementProducts(db) {
  return db.prepare(`
    SELECT requirement.id, requirement.title, requirement.product_id, requirement.project_id
      FROM requirements requirement
      LEFT JOIN products product ON product.id = requirement.product_id
     WHERE requirement.product_id IS NOT NULL
       AND requirement.product_id != ''
       AND product.id IS NULL
     ORDER BY requirement.id
  `).all();
}

/**
 * Produce a single-file SQLite snapshot before mutating the source database.
 * VACUUM INTO reads a consistent database image even when the source is in WAL
 * mode, unlike copying only the main database file.
 */
function createBackup(databaseFile, backupRoot) {
  if (!fs.existsSync(databaseFile)) throw new Error(`Database file does not exist: ${databaseFile}`);
  const root = path.resolve(backupRoot || path.join(path.dirname(databaseFile), "backups"));
  fs.mkdirSync(root, { recursive: true });
  const directory = path.join(root, `requirement-product-repair-${timestampForPath()}`);
  fs.mkdirSync(directory, { recursive: false });
  const databaseBackup = path.join(directory, path.basename(databaseFile));
  const source = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    source.exec(`VACUUM INTO ${quoteSqlString(databaseBackup)}`);
  } finally {
    source.close();
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    databaseFile,
    files: [{
      filename: path.basename(databaseBackup),
      bytes: fs.statSync(databaseBackup).size,
      sha256: sha256File(databaseBackup),
    }],
  };
  const manifestFile = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    ...manifest,
    directory,
    databaseFile: databaseBackup,
    sourceDatabaseFile: manifest.databaseFile,
    manifestFile,
  };
}

function repairOrphanedRequirementProducts({ databaseFile, backupRoot, now = () => new Date().toISOString() } = {}) {
  const resolvedDatabaseFile = path.resolve(databaseFile || process.env.DATABASE_FILE || path.resolve(__dirname, "..", "app.db"));
  const inspection = new DatabaseSync(resolvedDatabaseFile, { readOnly: true });
  let candidates;
  try {
    requireColumns(inspection, [
      ["requirements", ["id", "title", "product_id", "project_id"]],
      ["products", ["id"]],
      ["audit_logs", ["id", "actor_id", "actor_name", "action", "resource_type", "resource_id", "before_json", "after_json", "ip", "created_at", "scope_type", "project_id", "subject_user_id"]],
    ]);
    candidates = listOrphanedRequirementProducts(inspection);
  } finally {
    inspection.close();
  }

  if (!candidates.length) {
    return { databaseFile: resolvedDatabaseFile, backup: null, repaired: [], remaining: 0, alreadyClean: true };
  }

  const backup = createBackup(resolvedDatabaseFile, backupRoot);
  const db = new DatabaseSync(resolvedDatabaseFile);
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = listOrphanedRequirementProducts(db);
      const clearProduct = db.prepare(`
        UPDATE requirements
           SET product_id = NULL
         WHERE id = @id
           AND product_id = @productId
           AND NOT EXISTS (SELECT 1 FROM products WHERE id = @productId)
      `);
      const insertAudit = db.prepare(`
        INSERT INTO audit_logs
          (id, actor_id, actor_name, action, resource_type, resource_id, before_json, after_json, ip, created_at, scope_type, project_id, subject_user_id)
        VALUES
          (@id, @actorId, @actorName, @action, @resourceType, @resourceId, @beforeJson, @afterJson, NULL, @createdAt, @scopeType, @projectId, NULL)
      `);
      const repaired = [];
      for (const requirement of current) {
        const changed = clearProduct.run({ id: requirement.id, productId: requirement.product_id }).changes;
        if (!changed) continue;
        const auditId = `AUD-REQ-PRODUCT-REPAIR-${requirement.id}-${Date.now()}-${repaired.length + 1}`;
        const before = { productId: requirement.product_id };
        const after = {
          productId: null,
          reason: "Referenced product no longer exists; preserved the requirement and cleared its optional association.",
        };
        insertAudit.run({
          id: auditId,
          actorId: ACTOR_ID,
          actorName: ACTOR_NAME,
          action: ACTION,
          resourceType: "requirement",
          resourceId: requirement.id,
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify(after),
          createdAt: now(),
          scopeType: requirement.project_id ? "project" : "global",
          projectId: requirement.project_id || null,
        });
        repaired.push({ id: requirement.id, priorProductId: requirement.product_id, auditId });
      }
      const remaining = listOrphanedRequirementProducts(db).length;
      if (remaining) throw new Error(`Repair verification failed: ${remaining} orphaned requirement.product_id value(s) remain.`);
      db.exec("COMMIT");
      return { databaseFile: resolvedDatabaseFile, backup, repaired, remaining, alreadyClean: repaired.length === 0 };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction was not opened */ }
      throw error;
    }
  } finally {
    db.close();
  }
}

function parseArgs(args) {
  const databaseIndex = args.indexOf("--database");
  const backupIndex = args.indexOf("--backup-root");
  return {
    acknowledged: args.includes("--acknowledge"),
    databaseFile: databaseIndex >= 0 ? args[databaseIndex + 1] : undefined,
    backupRoot: backupIndex >= 0 ? args[backupIndex + 1] : undefined,
    invalid: (databaseIndex >= 0 && !args[databaseIndex + 1]) || (backupIndex >= 0 && !args[backupIndex + 1]),
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.acknowledged || args.invalid) {
    console.error("Usage: node scripts/repair-orphaned-requirement-products.js --acknowledge [--database path/to/app.db] [--backup-root path/to/backups]");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(repairOrphanedRequirementProducts(args), null, 2));
    } catch (error) {
      console.error(`Requirement product orphan repair failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  ACTION,
  ACTOR_ID,
  createBackup,
  listOrphanedRequirementProducts,
  repairOrphanedRequirementProducts,
};
