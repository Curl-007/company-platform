module.exports = {
  id: "20260713_12_strategic_goals",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS strategic_goals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        objective TEXT NOT NULL,
        owner TEXT NOT NULL,
        status TEXT NOT NULL,
        period_start TEXT,
        period_end TEXT,
        success_metrics TEXT NOT NULL DEFAULT '[]',
        program_ids TEXT NOT NULL DEFAULT '[]',
        portfolio_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_strategic_goals_status ON strategic_goals(status);
    `);
  },
};
