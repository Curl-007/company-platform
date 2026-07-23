const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuditRepository } = require("../src/modules/audit/repository");
const { sanitizeAuditValue } = require("../db");

test("audit snapshots redact credentials at every nesting level", () => {
  const value = sanitizeAuditValue({
    password_hash: "hash",
    provider: { apiKey: "secret", apiKeyEncrypted: "ciphertext" },
    requests: [{ authorization: "Bearer token", name: "kept" }],
  });
  assert.deepEqual(value, {
    password_hash: "[REDACTED]",
    provider: { apiKey: "[REDACTED]", apiKeyEncrypted: "[REDACTED]" },
    requests: [{ authorization: "[REDACTED]", name: "kept" }],
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
