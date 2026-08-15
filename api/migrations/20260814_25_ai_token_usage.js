module.exports = {
  id: "20260814_25_ai_token_usage",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_token_usage (
        id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        job_id TEXT,
        capability_id TEXT NOT NULL,
        capability_version TEXT NOT NULL,
        project_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        model TEXT,
        wire_api TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_token_usage_project_created
        ON ai_token_usage(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_token_usage_capability_created
        ON ai_token_usage(capability_id, created_at DESC);
    `);
  },
};
