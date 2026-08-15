module.exports = {
  id: "20260814_26_ai_interactions",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_interactions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        invocation_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        responded_at TEXT,
        responded_by TEXT,
        response TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_status_created
        ON ai_interactions(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_invocation
        ON ai_interactions(invocation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_actor_created
        ON ai_interactions(actor_id, created_at DESC);
    `);
  },
};
