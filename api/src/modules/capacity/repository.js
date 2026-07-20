function createCapacityRepository({ insert, row, rows, run }) {
  return {
    getSetting: (key) => row("SELECT value FROM app_settings WHERE key = @key", { key }),
    saveSetting: (key, value, updatedAt) => run(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
      { key, value, updatedAt },
    ),
    listActiveUsers: (userId) => userId
      ? rows("SELECT * FROM users WHERE id = @id AND status = 'active'", { id: userId })
      : rows("SELECT * FROM users WHERE status = 'active' ORDER BY name"),
    findActiveUser: (id) => row("SELECT id, name FROM users WHERE id = @id AND status = 'active'", { id }),
    listPlans: (period) => rows(
      "SELECT * FROM capacity_plans WHERE period_start = @periodStart AND period_end = @periodEnd",
      period,
    ),
    findPlan: ({ userId, periodStart, periodEnd }) => row(
      "SELECT * FROM capacity_plans WHERE user_id = @userId AND period_start = @periodStart AND period_end = @periodEnd",
      { userId, periodStart, periodEnd },
    ),
    findPlanById: (id) => row("SELECT * FROM capacity_plans WHERE id = @id", { id }),
    upsertPlan: (plan) => insert("capacity_plans", plan),
    listAllocations: (period) => rows(
      "SELECT * FROM project_allocations WHERE period_start = @periodStart AND period_end = @periodEnd",
      period,
    ),
    findAllocationForProject: ({ projectId, userId, periodStart, periodEnd }) => row(
      "SELECT * FROM project_allocations WHERE project_id = @projectId AND user_id = @userId AND period_start = @periodStart AND period_end = @periodEnd",
      { projectId, userId, periodStart, periodEnd },
    ),
    findAllocation: (id) => row("SELECT * FROM project_allocations WHERE id = @id", { id }),
    listOtherAllocations: ({ userId, periodStart, periodEnd, existingId }) => rows(
      `SELECT * FROM project_allocations
       WHERE user_id = @userId AND period_start = @periodStart AND period_end = @periodEnd
       AND id != @existingId`,
      { userId, periodStart, periodEnd, existingId },
    ),
    upsertAllocation: (allocation) => insert("project_allocations", allocation),
    approveAllocation: ({ id, approvedBy, approvedAt, updatedAt }) => run(
      `UPDATE project_allocations
       SET approval_status = 'approved', approved_by = @approvedBy, approved_at = @approvedAt, updated_at = @updatedAt
       WHERE id = @id`,
      { id, approvedBy, approvedAt, updatedAt },
    ),
    deleteAllocation: (id) => run("DELETE FROM project_allocations WHERE id = @id", { id }),
    listTimeEntries: (period) => rows(
      `SELECT user_id, hours, work_nature FROM time_entries
       WHERE work_date >= @periodStart AND work_date <= @periodEnd`,
      period,
    ),
    listInProgressTasks: () => rows(
      `SELECT id, assignee_id, owner FROM tasks
       WHERE status IN ('in_progress', 'blocked', 'code_review', 'testing', 'acceptance')`,
    ),
    listProjects: () => rows("SELECT id, name FROM projects WHERE deleted_at IS NULL"),
    findProject: (id) => row("SELECT id, name, owner FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findProjectMembership: ({ projectId, userId, userName }) => row(
      `SELECT id FROM project_members
       WHERE project_id = @projectId
         AND (user_id = @userId OR (user_id IS NULL AND user_name = @userName))`,
      { projectId, userId, userName },
    ),
    defaultCalendar: () => row("SELECT * FROM work_calendars WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1") ||
      row("SELECT * FROM work_calendars ORDER BY updated_at DESC LIMIT 1"),
    listCalendarExceptions: ({ calendarId, periodStart, periodEnd }) => rows(
      `SELECT * FROM work_calendar_exceptions
       WHERE calendar_id = @calendarId AND calendar_date >= @periodStart AND calendar_date <= @periodEnd
       ORDER BY calendar_date`,
      { calendarId, periodStart, periodEnd },
    ),
    updateCalendar: ({ id, name, workingWeekdays, timezone, updatedAt }) => run(
      "UPDATE work_calendars SET name=@name, working_weekdays=@workingWeekdays, timezone=@timezone, updated_at=@updatedAt WHERE id=@id",
      { id, name, workingWeekdays, timezone, updatedAt },
    ),
    findCalendarException: ({ calendarId, date }) => row(
      "SELECT * FROM work_calendar_exceptions WHERE calendar_id = @calendarId AND calendar_date = @date",
      { calendarId, date },
    ),
    findCalendarExceptionById: (id) => row("SELECT * FROM work_calendar_exceptions WHERE id = @id", { id }),
    upsertCalendarException: (exception) => insert("work_calendar_exceptions", exception),
    deleteCalendarException: (id) => run("DELETE FROM work_calendar_exceptions WHERE id = @id", { id }),
  };
}

module.exports = { createCapacityRepository };
