module.exports = {
  id: "20260713_11_strategy_objective",
  up({ db }) {
    // Programs and portfolios are strategic management entities. Keep their
    // objective separate from name/description so the project hierarchy can
    // be reviewed against an explicit business outcome.
    try { db.exec("ALTER TABLE programs ADD COLUMN objective TEXT NOT NULL DEFAULT ''"); } catch { /* column already exists */ }
    try { db.exec("ALTER TABLE portfolios ADD COLUMN objective TEXT NOT NULL DEFAULT ''"); } catch { /* column already exists */ }
  },
};
