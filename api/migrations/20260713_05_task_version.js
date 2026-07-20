module.exports = {
  id: "20260713_05_task_version",
  up({ db }) {
    try { db.exec("ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1"); } catch { /* existing schema already has the column */ }
    db.exec("UPDATE tasks SET version = 1 WHERE version IS NULL OR version < 1");
  },
};
