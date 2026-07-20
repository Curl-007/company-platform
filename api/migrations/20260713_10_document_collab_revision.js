module.exports = {
  id: "20260713_10_document_collab_revision",
  up({ db }) {
    try { db.exec("ALTER TABLE documents ADD COLUMN collab_revision INTEGER NOT NULL DEFAULT 0"); } catch { /* existing schema already has the column */ }
  },
};
