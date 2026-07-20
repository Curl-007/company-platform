module.exports = {
  id: "20260713_07_time_entry_work_nature",
  up({ db }) {
    try { db.exec("ALTER TABLE time_entries ADD COLUMN work_nature TEXT NOT NULL DEFAULT 'unspecified'"); } catch { /* existing schema already has the column */ }
    db.exec("UPDATE time_entries SET work_nature = 'unspecified' WHERE work_nature IS NULL OR work_nature = ''");
  },
};
