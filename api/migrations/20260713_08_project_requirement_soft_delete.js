module.exports = {
  id: "20260713_08_project_requirement_soft_delete",
  up({ db }) {
    try { db.exec("ALTER TABLE projects ADD COLUMN deleted_at TEXT"); } catch { /* existing schema already has the column */ }
    try { db.exec("ALTER TABLE requirements ADD COLUMN deleted_at TEXT"); } catch { /* existing schema already has the column */ }
    db.exec("CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_requirements_deleted_at ON requirements(deleted_at)");
  },
};
