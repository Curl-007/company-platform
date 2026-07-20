module.exports = {
  id: "20260713_01_work_calendar",
  up({ db, now }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS work_calendars (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        working_weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
        timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS work_calendar_exceptions (
        id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        calendar_date TEXT NOT NULL,
        is_working_day INTEGER NOT NULL DEFAULT 0,
        name TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_work_calendar_exceptions_date
        ON work_calendar_exceptions(calendar_id, calendar_date);
    `);
    try { db.exec("ALTER TABLE capacity_plans ADD COLUMN use_calendar INTEGER NOT NULL DEFAULT 1"); } catch { /* existing schema already has the column */ }
    db.prepare(
      `INSERT OR IGNORE INTO work_calendars (id, name, working_weekdays, timezone, is_default, created_at, updated_at)
       VALUES (@id, @name, @workingWeekdays, @timezone, 1, @createdAt, @updatedAt)`,
    ).run({ id: "CAL-DEFAULT", name: "默认工作日历", workingWeekdays: "[1,2,3,4,5]", timezone: "Asia/Shanghai", createdAt: now(), updatedAt: now() });
  },
};
