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
