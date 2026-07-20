module.exports = {
  id: "20260713_04_requirement_version",
  up({ db }) {
    try { db.exec("ALTER TABLE requirements ADD COLUMN version INTEGER NOT NULL DEFAULT 1"); } catch { /* existing schema already has the column */ }
    db.exec("UPDATE requirements SET version = 1 WHERE version IS NULL OR version < 1");
  },
};
