module.exports = {
  id: "20260723_22_burndown_snapshot_uniqueness",
  up({ db }) {
    db.exec(`
      DELETE FROM burndown_snapshots
       WHERE rowid NOT IN (
         SELECT MAX(rowid)
           FROM burndown_snapshots
          GROUP BY sprint_id, date
       );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_burndown_snapshots_sprint_date
        ON burndown_snapshots(sprint_id, date);
    `);
  },
};
