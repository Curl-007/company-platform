module.exports = {
  id: "20260713_09_project_objective",
  up({ db }) {
    try { db.exec("ALTER TABLE projects ADD COLUMN objective TEXT DEFAULT ''"); } catch { /* existing schema already has the column */ }
    // Preserve activation eligibility for historical projects while separating
    // the future project objective from free-form delivery descriptions.
    db.exec("UPDATE projects SET objective = COALESCE(NULLIF(TRIM(objective), ''), COALESCE(description, ''))");
  },
};
