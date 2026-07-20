function createWorkLogsRepository({ insert, row, rows }) {
  return {
    create: (log) => insert("work_logs", log),
    findById: (id) => row("SELECT * FROM work_logs WHERE id = @id", { id }),
    findProjectById: (id) => row("SELECT id, name FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findProjectByName: (name) => row("SELECT id, name FROM projects WHERE name = @name AND deleted_at IS NULL", { name }),
    listForAuthor: ({ authorId, author }) => rows(
      `SELECT * FROM work_logs
       WHERE author_id = @authorId OR (author_id IS NULL AND author = @author)
       ORDER BY created_at DESC`,
      { authorId, author },
    ),
    listTeam: () => rows("SELECT * FROM work_logs ORDER BY log_date DESC, created_at DESC"),
    listWeeklyForAuthor: ({ author, weekKey }) => rows(
      "SELECT * FROM work_logs WHERE author = @author AND week_key = @weekKey ORDER BY log_date ASC, created_at ASC",
      { author, weekKey },
    ),
    listWeeklyForUser: ({ authorId, author, weekKey }) => rows(
      `SELECT * FROM work_logs
       WHERE (author_id = @authorId OR (author_id IS NULL AND author = @author))
         AND week_key = @weekKey
       ORDER BY log_date ASC, created_at ASC`,
      { authorId, author, weekKey },
    ),
    listByWeek: (weekKey) => rows(
      "SELECT * FROM work_logs WHERE week_key = @weekKey ORDER BY log_date ASC, created_at ASC",
      { weekKey },
    ),
  };
}

module.exports = { createWorkLogsRepository };
