function createTasksRepository({ insert, row, rows, run }) {
  function listTasks({ keyword, status, projectId, assignee } = {}) {
    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params = {};
    if (keyword) {
      sql += " AND title LIKE @keyword";
      params.keyword = `%${keyword}%`;
    }
    if (status) {
      sql += " AND status = @status";
      params.status = status;
    }
    if (projectId) {
      sql += " AND project_id = @projectId";
      params.projectId = projectId;
    }
    if (assignee) {
      sql += " AND owner = @assignee";
      params.assignee = assignee;
    }
    return rows(`${sql} ORDER BY sort_order`, params);
  }

  return {
    assignTaskToSprint: (id, sprintId) => run("UPDATE tasks SET sprint_id = @sid, version = version + 1 WHERE id = @id", { id, sid: sprintId }),
    createSprint: (sprint) => insert("sprints", sprint),
    createTask: (task) => insert("tasks", task),
    deleteSprint: (id) => run("DELETE FROM sprints WHERE id = @id", { id }),
    deleteTask: (id) => run("DELETE FROM tasks WHERE id = @id", { id }),
    findProject: (id) => row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findProjectId: (id) => row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findRequirementProject: (id) => row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id }),
    findSprint: (id) => row("SELECT * FROM sprints WHERE id = @id", { id }),
    findSprintId: (id) => row("SELECT id, project_id FROM sprints WHERE id = @id", { id }),
    findTask: (id) => row("SELECT * FROM tasks WHERE id = @id", { id }),
    findTaskId: (id) => row("SELECT id, project_id FROM tasks WHERE id = @id", { id }),
    findTaskProject: (id) => row("SELECT project_id FROM tasks WHERE id = @id", { id }),
    findTaskVersion: (id) => row("SELECT version FROM tasks WHERE id = @id", { id }),
    findTaskDependency: (id) => row("SELECT id, project_id FROM tasks WHERE id = @id", { id }),
    findTaskDependencyIds: (id) => row("SELECT dependency_ids FROM tasks WHERE id = @id", { id }),
    findTaskStatus: (id) => row("SELECT id, status FROM tasks WHERE id = @id", { id }),
    listProjectTasks: (projectId) => rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY sort_order", { id: projectId }),
    listProjectTasksByWbs: (projectId) => rows("SELECT * FROM tasks WHERE project_id = @id ORDER BY wbs_code", { id: projectId }),
    listProjectTaskDependencies: (projectId) => rows("SELECT id, dependency_ids FROM tasks WHERE project_id = @projectId", { projectId }),
    listWorkLogsForProjectEvidence: ({ projectId, projectName }) => rows(
      `SELECT * FROM work_logs
       WHERE project_id = @projectId OR (project_id IS NULL AND project = @projectName)
       ORDER BY log_date DESC, created_at DESC`,
      { projectId, projectName: projectName || "" },
    ),
    listSprints: (projectId) => rows("SELECT * FROM sprints WHERE project_id = @projectId", { projectId }),
    listTasks,
    taskCountForSprint: (sprintId) => Number(row("SELECT COUNT(*) AS count FROM tasks WHERE sprint_id = @id", { id: sprintId })?.count || 0),
    updateSprintEndDate: (id, endDate) => run("UPDATE sprints SET end_date = @date WHERE id = @id", { id, date: endDate }),
    updateSprintGoal: (id, goal) => run("UPDATE sprints SET goal = @goal WHERE id = @id", { id, goal }),
    updateSprintName: (id, name) => run("UPDATE sprints SET name = @name WHERE id = @id", { id, name }),
    updateSprintStartDate: (id, startDate) => run("UPDATE sprints SET start_date = @date WHERE id = @id", { id, date: startDate }),
    updateSprintStatus: (id, status) => run("UPDATE sprints SET status = @status WHERE id = @id", { id, status }),
    updateTask: (next) => run(
      `UPDATE tasks SET title=@title, owner=@owner, progress=@progress, status=@status,
       status_text=@statusText, kanban_column=@kanbanColumn, type=@type, estimated_hours=@estimatedHours,
       actual_hours=@actualHours, remaining_hours=@remainingHours, due_date=@dueDate,
       sprint_id=@sprintId, assignee_id=@assigneeId, dependency_ids=@dependencyIds,
       version=version+1 WHERE id=@id AND version=@expectedVersion`,
      next,
    ),
    updateTaskKanban: (next) => run(
      `UPDATE tasks SET kanban_column = @column, status = @column, status_text = @statusText,
       sort_order = @sortOrder, remaining_hours = @remainingHours, progress = @progress,
       version = version + 1 WHERE id = @id AND version = @expectedVersion`,
      next,
    ),
    updateTaskStatus: (next) => run(
      `UPDATE tasks SET status = @status, status_text = @statusText, kanban_column = @status,
       remaining_hours = @remainingHours, progress = @progress, version = version + 1
       WHERE id = @id AND version = @expectedVersion`,
      next,
    ),
  };
}

module.exports = {
  createTasksRepository,
};
