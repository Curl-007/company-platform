const CORE_TABLES = Object.freeze([
  "users", "org_units", "strategic_goals", "programs", "portfolios", "projects", "products", "requirements", "tasks", "test_cases", "test_runs",
  "documents", "document_chunk", "rag_citation", "objects", "work_logs", "project_members", "capacity_plans", "leave_records", "project_allocations", "time_entries",
  "project_risks", "project_decisions", "ai_jobs", "sprints", "sprint_commitments", "sprint_scope_changes",
  "defects", "audit_logs", "status_histories", "burndown_snapshots", "app_settings", "builds", "releases",
  "release_approvals", "rollback_records", "schema_migrations", "work_calendars", "work_calendar_exceptions", "idempotency_keys",
]);

const REFERENCE_RULES = Object.freeze([
  ["users", "department_id", "org_units", "id"],
  ["org_units", "parent_id", "org_units", "id"],
  ["org_units", "manager_user_id", "users", "id"],
  ["projects", "program_id", "programs", "id"],
  ["projects", "product_id", "products", "id"],
  ["requirements", "project_id", "projects", "id"],
  ["requirements", "product_id", "products", "id"],
  ["requirements", "portfolio_id", "portfolios", "id"],
  ["requirements", "parent_id", "requirements", "id"],
  ["tasks", "project_id", "projects", "id"],
  ["tasks", "requirement_id", "requirements", "id"],
  ["tasks", "parent_id", "tasks", "id"],
  ["tasks", "sprint_id", "sprints", "id"],
  ["tasks", "assignee_id", "users", "id"],
  ["tasks", "build_id", "builds", "id"],
  ["test_cases", "project_id", "projects", "id"],
  ["test_cases", "requirement_id", "requirements", "id"],
  ["test_runs", "test_case_id", "test_cases", "id"],
  ["documents", "project_id", "projects", "id"],
  ["document_chunk", "document_id", "documents", "id"],
  ["document_chunk", "project_id", "projects", "id"],
  ["rag_citation", "document_id", "documents", "id"],
  ["rag_citation", "chunk_id", "document_chunk", "id"],
  ["rag_citation", "project_id", "projects", "id"],
  ["work_logs", "author_id", "users", "id"],
  ["work_logs", "project_id", "projects", "id"],
  ["work_logs", "source_document_id", "documents", "id"],
  ["project_members", "project_id", "projects", "id"],
  ["project_members", "user_id", "users", "id"],
  ["capacity_plans", "user_id", "users", "id"],
  ["project_allocations", "project_id", "projects", "id"],
  ["project_allocations", "user_id", "users", "id"],
  ["time_entries", "project_id", "projects", "id"],
  ["time_entries", "user_id", "users", "id"],
  ["time_entries", "task_id", "tasks", "id"],
  ["project_risks", "project_id", "projects", "id"],
  ["project_decisions", "project_id", "projects", "id"],
  ["sprints", "project_id", "projects", "id"],
  ["sprint_commitments", "sprint_id", "sprints", "id"],
  ["sprint_commitments", "project_id", "projects", "id"],
  ["sprint_scope_changes", "sprint_id", "sprints", "id"],
  ["sprint_scope_changes", "project_id", "projects", "id"],
  ["sprint_scope_changes", "task_id", "tasks", "id"],
  ["defects", "project_id", "projects", "id"],
  ["defects", "requirement_id", "requirements", "id"],
  ["defects", "found_in_build", "builds", "id"],
  ["ai_jobs", "written_requirement_id", "requirements", "id"],
  // ai_jobs.source_id is polymorphic by source_type (document/etc.) and is not checked here.
  ["objects", "created_by", "users", "id"],
  ["rag_citation", "created_by", "users", "id"],
  ["status_histories", "project_id", "projects", "id"],
  ["status_histories", "actor_id", "users", "id"],
  ["burndown_snapshots", "sprint_id", "sprints", "id"],
  ["builds", "project_id", "projects", "id"],
  ["releases", "product_id", "products", "id"],
  ["releases", "build_id", "builds", "id"],
  ["release_approvals", "release_id", "releases", "id"],
  ["rollback_records", "release_id", "releases", "id"],
  ["audit_logs", "actor_id", "users", "id"],
]);

