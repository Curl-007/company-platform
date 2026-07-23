module.exports = {
  id: "20260723_21_product_images",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_images (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        object_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_object
        ON product_images(object_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_product_sort
        ON product_images(product_id, sort_order);
    `);
  },
};
