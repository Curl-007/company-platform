module.exports = {
  id: "20260814_24_ai_capability_invocations",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_capability_invocations (
        id TEXT PRIMARY KEY,
        capability_id TEXT NOT NULL,
        capability_version TEXT NOT NULL,
        status TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        assistant_snapshot TEXT NOT NULL,
        provider_snapshot TEXT NOT NULL,
        manifest_snapshot TEXT NOT NULL,
        policy_snapshot TEXT NOT NULL,
        input_snapshot TEXT NOT NULL,
        execution_snapshot TEXT NOT NULL,
        result_snapshot TEXT,
        harness_events TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_capability_invocations_project_created
        ON ai_capability_invocations(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_capability_invocations_actor_created
        ON ai_capability_invocations(actor_id, created_at DESC);
    `);
  },
};