const JSON_COLUMNS = Object.freeze([
  ["users", "permissions"], ["strategic_goals", "success_metrics"], ["strategic_goals", "program_ids"], ["strategic_goals", "portfolio_ids"], ["programs", "project_ids"], ["programs", "risks"], ["portfolios", "product_ids"],
  ["portfolios", "roadmap"], ["projects", "milestones"], ["products", "modules"], ["products", "roadmap"],
  ["requirements", "linked_tasks"], ["requirements", "acceptance_criteria"], ["tasks", "dependency_ids"],
  ["documents", "linked_requirements"], ["documents", "risks"], ["work_logs", "analysis"], ["ai_jobs", "goals"],
  ["ai_jobs", "result"], ["ai_jobs", "evidence"], ["sprint_commitments", "baseline_task_ids"],
  ["builds", "linked_stories"], ["builds", "linked_bugs"], ["releases", "linked_stories"], ["releases", "linked_bugs"],
]);

function quoted(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${quoted(table)})`).all().map((column) => column.name));
}

function preflightDatabase(db, { expectedTables = CORE_TABLES } = {}) {
  const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((item) => item.name));
  const columns = new Map([...tableNames].map((table) => [table, tableColumns(db, table)]));
  const missingTables = expectedTables.filter((table) => !tableNames.has(table));
  const integrityRows = db.prepare("PRAGMA integrity_check").all();
  const integrity = integrityRows.map((item) => item.integrity_check || Object.values(item)[0]);
  const referenceViolations = [];
  const jsonViolations = [];

  for (const [childTable, childColumn, parentTable, parentColumn] of REFERENCE_RULES) {
    if (!tableNames.has(childTable) || !tableNames.has(parentTable) || !columns.get(childTable).has(childColumn) || !columns.get(parentTable).has(parentColumn)) continue;
    const count = db.prepare(
      `SELECT COUNT(*) AS count FROM ${quoted(childTable)} child
       WHERE child.${quoted(childColumn)} IS NOT NULL AND child.${quoted(childColumn)} != ''
         AND NOT EXISTS (SELECT 1 FROM ${quoted(parentTable)} parent WHERE parent.${quoted(parentColumn)} = child.${quoted(childColumn)})`,
    ).get().count;
    if (count) referenceViolations.push({ childTable, childColumn, parentTable, parentColumn, count });
  }
  for (const [table, column] of JSON_COLUMNS) {
    if (!tableNames.has(table) || !columns.get(table).has(column)) continue;
    const values = db.prepare(`SELECT rowid, ${quoted(column)} AS value FROM ${quoted(table)} WHERE ${quoted(column)} IS NOT NULL AND ${quoted(column)} != ''`).all();
    const invalid = values.filter(({ value }) => {
      try { JSON.parse(value); return false; } catch { return true; }
    });
    if (invalid.length) jsonViolations.push({ table, column, count: invalid.length, sampleRowIds: invalid.slice(0, 5).map((item) => item.rowid) });
  }
  const counts = Object.fromEntries([...tableNames].sort().map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${quoted(table)}`).get().count]));
  const foreignKeyRows = db.prepare("PRAGMA foreign_key_check").all();
  const ok = missingTables.length === 0 && integrity.every((value) => value === "ok") && foreignKeyRows.length === 0 && referenceViolations.length === 0 && jsonViolations.length === 0;
  return { ok, integrity, missingTables, foreignKeyViolations: foreignKeyRows, referenceViolations, jsonViolations, counts };
}

module.exports = { CORE_TABLES, REFERENCE_RULES, preflightDatabase };
