module.exports = {
  id: "20260814_27_ai_reminders",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_reminders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        message TEXT NOT NULL,
        remind_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        invocation_id TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ai_reminders_status_remind_at
        ON ai_reminders(status, remind_at);
      CREATE INDEX IF NOT EXISTS idx_ai_reminders_project
        ON ai_reminders(project_id);
    `);
  },
};
