module.exports = {
  id: "20260713_02_project_version",
  up({ db }) {
    try { db.exec("ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1"); } catch { /* existing schema already has the column */ }
    db.exec("UPDATE projects SET version = 1 WHERE version IS NULL OR version < 1");
  },
};
