module.exports = {
  id: "20260714_13_organization_units",
  up({ db, now }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS org_units (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        parent_id TEXT,
        manager_user_id TEXT,
        responsibilities TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_org_units_parent_id ON org_units(parent_id);
      CREATE INDEX IF NOT EXISTS idx_org_units_status ON org_units(status);
    `);
    try { db.exec("ALTER TABLE users ADD COLUMN department_id TEXT"); } catch { /* existing schema already has the column */ }
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id)");

    const departmentNames = db.prepare(`SELECT DISTINCT TRIM(department) AS name FROM users
      WHERE COALESCE(TRIM(department), '') != ''`).all();
    const findUnit = db.prepare("SELECT id FROM org_units WHERE name = @name");
    const insertUnit = db.prepare(`INSERT INTO org_units
      (id, name, parent_id, manager_user_id, responsibilities, status, created_at, updated_at)
      VALUES (@id, @name, NULL, NULL, '', 'active', @createdAt, @updatedAt)`);
    const bindUsers = db.prepare("UPDATE users SET department_id = @departmentId WHERE TRIM(department) = @name AND department_id IS NULL");
    let sequence = 0;
    for (const item of departmentNames) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      let unit = findUnit.get({ name });
      if (!unit) {
        sequence += 1;
        const stamp = now();
        const id = `ORG-MIG-${Date.now()}-${sequence}`;
        insertUnit.run({ id, name, createdAt: stamp, updatedAt: stamp });
        unit = { id };
      }
      bindUsers.run({ departmentId: unit.id, name });
    }
  },
};
