const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildInsertSql,
  importNdjsonToPostgres,
  quoteIdentifier,
  resolveConflictTarget,
  rowValues,
} = require("../scripts/import-ndjson-to-postgres");
const {
  splitSqlStatements,
  listMigrationFiles,
  applyPostgresSchema,
  DEFAULT_BASELINE,
} = require("../scripts/apply-postgres-schema");
const {
  buildUpsertSql,
  translateSqliteToPostgres,
  resolveReplaceConflictTarget,
} = require("../src/db/sql");
const { reconcileImport } = require("../scripts/reconcile-postgres-import");
const { CORE_TABLES, REFERENCE_RULES } = require("../src/db/migrationPreflight");

function postgresBaselineColumns(sql, tableName) {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tableMatch = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${escapedTableName} \\(([\\s\\S]*?)\\n\\);`));
  if (!tableMatch) return null;
  return new Set(
    tableMatch[1]
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .filter(Boolean)
      .filter((line) => !/^(PRIMARY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line))
      .map((line) => line.split(/\s+/)[0]),
  );
}

test("resolveConflictTarget prefers key for app_settings and job_id for ai_jobs", () => {
  assert.equal(resolveConflictTarget("app_settings", ["key", "value", "updated_at"]), "key");
  assert.equal(resolveConflictTarget("ai_jobs", ["job_id", "status"]), "job_id");
  assert.deepEqual(
    resolveConflictTarget("idempotency_keys", ["actor_id", "operation", "idempotency_key", "request_hash"]),
    ["actor_id", "operation", "idempotency_key"],
  );
  assert.equal(resolveConflictTarget("projects", ["id", "name"]), "id");
});

test("buildInsertSql quotes reserved identifiers and upserts app_settings on key", () => {
  const sql = buildInsertSql("app_settings", ["key", "value", "updated_at"], { upsert: true });
  assert.match(sql, /INSERT INTO "app_settings"/);
  assert.match(sql, /ON CONFLICT \("key"\) DO UPDATE/);
  assert.match(sql, /"value" = EXCLUDED\."value"/);
  assert.doesNotMatch(sql, /ON CONFLICT \("id"\)/);
});

test("buildInsertSql plain insert uses positional placeholders", () => {
  const sql = buildInsertSql("projects", ["id", "name"], { upsert: false });
  assert.equal(sql, 'INSERT INTO "projects" ("id", "name") VALUES ($1, $2)');
});

test("rowValues serializes nested objects as JSON text", () => {
  assert.deepEqual(rowValues(["id", "meta", "missing"], { id: "1", meta: { a: 1 } }), [
    "1",
    '{"a":1}',
    null,
  ]);
});

test("quoteIdentifier doubles embedded quotes", () => {
  assert.equal(quoteIdentifier('odd"name'), '"odd""name"');
});

test("sql dialect: COLLATE NOCASE becomes lower() for ORDER BY", () => {
  const sql = translateSqliteToPostgres("SELECT * FROM org_units ORDER BY name COLLATE NOCASE");
  assert.match(sql, /ORDER BY lower\(name\)/i);
  assert.doesNotMatch(sql, /COLLATE\s+NOCASE/i);
});

test("sql dialect: INSERT OR REPLACE into app_settings conflicts on key", () => {
  const sql = translateSqliteToPostgres(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
  );
  assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/i);
  assert.doesNotMatch(sql, /ON CONFLICT \(id\)/i);
});

test("buildUpsertSql defaults conflict target for app_settings to key", () => {
  assert.equal(resolveReplaceConflictTarget("app_settings", ["key", "value"]), "key");
  const built = buildUpsertSql("app_settings", ["key", "value", "updated_at"], { dialect: "postgres" });
  assert.equal(built.conflictTarget, "key");
  assert.match(built.sql, /ON CONFLICT \(key\) DO UPDATE/);
});

test("splitSqlStatements keeps defaults with semicolons inside strings out of split", () => {
  const statements = splitSqlStatements(`
    CREATE TABLE t (id TEXT PRIMARY KEY);
    CREATE TABLE u (note TEXT DEFAULT 'a;b');
    -- comment only
  `);
  assert.equal(statements.length, 2);
  assert.match(statements[1], /DEFAULT 'a;b'/);
});

test("listMigrationFiles discovers current migrations with stable checksums", () => {
  const migrations = listMigrationFiles(path.resolve(__dirname, "..", "migrations"));
  assert.equal(migrations.length, 24);
  assert.equal(migrations[0].id, "20260713_01_work_calendar");
  assert.equal(migrations[migrations.length - 1].id, "20260814_24_ai_capability_invocations");
  assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
});

test("baseline schema file exists without SQL FK or jsonb", () => {
  assert.equal(fs.existsSync(DEFAULT_BASELINE), true);
  const sql = fs.readFileSync(DEFAULT_BASELINE, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_settings/);
  assert.match(sql, /key TEXT PRIMARY KEY/);
  assert.match(sql, /job_id TEXT PRIMARY KEY/);
  assert.match(sql, /PRIMARY KEY \(actor_id, operation, idempotency_key\)/);
  assert.match(sql, /idx_release_approvals_release_approver/);
  assert.match(sql, /WHERE approver_id IS NOT NULL/);
  assert.match(sql, /ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'global'/);
  assert.match(sql, /ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS project_id TEXT/);
  assert.match(sql, /ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS subject_user_id TEXT/);
  assert.match(sql, /idx_audit_scope_project_created/);
  assert.match(sql, /idx_audit_actor_created/);
  assert.match(sql, /idx_audit_subject_created/);
  assert.doesNotMatch(sql, /\bREFERENCES\b/i);
  assert.doesNotMatch(sql, /\bFOREIGN KEY\b/i);
  assert.doesNotMatch(sql, /\bJSONB\b/i);
  assert.doesNotMatch(sql, /\bVECTOR\b/i);
});

test("PostgreSQL baseline covers every migration-preflight table and logical reference endpoint", () => {
  const sql = fs.readFileSync(DEFAULT_BASELINE, "utf8");
  const missingTables = CORE_TABLES.filter((tableName) => !postgresBaselineColumns(sql, tableName));
  assert.deepEqual(missingTables, []);

  const missingReferenceColumns = REFERENCE_RULES.flatMap(([childTable, childColumn, parentTable, parentColumn]) => {
    const childColumns = postgresBaselineColumns(sql, childTable);
    const parentColumns = postgresBaselineColumns(sql, parentTable);
    return [
      !childColumns?.has(childColumn) && `${childTable}.${childColumn}`,
      !parentColumns?.has(parentColumn) && `${parentTable}.${parentColumn}`,
    ].filter(Boolean);
  });
  assert.deepEqual([...new Set(missingReferenceColumns)], []);
});

test("import fails closed without connection string", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-import-noconnect-"));
  try {
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        format: "company-project-management/sqlite-ndjson-export/v1",
        tables: [{ name: "projects", file: "projects.ndjson", rowCount: 0 }],
        postgresImport: { tableOrder: ["projects"], deferredReferenceRules: [] },
      }),
    );
    await assert.rejects(
      () => importNdjsonToPostgres({ exportDirectory: directory, env: {}, connectionString: null }),
      /connection string is required/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("import validates the export manifest before connecting to PostgreSQL", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-import-invalid-export-"));
  try {
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        format: "company-project-management/sqlite-ndjson-export/v1",
        tables: [{ name: "projects", file: "projects.ndjson", rowCount: 1, sha256: "0".repeat(64) }],
        postgresImport: { tableOrder: ["projects"], deferredReferenceRules: [] },
        sourceValidation: { integrity: ["ok"], referenceViolations: [], jsonViolations: [] },
      }),
    );
    fs.writeFileSync(path.join(directory, "projects.ndjson"), '{"id":"P1"}\n');
    let connected = false;
    class UnexpectedPool {
      async connect() {
        connected = true;
        throw new Error("must not connect");
      }
    }
    await assert.rejects(
      () => importNdjsonToPostgres({
        exportDirectory: directory,
        connectionString: "postgres://user:secret@localhost:5432/pm",
        Pool: UnexpectedPool,
      }),
      /PostgreSQL export verification failed: SHA-256 mismatch/,
    );
    assert.equal(connected, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("applyPostgresSchema fails closed without connection string", async () => {
  await assert.rejects(
    () => applyPostgresSchema({ env: {}, connectionString: null }),
    /connection string is required/,
  );
});

test("import tableOrder and SQL generation are compatible with reconcile fixture flow", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-import-order-"));
  try {
    const manifest = {
      format: "company-project-management/sqlite-ndjson-export/v1",
      tables: [
        { name: "users", file: "users.ndjson", rowCount: 1, sha256: "a".repeat(64) },
        { name: "projects", file: "projects.ndjson", rowCount: 1, sha256: "b".repeat(64) },
        { name: "app_settings", file: "app_settings.ndjson", rowCount: 1, sha256: "c".repeat(64) },
      ],
      postgresImport: {
        tableOrder: ["users", "projects", "app_settings"],
        deferredReferenceRules: [
          {
            childTable: "users",
            childColumn: "department_id",
            parentTable: "org_units",
            parentColumn: "id",
            reason: "cyclic_reference",
          },
        ],
        appliedMigrations: [{ id: "20260713_01_work_calendar", checksum: "abc" }],
      },
      sourceValidation: { integrity: ["ok"], referenceViolations: [], jsonViolations: [] },
    };
    fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(directory, "users.ndjson"), `${JSON.stringify({ id: "U1", name: "Ada" })}\n`);
    fs.writeFileSync(path.join(directory, "projects.ndjson"), `${JSON.stringify({ id: "P1", name: "Demo" })}\n`);
    fs.writeFileSync(
      path.join(directory, "app_settings.ndjson"),
      `${JSON.stringify({ key: "k", value: "v", updated_at: "2026-01-01T00:00:00.000Z" })}\n`,
    );

    assert.deepEqual(manifest.postgresImport.tableOrder, ["users", "projects", "app_settings"]);
    assert.equal(manifest.postgresImport.tableOrder.indexOf("users") < manifest.postgresImport.tableOrder.indexOf("projects"), true);

    const insertUsers = buildInsertSql("users", ["id", "name"], { upsert: false });
    const insertSettings = buildInsertSql("app_settings", ["key", "value", "updated_at"], { upsert: true });
    assert.match(insertUsers, /INSERT INTO "users"/);
    assert.match(insertSettings, /ON CONFLICT \("key"\)/);

    const targetReportFile = path.join(directory, "target-report.json");
    fs.writeFileSync(
      targetReportFile,
      JSON.stringify(
        {
          tableCounts: { users: 1, projects: 1, app_settings: 1 },
          appliedMigrations: manifest.postgresImport.appliedMigrations,
          foreignKeyViolations: [],
          referenceViolations: [],
          constraintViolations: [],
          jsonViolations: [],
        },
        null,
        2,
      ),
    );
    const reconciliation = reconcileImport({
      manifestFile: path.join(directory, "manifest.json"),
      targetReportFile,
    });
    assert.equal(reconciliation.ok, true);
    assert.equal(reconciliation.matchedTableCount, 3);
    assert.equal(reconciliation.matchedMigrationCount, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("fake-pool import streams rows by tableOrder and rolls back on mid-table failure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-import-fake-"));
  try {
    const projectsContent = `${JSON.stringify({ id: "P1", name: "One" })}\n${JSON.stringify({ id: "P2", name: "Two" })}\n`;
    const settingsContent = `${JSON.stringify({ key: "theme", value: "dark", updated_at: "t" })}\n`;
    fs.writeFileSync(path.join(directory, "projects.ndjson"), projectsContent);
    fs.writeFileSync(path.join(directory, "app_settings.ndjson"), settingsContent);
    const sha256 = (content) => crypto.createHash("sha256").update(content).digest("hex");
    const manifest = {
      format: "company-project-management/sqlite-ndjson-export/v1",
      tables: [
        { name: "projects", file: "projects.ndjson", rowCount: 2, sha256: sha256(projectsContent), sqliteSchema: "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)" },
        { name: "app_settings", file: "app_settings.ndjson", rowCount: 1, sha256: sha256(settingsContent), sqliteSchema: "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)" },
      ],
      postgresImport: {
        tableOrder: ["projects", "app_settings"],
        deferredReferenceRules: [],
        appliedMigrations: [],
      },
      sourceValidation: { integrity: ["ok"], referenceViolations: [], jsonViolations: [] },
    };
    fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest));

    const queries = [];
    let failOnThirdInsert = false;
    const client = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (/information_schema\.columns/i.test(sql)) {
          const table = params[0];
          if (table === "projects") return { rows: [{ column_name: "id" }, { column_name: "name" }] };
          if (table === "app_settings") {
            return {
              rows: [{ column_name: "key" }, { column_name: "value" }, { column_name: "updated_at" }],
            };
          }
          return { rows: [] };
        }
        if (/^INSERT INTO/i.test(sql)) {
          if (failOnThirdInsert && queries.filter((item) => /^INSERT INTO/i.test(item.sql)).length >= 3) {
            throw new Error("simulated insert failure");
          }
          return { rowCount: 1 };
        }
        if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql)) return { rowCount: 0 };
        if (/SELECT COUNT/i.test(sql)) return { rows: [{ count: 0 }] };
        return { rows: [] };
      },
      release() {},
    };

    class FakePool {
      constructor() {
        this.ended = false;
      }

      async connect() {
        return client;
      }

      async end() {
        this.ended = true;
      }

      async query() {
        return { rows: [] };
      }
    }

    const result = await importNdjsonToPostgres({
      exportDirectory: directory,
      connectionString: "postgres://user:secret@localhost:5432/pm",
      Pool: FakePool,
      batchSize: 1,
    });
    assert.equal(result.ok, true);
    assert.equal(result.importedRows, 3);
    assert.equal(result.importedTables, 2);
    assert.match(result.connectionStringMasked, /\*\*\*/);
    assert.doesNotMatch(result.connectionStringMasked, /secret/);
    assert.ok(queries.some((item) => item.sql === "BEGIN"));
    assert.ok(queries.some((item) => item.sql === "COMMIT"));
    assert.equal(queries.filter((item) => /^INSERT INTO "projects"/i.test(item.sql)).length, 2);
    assert.ok(queries.some((item) => /ON CONFLICT \("key"\)/i.test(item.sql)));

    // Failure path rolls back.
    failOnThirdInsert = true;
    const failQueries = [];
    const failClient = {
      async query(sql, params) {
        failQueries.push({ sql, params });
        if (/information_schema\.columns/i.test(sql)) {
          return { rows: [{ column_name: "id" }, { column_name: "name" }] };
        }
        if (/^INSERT INTO/i.test(sql)) throw new Error("simulated insert failure");
        if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql)) return { rowCount: 0 };
        return { rows: [] };
      },
      release() {},
    };
    class FailPool {
      async connect() {
        return failClient;
      }

      async end() {}

      async query() {
        return { rows: [] };
      }
    }
    await assert.rejects(
      () =>
        importNdjsonToPostgres({
          exportDirectory: directory,
          connectionString: "postgres://user:secret@localhost:5432/pm",
          Pool: FailPool,
	        }),
	      /simulated insert failure/,
	    );
	    assert.ok(failQueries.some((item) => item.sql === "ROLLBACK"));
	  } finally {
	    fs.rmSync(directory, { recursive: true, force: true });
	  }
	});

	test("buildInsertSql with composite conflict target for idempotency_keys generates multi-column ON CONFLICT", () => {
	  const sql = buildInsertSql(
	    "idempotency_keys",
	    ["actor_id", "operation", "idempotency_key", "request_hash", "created_at"],
	    { upsert: true },
	  );
	  assert.match(sql, /INSERT INTO "idempotency_keys"/);
	  assert.match(sql, /ON CONFLICT \("actor_id", "operation", "idempotency_key"\) DO UPDATE/);
	  assert.match(sql, /"request_hash" = EXCLUDED\."request_hash"/);
	  assert.match(sql, /"created_at" = EXCLUDED\."created_at"/);
	  assert.doesNotMatch(sql, /ON CONFLICT \("id"\)/);
	});

	test("buildInsertSql with composite conflict target and no updatable columns emits DO NOTHING", () => {
	  const sql = buildInsertSql("idempotency_keys", ["actor_id", "operation", "idempotency_key"], {
	    upsert: true,
	  });
	  assert.match(sql, /ON CONFLICT \("actor_id", "operation", "idempotency_key"\) DO NOTHING/);
	});

	test("resolveConflictTarget falls back to first column for unknown table without id/job_id/key", () => {
	  assert.equal(resolveConflictTarget("unknown_table", ["code", "label"]), "code");
	  assert.equal(resolveConflictTarget("custom_meta", ["name", "value"]), "name");
	});

	test("rowValues serializes arrays and preserves explicit null over missing properties", () => {
	  const columns = ["id", "tags", "meta", "count", "active", "missing_col"];
	  const row = {
	    id: "R1",
	    tags: ["a", "b"],
	    meta: null,
	    count: 0,
	    active: false,
	  };
	  const result = rowValues(columns, row);
	  assert.equal(result[0], "R1");
	  assert.equal(result[1], '["a","b"]');
	  assert.equal(result[2], null);
	  assert.equal(result[3], 0);
	  assert.equal(result[4], false);
	  assert.equal(result[5], null);
	});

	test("splitSqlStatements handles empty input and comment-only blocks", () => {
	  assert.deepEqual(splitSqlStatements(""), []);
	  assert.deepEqual(splitSqlStatements("  \n  \n"), []);
	  assert.deepEqual(splitSqlStatements("-- just a comment"), []);
	  assert.deepEqual(splitSqlStatements("-- line 1\n-- line 2"), []);
	  const stmts = splitSqlStatements(`
	    CREATE TABLE t (id TEXT);
	    CREATE TABLE u (note TEXT DEFAULT 'a;b');
	    -- trailing only
	  `);
	  assert.equal(stmts.length, 2);
	  assert.match(stmts[0], /CREATE TABLE t/);
	  assert.match(stmts[1], /DEFAULT 'a;b'/);
	});

	test("splitSqlStatements keeps DDL that follows leading header comments", () => {
	  // Regression: baseline.sql starts with `--` banners before schema_migrations.
	  const statements = splitSqlStatements(`
-- PostgreSQL baseline header
-- second comment line

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY
);
`);
	  assert.equal(statements.length, 2);
	  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS schema_migrations/);
	  assert.match(statements[1], /CREATE TABLE IF NOT EXISTS users/);
	  // Real baseline must still surface schema_migrations as first applied DDL.
	  const baseline = fs.readFileSync(DEFAULT_BASELINE, "utf8");
	  const baselineStatements = splitSqlStatements(baseline);
	  assert.ok(baselineStatements.some((sql) => /schema_migrations/i.test(sql)));
	  assert.match(baselineStatements[0], /schema_migrations/i);
	});
