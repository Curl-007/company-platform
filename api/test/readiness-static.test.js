const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { checkReadiness } = require("../src/ops/readiness");
const {
  shouldServeWeb,
  resolveWebDist,
  shouldEnableHsts,
  spaContentSecurityPolicyDirectives,
  apiOnlyContentSecurityPolicyDirectives,
} = require("../src/ops/staticWeb");
const { listMigrationFiles, preflightMigrationStatus } = require("../src/ops/migrationStatus");

test("checkReadiness reports database and migration health for sqlite", async () => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const expected = listMigrationFiles(migrationsDir);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    for (const item of expected) {
      db.prepare(
        "INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (@id, @checksum, @at)",
      ).run({ id: item.id, checksum: item.checksum, at: new Date().toISOString() });
    }

    const okReport = await checkReadiness({
      row: async () => ({ ok: 1 }),
      dialect: "sqlite",
      sqliteConnection: db,
      migrationsDir,
    });
    assert.equal(okReport.ok, true);
    assert.equal(okReport.status, "ok");
    assert.equal(okReport.checks.database.ok, true);
    assert.equal(okReport.checks.migrations.ok, true);

    db.prepare("DELETE FROM schema_migrations WHERE id = @id").run({ id: expected[0].id });
    const failReport = await checkReadiness({
      row: async () => ({ ok: 1 }),
      dialect: "sqlite",
      sqliteConnection: db,
      migrationsDir,
    });
    assert.equal(failReport.ok, false);
    assert.equal(failReport.checks.migrations.ok, false);
    assert.ok(failReport.checks.migrations.missingApplied.includes(expected[0].id));

    const dbDown = await checkReadiness({
      row: async () => {
        throw new Error("connection refused");
      },
      dialect: "sqlite",
      sqliteConnection: db,
      migrationsDir,
    });
    assert.equal(dbDown.ok, false);
    assert.equal(dbDown.checks.database.ok, false);
  } finally {
    db.close();
  }
});

test("checkReadiness skips migration ledger for postgres dialect", async () => {
  const report = await checkReadiness({
    row: async () => ({ ok: 1 }),
    dialect: "postgres",
  });
  assert.equal(report.ok, true);
  assert.equal(report.checks.migrations.detail, "skipped_for_postgres");
});

test("shouldServeWeb defaults to production when dist exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-web-dist-"));
  try {
    fs.mkdirSync(path.join(root, "web", "dist"), { recursive: true });
    fs.writeFileSync(path.join(root, "web", "dist", "index.html"), "<html></html>");
    const apiRoot = path.join(root, "api");
    fs.mkdirSync(apiRoot, { recursive: true });

    assert.equal(
      shouldServeWeb({ NODE_ENV: "production" }, { apiRoot, isProd: true }),
      true,
    );
    assert.equal(
      shouldServeWeb({ NODE_ENV: "development" }, { apiRoot, isProd: false }),
      false,
    );
    assert.equal(
      shouldServeWeb({ NODE_ENV: "production", SERVE_WEB: "0" }, { apiRoot, isProd: true }),
      false,
    );
    assert.equal(
      shouldServeWeb({ NODE_ENV: "development", SERVE_WEB: "1" }, { apiRoot, isProd: false }),
      true,
    );
    assert.equal(
      resolveWebDist({ WEB_DIST: path.join(root, "custom") }, { apiRoot }),
      path.resolve(root, "custom"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("SPA CSP is broader than API-only CSP", () => {
  const spa = spaContentSecurityPolicyDirectives();
  const api = apiOnlyContentSecurityPolicyDirectives();
  assert.deepEqual(api.defaultSrc, ["'none'"]);
  assert.ok(spa.scriptSrc.includes("'self'"));
  assert.ok(spa.connectSrc.includes("ws:") || spa.connectSrc.includes("wss:"));
  // Helmet defaults include upgrade-insecure-requests; plain HTTP SPA must disable it.
  assert.equal(spa.upgradeInsecureRequests, null);
  assert.equal(api.upgradeInsecureRequests, null);
});

test("shouldEnableHsts is opt-in only", () => {
  assert.equal(shouldEnableHsts({}), false);
  assert.equal(shouldEnableHsts({ ENABLE_HSTS: "0" }), false);
  assert.equal(shouldEnableHsts({ ENABLE_HSTS: "1" }), true);
  assert.equal(shouldEnableHsts({ ENABLE_HSTS: "true" }), true);
});

test("preflightMigrationStatus still used by readiness path", () => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT);`);
    const report = preflightMigrationStatus(db, migrationsDir);
    assert.equal(report.ok, false);
    assert.ok(report.missingApplied.length > 0);
  } finally {
    db.close();
  }
});
