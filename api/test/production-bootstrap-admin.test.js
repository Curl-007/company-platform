const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const bootstrapScript = path.join(repoRoot, "scripts", "bootstrap-temp-db.js");
const seedKeys = [
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "SEED_PM_PASSWORD",
  "SEED_DEV_PASSWORD",
  "SEED_QA_PASSWORD",
  "SEED_PDM_PASSWORD",
];

function bootstrap(databaseFile, overrides = {}) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_FILE: databaseFile,
    DATABASE_DIALECT: "sqlite",
    SEED_DEMO_DATA: "0",
    ...overrides,
  };
  for (const key of seedKeys) {
    if (!(key in overrides)) delete env[key];
  }
  const result = spawnSync(process.execPath, [bootstrapScript], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

test("production bootstrap creates only the explicitly configured administrator", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-production-admin-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databaseFile = path.join(directory, "app.db");

  bootstrap(databaseFile, {
    SEED_ADMIN_EMAIL: "owner@company.test",
    SEED_ADMIN_PASSWORD: "strong-admin-password",
  });

  const db = new DatabaseSync(databaseFile);
  const users = db.prepare("SELECT id, email, role FROM users ORDER BY id").all().map((user) => ({ ...user }));
  db.close();
  assert.deepEqual(users, [{ id: "USR-ADMIN", email: "owner@company.test", role: "admin" }]);
});

test("production bootstrap does not create a fixed demo administrator", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-production-empty-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databaseFile = path.join(directory, "app.db");

  bootstrap(databaseFile);

  const db = new DatabaseSync(databaseFile);
  const users = db.prepare("SELECT id, email, role FROM users").all().map((user) => ({ ...user }));
  db.close();
  assert.deepEqual(users, []);
});
