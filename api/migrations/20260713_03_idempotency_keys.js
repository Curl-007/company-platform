module.exports = {
  id: "20260713_03_idempotency_keys",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        actor_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_status INTEGER,
        response_body TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (actor_id, operation, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);
    `);
  },
};
