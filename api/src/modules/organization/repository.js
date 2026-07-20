function createOrganizationRepository({ insert, row, rows, run }) {
  return {
    listUnits() {
      return rows("SELECT * FROM org_units ORDER BY name COLLATE NOCASE");
    },
    findUnit(id) {
      return row("SELECT * FROM org_units WHERE id = @id", { id });
    },
    findUnitByName(name, exceptId = null) {
      return row("SELECT * FROM org_units WHERE name = @name AND (@exceptId IS NULL OR id != @exceptId)", { name, exceptId });
    },
    countChildren(parentId) {
      return Number(row("SELECT COUNT(*) AS count FROM org_units WHERE parent_id = @parentId", { parentId }).count || 0);
    },
    countMembers(unitId) {
      return Number(row("SELECT COUNT(*) AS count FROM users WHERE department_id = @unitId", { unitId }).count || 0);
    },
    findUser(id) {
      return row("SELECT * FROM users WHERE id = @id", { id });
    },
    insertUnit(unit) {
      insert("org_units", unit);
      return this.findUnit(unit.id);
    },
    updateUnit(id, update) {
      run(`UPDATE org_units SET name = @name, parent_id = @parentId, manager_user_id = @managerUserId,
        responsibilities = @responsibilities, status = @status, updated_at = @updatedAt WHERE id = @id`, { id, ...update });
      return this.findUnit(id);
    },
    deleteUnit(id) {
      run("DELETE FROM org_units WHERE id = @id", { id });
    },
    listPeople(unitId = null) {
      return rows(`SELECT * FROM users WHERE (@unitId IS NULL OR department_id = @unitId) ORDER BY name COLLATE NOCASE`, { unitId });
    },
    updateUserDepartment(id, departmentId, departmentName) {
      run("UPDATE users SET department_id = @departmentId, department = @departmentName WHERE id = @id", { id, departmentId, departmentName });
    },
  };
}

module.exports = { createOrganizationRepository };
