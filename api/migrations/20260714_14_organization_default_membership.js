const DEFAULT_DEPARTMENT_BY_ROLE = Object.freeze({
  admin: "平台管理",
  pm: "项目管理部",
  pdm: "产品部",
  qa: "测试部",
  dev: "研发部",
});

module.exports = {
  id: "20260714_14_organization_default_membership",
  up({ db, now }) {
    const findUnit = db.prepare("SELECT id FROM org_units WHERE name = @name");
    const insertUnit = db.prepare(`INSERT INTO org_units
      (id, name, parent_id, manager_user_id, responsibilities, status, created_at, updated_at)
      VALUES (@id, @name, NULL, NULL, '', 'active', @createdAt, @updatedAt)`);
    const bindUser = db.prepare("UPDATE users SET department_id = @departmentId, department = @name WHERE id = @id");
    const users = db.prepare("SELECT id, role, department FROM users WHERE department_id IS NULL OR TRIM(department_id) = ''").all();
    const units = new Map();
    let sequence = 0;
    for (const user of users) {
      const name = String(user.department || "").trim() || DEFAULT_DEPARTMENT_BY_ROLE[user.role] || DEFAULT_DEPARTMENT_BY_ROLE.dev;
      let unit = units.get(name) || findUnit.get({ name });
      if (!unit) {
        sequence += 1;
        const stamp = now();
        unit = { id: `ORG-DEFAULT-${Date.now()}-${sequence}` };
        insertUnit.run({ id: unit.id, name, createdAt: stamp, updatedAt: stamp });
      }
      units.set(name, unit);
      bindUser.run({ id: user.id, departmentId: unit.id, name });
    }
  },
};
