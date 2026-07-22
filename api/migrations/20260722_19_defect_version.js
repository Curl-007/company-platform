module.exports = {
  id: "20260722_19_defect_version",
  up({ db }) {
    try { db.exec("ALTER TABLE defects ADD COLUMN version INTEGER NOT NULL DEFAULT 1"); } catch { /* existing schema already has the column */ }
    db.exec("UPDATE defects SET version = 1 WHERE version IS NULL OR version < 1");
  },
};
