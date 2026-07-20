/**
 * Align leave_records + capacity_plans.leave_hours with live app.db / postgres-baseline.
 * Safe on databases that already have the table/column (IF NOT EXISTS / try ALTER).
 */
module.exports = {
  id: "20260720_17_leave_records",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS leave_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        leave_date TEXT NOT NULL,
        hours REAL NOT NULL,
        category TEXT NOT NULL DEFAULT 'annual',
        status TEXT NOT NULL DEFAULT 'submitted',
        reason TEXT DEFAULT '',
        created_by TEXT NOT NULL,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leave_records_status_date ON leave_records(status, leave_date);
      CREATE INDEX IF NOT EXISTS idx_leave_records_user_date ON leave_records(user_id, leave_date DESC);
    `);
    try {
      db.exec("ALTER TABLE capacity_plans ADD COLUMN leave_hours REAL NOT NULL DEFAULT 0");
    } catch {
      /* column already exists */
    }
  },
};
