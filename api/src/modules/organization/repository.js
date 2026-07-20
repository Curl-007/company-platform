function createOrganizationRepository({ insert, row, rows, run }) {
  return {
    async listUnits() {
      return await rows("SELECT * FROM org_units ORDER BY name COLLATE NOCASE");
    },
    async findUnit(id) {
      return await row("SELECT * FROM org_units WHERE id = @id", { id });
    },
    async findUnitByName(name, exceptId = null) {
      return await row("SELECT * FROM org_units WHERE name = @name AND (@exceptId IS NULL OR id != @exceptId)", { name, exceptId });
    },
    async countChildren(parentId) {
      return Number((await row("SELECT COUNT(*) AS count FROM org_units WHERE parent_id = @parentId", { parentId }))?.count || 0);
    },
    async countMembers(unitId) {
      return Number((await row("SELECT COUNT(*) AS count FROM users WHERE department_id = @unitId", { unitId }))?.count || 0);
    },
    async findUser(id) {
      return await row("SELECT * FROM users WHERE id = @id", { id });
    },
    async insertUnit(unit) {
      await insert("org_units", unit);
      return this.findUnit(unit.id);
    },
    async updateUnit(id, update) {
      await run(`UPDATE org_units SET name = @name, parent_id = @parentId, manager_user_id = @managerUserId,
        responsibilities = @responsibilities, status = @status, updated_at = @updatedAt WHERE id = @id`, { id, ...update });
      return this.findUnit(id);
    },
    async deleteUnit(id) {
      await run("DELETE FROM org_units WHERE id = @id", { id });
    },
    async listPeople(unitId = null) {
      return await rows(`SELECT * FROM users WHERE (@unitId IS NULL OR department_id = @unitId) ORDER BY name COLLATE NOCASE`, { unitId });
    },
    async updateUserDepartment(id, departmentId, departmentName) {
      await run("UPDATE users SET department_id = @departmentId, department = @departmentName WHERE id = @id", { id, departmentId, departmentName });
    },
  };
}

module.exports = { createOrganizationRepository };
