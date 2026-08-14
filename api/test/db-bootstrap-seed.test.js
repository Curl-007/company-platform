const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createDatabaseBootstrap } = require("../src/db/bootstrap");
const { createSeedService } = require("../src/db/seed");

test("bootstrap factory retains SQLite baseline, migration ledger, and seed ordering", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "db-bootstrap-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const seeded = [];
  const bootstrap = createDatabaseBootstrap({
    applyCompatibilityColumns() {},
    coreTables: ["users", "schema_migrations"],
    databaseRuntime: {},
    db,
    dialect: "sqlite",
    exec: (sql) => db.exec(sql),
    fs,
    inspectSqliteSchema(database, { requiredTables }) {
      assert.equal(database, db);
      assert.deepEqual(requiredTables, ["users", "schema_migrations"]);
      return { ok: true };
    },
    migrationsDir: path.join(directory, "missing-migrations"),
    now: () => "2026-08-14T00:00:00.000Z",
    runSync: (sql, params = {}) => db.prepare(sql).run(params),
    seed: () => seeded.push("seed"),
    storageDir: path.join(directory, "storage"),
  });

  assert.equal(bootstrap.initDb(), undefined);
  assert.deepEqual(seeded, ["seed"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'workflow_templates'").get().count,
    1,
  );
});

test("bootstrap factory preserves PostgreSQL readiness validation", async () => {
  const queries = [];
  const bootstrap = createDatabaseBootstrap({
    coreTables: ["users", "projects"],
    databaseRuntime: {
      ping: async () => true,
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [{ table_name: "users" }, { table_name: "projects" }] };
      },
    },
    dialect: "postgres",
    fs: { mkdirSync() {} },
    storageDir: "/tmp/storage",
  });

  assert.deepEqual(await bootstrap.initDb(), { dialect: "postgres", seeded: false });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /table_name = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(queries[0].params, [["users", "projects"]]);
});

test("seed factory creates the configured production administrator once and binds a department", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        department TEXT DEFAULT '',
        department_id TEXT
      );
      CREATE TABLE org_units (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        manager_user_id TEXT,
        responsibilities TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const seed = createSeedService({
      db,
      env: {
        NODE_ENV: "production",
        SEED_ADMIN_EMAIL: "owner@company.test",
        SEED_ADMIN_PASSWORD: "strong-admin-password",
        SEED_DEMO_DATA: "0",
      },
      insertSync(table, data) {
        assert.equal(table, "users");
        db.prepare(`
          INSERT INTO users (id, name, email, password_hash, role, permissions, status, created_at)
          VALUES (@id, @name, @email, @password_hash, @role, @permissions, @status, @created_at)
        `).run(data);
      },
      json: JSON.stringify,
      now: () => "2026-08-14T00:00:00.000Z",
      rowSync: (sql, params = {}) => db.prepare(sql).get(params),
      rowsSync: (sql, params = {}) => db.prepare(sql).all(params),
    });

    seed.seed();
    seed.seed();

    const users = db.prepare("SELECT id, email, role, password_hash, department_id FROM users").all();
    assert.equal(users.length, 1);
    assert.equal(users[0].id, "USR-ADMIN");
    assert.equal(users[0].email, "owner@company.test");
    assert.equal(users[0].role, "admin");
    assert.match(users[0].password_hash, /^\$2[aby]\$/);
    assert.ok(users[0].department_id);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM org_units").get().count, 1);
  } finally {
    db.close();
  }
});
