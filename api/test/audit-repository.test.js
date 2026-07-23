const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { createAuditRepository } = require("../src/modules/audit/repository");
const { mapAuditLog } = require("../src/modules/audit/routes");
const { sanitizeAuditValue } = require("../db");
const auditScopeMigration = require("../migrations/20260723_20_audit_scope");

test("audit snapshots redact credentials at every nesting level", () => {
  const value = sanitizeAuditValue({
    password_hash: "hash",
    provider: { apiKey: "secret", apiKeyEncrypted: "ciphertext" },
    requests: [{ Authorization: "Bearer token", client_secret: "secret", name: "kept" }],
  });
  assert.deepEqual(value, {
    password_hash: "[REDACTED]",
    provider: { apiKey: "[REDACTED]", apiKeyEncrypted: "[REDACTED]" },
    requests: [{ Authorization: "[REDACTED]", client_secret: "[REDACTED]", name: "kept" }],
  });
});

test("audit repository applies audit filters and excludes page views by default", () => {
  let captured;
  const repository = createAuditRepository({ rows: (sql, params) => { captured = { sql, params }; return []; } });
  repository.listAuditLogs({ actor: "Admin", action: "project", dateFrom: "2026-07-13", keyword: "PRJ" });
  assert.match(captured.sql, /actor_name = @actor/);
  assert.match(captured.sql, /action != 'page\.view'/);
  assert.equal(captured.params.action, "project%");
  assert.equal(captured.params.dateFrom, "2026-07-13T00:00:00.000Z");
  assert.equal(captured.params.keyword, "%PRJ%");
});

test("audit repository scopes by actorId and resourceIds for non-admin isolation", async () => {
  let captured;
  const repository = createAuditRepository({ rows: async (sql, params) => { captured = { sql, params }; return []; } });
  await repository.listAuditLogs({ actorId: "U-1", resourceIds: ["PRJ-1", "PRJ-2"] });
  assert.match(captured.sql, /actor_id = @actorId/);
  assert.match(captured.sql, /resource_id IN \(@resourceIds0, @resourceIds1\)/);
  assert.equal(captured.params.actorId, "U-1");
  assert.equal(captured.params.resourceIds0, "PRJ-1");
});

test("audit repository visibility includes actor, subject user, and accessible projects", async () => {
  let captured;
  const repository = createAuditRepository({ rows: async (sql, params) => { captured = { sql, params }; return []; } });
  await repository.listAuditLogs({ visibility: { actorId: "U-1", projectIds: ["PRJ-1", "PRJ-2"] } });
  assert.match(captured.sql, /actor_id = @viewerActorId/);
  assert.match(captured.sql, /scope_type = 'user' AND subject_user_id = @viewerActorId/);
  assert.match(captured.sql, /scope_type = 'project' AND project_id IN \(@visibleProjectId0, @visibleProjectId1\)/);
  assert.equal(captured.params.viewerActorId, "U-1");
  assert.equal(captured.params.visibleProjectId1, "PRJ-2");
});

test("audit response sanitizes historical snapshots and exposes scope metadata", () => {
  const mapped = mapAuditLog({
    id: "AUD-1",
    actor_id: "U-2",
    actor_name: "Other",
    action: "user.update",
    resource_type: "user",
    resource_id: "U-1",
    before_json: JSON.stringify({ nested: { API_KEY: "legacy-secret" } }),
    after_json: JSON.stringify({ name: "Alice" }),
    scope_type: "user",
    subject_user_id: "U-1",
    created_at: "2026-07-23T00:00:00.000Z",
  }, JSON.parse, sanitizeAuditValue);
  assert.equal(mapped.before.nested.API_KEY, "[REDACTED]");
  assert.equal(mapped.scopeType, "user");
  assert.equal(mapped.subjectUserId, "U-1");
});

test("audit scope migration backfills reliable project and user scopes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audit-scope-"));
  const databaseFile = path.join(directory, "audit.sqlite");
  const db = new DatabaseSync(databaseFile);
  try {
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT NOT NULL,
        resource_type TEXT NOT NULL, resource_id TEXT, before_json TEXT, after_json TEXT,
        ip TEXT, created_at TEXT NOT NULL
      );
      INSERT INTO projects (id) VALUES ('PRJ-1'), ('PRJ-2');
      INSERT INTO users (id) VALUES ('U-1');
      INSERT INTO audit_logs VALUES
        ('A-1', 'U-2', 'Other', 'project.update', 'project', 'PRJ-1', NULL, NULL, NULL, '2026-07-23T00:00:00.000Z'),
        ('A-2', 'U-2', 'Other', 'task.delete', 'task', 'T-1', '{"project_id":"PRJ-2"}', NULL, NULL, '2026-07-23T00:00:01.000Z'),
        ('A-3', 'U-2', 'Other', 'setting.update', 'app_setting', 'x', NULL, NULL, NULL, '2026-07-23T00:00:02.000Z'),
        ('A-4', 'U-2', 'Other', 'user.update', 'user', 'U-1', NULL, NULL, NULL, '2026-07-23T00:00:03.000Z');
    `);
    auditScopeMigration.up({ db });
    const logs = db.prepare("SELECT id, scope_type, project_id, subject_user_id FROM audit_logs ORDER BY id").all().map((item) => ({ ...item }));
    assert.deepEqual(logs, [
      { id: "A-1", scope_type: "project", project_id: "PRJ-1", subject_user_id: null },
      { id: "A-2", scope_type: "project", project_id: "PRJ-2", subject_user_id: null },
      { id: "A-3", scope_type: "global", project_id: null, subject_user_id: null },
      { id: "A-4", scope_type: "user", project_id: null, subject_user_id: "U-1" },
    ]);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_audit_%'").all();
    assert.equal(indexes.some((item) => item.name === "idx_audit_scope_project_created"), true);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
