const SQLITE_COMPATIBILITY_COLUMNS = Object.freeze([
  ["test_cases", "description", "TEXT DEFAULT ''"],
  ["test_cases", "steps", "TEXT DEFAULT ''"],
  ["test_cases", "expected_result", "TEXT DEFAULT ''"],
  ["test_cases", "assignee_role", "TEXT"],
  ["tasks", "sprint_id", "TEXT"],
  ["tasks", "assignee_id", "TEXT"],
  ["tasks", "dependency_ids", "TEXT DEFAULT '[]'"],
  ["tasks", "remaining_hours", "REAL DEFAULT 0"],
  ["tasks", "build_id", "TEXT"],
  ["tasks", "description", "TEXT DEFAULT ''"],
  ["tasks", "assignee_role", "TEXT"],
  ["tasks", "source_type", "TEXT"],
  ["tasks", "source_id", "TEXT"],
  ["tasks", "version", "INTEGER NOT NULL DEFAULT 1"],
  ["requirements", "parent_id", "TEXT"],
  ["requirements", "assignee", "TEXT"],
  ["requirements", "assignee_role", "TEXT"],
  ["requirements", "assignment_status", "TEXT DEFAULT 'unassigned'"],
  ["requirements", "version", "INTEGER NOT NULL DEFAULT 1"],
  ["requirements", "deleted_at", "TEXT"],
  ["users", "status", "TEXT NOT NULL DEFAULT 'active'"],
  ["users", "phone", "TEXT DEFAULT ''"],
  ["users", "position", "TEXT DEFAULT ''"],
  ["users", "department", "TEXT DEFAULT ''"],
  ["users", "bio", "TEXT DEFAULT ''"],
  ["users", "department_id", "TEXT"],
  ["ai_jobs", "error_message", "TEXT"],
  ["ai_jobs", "retry_count", "INTEGER DEFAULT 0"],
  ["ai_jobs", "started_at", "TEXT"],
  ["ai_jobs", "failed_at", "TEXT"],
  ["ai_jobs", "rejected_at", "TEXT"],
  ["ai_jobs", "rejected_reason", "TEXT"],
  ["defects", "found_in_build", "TEXT"],
  ["defects", "affected_version", "TEXT"],
  ["defects", "reporter", "TEXT"],
  ["defects", "description", "TEXT DEFAULT ''"],
  ["defects", "version", "INTEGER NOT NULL DEFAULT 1"],
  ["defects", "assignee_role", "TEXT"],
  ["projects", "code", "TEXT"],
  ["projects", "description", "TEXT"],
  ["projects", "start_date", "TEXT"],
  ["projects", "end_date", "TEXT"],
  ["projects", "source_path", "TEXT"],
  ["projects", "version", "INTEGER NOT NULL DEFAULT 1"],
  ["projects", "deleted_at", "TEXT"],
  ["projects", "objective", "TEXT DEFAULT ''"],
  ["products", "description", "TEXT DEFAULT ''"],
  ["products", "image_url", "TEXT"],
  ["products", "system_name", "TEXT DEFAULT ''"],
  ["products", "system_version", "TEXT DEFAULT ''"],
  ["products", "application_version", "TEXT DEFAULT ''"],
  ["products", "hardware_info", "TEXT DEFAULT '{}'"],
  ["products", "system_info", "TEXT DEFAULT '{}'"],
  ["products", "application_info", "TEXT DEFAULT '{}'"],
  ["products", "hardware_metrics", "TEXT DEFAULT '[]'"],
  ["products", "system_metrics", "TEXT DEFAULT '[]'"],
  ["products", "app_metrics", "TEXT DEFAULT '[]'"],
  ["work_logs", "log_date", "TEXT"],
  ["work_logs", "source_document_id", "TEXT"],
  ["work_logs", "file_name", "TEXT"],
  ["work_logs", "file_type", "TEXT"],
  ["work_logs", "week_key", "TEXT"],
  ["work_logs", "weekly_summary", "TEXT"],
  ["work_logs", "role", "TEXT DEFAULT 'dev'"],
  ["work_logs", "project_id", "TEXT"],
  ["work_logs", "author_id", "TEXT"],
  ["documents", "category", "TEXT NOT NULL DEFAULT 'project'"],
  ["documents", "owner_role", "TEXT DEFAULT 'pm'"],
  ["documents", "project_id", "TEXT"],
  ["documents", "collab_revision", "INTEGER NOT NULL DEFAULT 0"],
  ["project_members", "user_id", "TEXT"],
  ["releases", "creator_id", "TEXT"],
  ["capacity_plans", "leave_hours", "REAL NOT NULL DEFAULT 0"],
  ["capacity_plans", "use_calendar", "INTEGER NOT NULL DEFAULT 1"],
  ["time_entries", "work_nature", "TEXT NOT NULL DEFAULT 'unspecified'"],
  ["project_allocations", "overload_reason", "TEXT"],
  ["project_allocations", "approval_status", "TEXT NOT NULL DEFAULT 'approved'"],
  ["project_allocations", "approved_by", "TEXT"],
  ["project_allocations", "approved_at", "TEXT"],
  ["programs", "objective", "TEXT NOT NULL DEFAULT ''"],
  ["portfolios", "objective", "TEXT NOT NULL DEFAULT ''"],
  ["audit_logs", "scope_type", "TEXT NOT NULL DEFAULT 'global'"],
  ["audit_logs", "project_id", "TEXT"],
  ["audit_logs", "subject_user_id", "TEXT"],
]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((item) => item.name));
}

function addColumnIfMissing(db, table, column, definition) {
  if (tableColumns(db, table).has(column)) return false;
  db.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`);
  return true;
}

function applyCompatibilityColumns(db, columns = SQLITE_COMPATIBILITY_COLUMNS) {
  for (const [table, column, definition] of columns) {
    addColumnIfMissing(db, table, column, definition);
  }
}

function requiredColumnMap(columns = SQLITE_COMPATIBILITY_COLUMNS) {
  const result = new Map();
  for (const [table, column] of columns) {
    if (!result.has(table)) result.set(table, new Set());
    result.get(table).add(column);
  }
  return result;
}

function inspectSqliteSchema(db, { requiredTables = [], requiredColumns = SQLITE_COMPATIBILITY_COLUMNS } = {}) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((item) => item.name));
  const missingTables = requiredTables.filter((table) => !tables.has(table));
  const missingColumns = [];
  for (const [table, columns] of requiredColumnMap(requiredColumns)) {
    if (!tables.has(table)) continue;
    const present = tableColumns(db, table);
    for (const column of columns) {
      if (!present.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }
  return { ok: missingTables.length === 0 && missingColumns.length === 0, missingTables, missingColumns };
}

module.exports = {
  SQLITE_COMPATIBILITY_COLUMNS,
  addColumnIfMissing,
  applyCompatibilityColumns,
  inspectSqliteSchema,
  tableColumns,
};
