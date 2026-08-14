function createTeamRepository({ insert, row, rows, run }) {
  return {
    createUser: (user) => insert("users", user),
    disableUser: (id) => run(
      "UPDATE users SET status = @status WHERE id = @id",
      { id, status: "disabled" },
    ),
    findUserByEmail: (email) => row(
      "SELECT id FROM users WHERE email = @email",
      { email },
    ),
    findOtherUserByEmail: ({ email, id }) => row(
      "SELECT id FROM users WHERE email = @email AND id != @id",
      { email, id },
    ),
    findUserById: (id) => row("SELECT * FROM users WHERE id = @id", { id }),
    listUsers: () => rows("SELECT * FROM users"),
    listTeamUsers: () => rows("SELECT * FROM users ORDER BY created_at DESC"),
    listActiveProjects: () => rows("SELECT * FROM projects WHERE deleted_at IS NULL"),
    listTasks: () => rows("SELECT * FROM tasks"),
    listProjectMembers: () => rows("SELECT * FROM project_members"),
    listActiveRequirements: () => rows("SELECT * FROM requirements WHERE deleted_at IS NULL"),
    listDefects: () => rows("SELECT * FROM defects"),
    listWorkLogs: () => rows("SELECT * FROM work_logs ORDER BY log_date DESC, created_at DESC"),
    listRecentAuditRows: () => rows(
      "SELECT actor_id, actor_name, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 500",
    ),
    updateUserEmail: ({ id, value }) => run(
      "UPDATE users SET email = @val WHERE id = @id",
      { id, val: value },
    ),
    updateUserName: ({ id, value }) => run(
      "UPDATE users SET name = @val WHERE id = @id",
      { id, val: value },
    ),
    updateUserRole: ({ id, value }) => run(
      "UPDATE users SET role = @val WHERE id = @id",
      { id, val: value },
    ),
    updateUserPermissions: ({ id, permissions }) => run(
      "UPDATE users SET permissions = @permissions WHERE id = @id",
      { id, permissions },
    ),
    updateUserStatus: ({ id, value }) => run(
      "UPDATE users SET status = @val WHERE id = @id",
      { id, val: value },
    ),
    updateUserPassword: ({ id, value }) => run(
      "UPDATE users SET password_hash = @val, token_version = token_version + 1 WHERE id = @id",
      { id, val: value },
    ),
    updateUserPhone: ({ id, value }) => run(
      "UPDATE users SET phone = @val WHERE id = @id",
      { id, val: value },
    ),
    updateUserPosition: ({ id, value }) => run(
      "UPDATE users SET position = @val WHERE id = @id",
      { id, val: value },
    ),
    updateUserDepartment: ({ id, department, departmentId }) => run(
      "UPDATE users SET department = @department, department_id = @departmentId WHERE id = @id",
      { id, department, departmentId },
    ),
    updateUserBio: ({ id, value }) => run(
      "UPDATE users SET bio = @val WHERE id = @id",
      { id, val: value },
    ),
  };
}

module.exports = {
  createTeamRepository,
};
