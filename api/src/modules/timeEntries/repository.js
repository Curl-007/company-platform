function createTimeEntriesRepository({ insert, row, rows, run }) {
  return {
    findProject: (id) => row("SELECT id, name FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findTask: (id) => row("SELECT id, project_id FROM tasks WHERE id = @id", { id }),
    listProjects: () => rows("SELECT id, name FROM projects WHERE deleted_at IS NULL"),
    listForUser: ({ userId, periodStart, periodEnd, projectId }) => {
      let sql = "SELECT * FROM time_entries WHERE user_id = @userId";
      const params = { userId };
      if (periodStart) { sql += " AND work_date >= @periodStart"; params.periodStart = periodStart; }
      if (periodEnd) { sql += " AND work_date <= @periodEnd"; params.periodEnd = periodEnd; }
      if (projectId) { sql += " AND project_id = @projectId"; params.projectId = projectId; }
      return rows(`${sql} ORDER BY work_date DESC, created_at DESC`, params);
    },
    findOwned: ({ id, userId }) => row(
      "SELECT * FROM time_entries WHERE id = @id AND user_id = @userId",
      { id, userId },
    ),
    create: (entry) => insert("time_entries", entry),
    update: (entry) => run(
      `UPDATE time_entries SET project_id = @projectId, task_id = @taskId, work_date = @workDate, hours = @hours,
       category = @category, work_nature = @workNature, note = @note, updated_at = @updatedAt WHERE id = @id`,
      entry,
    ),
    delete: (id) => run("DELETE FROM time_entries WHERE id = @id", { id }),
  };
}

module.exports = { createTimeEntriesRepository };
