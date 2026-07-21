-- PostgreSQL baseline schema (final column set).
-- Generated for W2 Wave 3 dual-migration path.
-- No SQL foreign keys. JSON columns remain TEXT. No pgvector.
-- SQLite continues to use api/db.js + api/migrations/*.js.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  phone TEXT DEFAULT '',
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  department_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);

CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id TEXT,
  manager_user_id TEXT,
  responsibilities TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_units_status ON org_units(status);
CREATE INDEX IF NOT EXISTS idx_org_units_parent_id ON org_units(parent_id);

CREATE TABLE IF NOT EXISTS strategic_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  success_metrics TEXT NOT NULL DEFAULT '[]',
  program_ids TEXT NOT NULL DEFAULT '[]',
  portfolio_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strategic_goals_status ON strategic_goals(status);

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  progress INTEGER NOT NULL,
  project_ids TEXT NOT NULL,
  risks TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  product_ids TEXT NOT NULL,
  roadmap TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  version TEXT NOT NULL,
  stage TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT,
  system_name TEXT DEFAULT '',
  system_version TEXT DEFAULT '',
  application_version TEXT DEFAULT '',
  modules TEXT NOT NULL,
  hardware_info TEXT DEFAULT '{}',
  system_info TEXT DEFAULT '{}',
  application_info TEXT DEFAULT '{}',
  hardware_metrics TEXT DEFAULT '[]',
  system_metrics TEXT DEFAULT '[]',
  app_metrics TEXT DEFAULT '[]',
  roadmap TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  owner TEXT NOT NULL,
  program_id TEXT,
  product_id TEXT,
  process_mode TEXT NOT NULL,
  progress INTEGER NOT NULL,
  risk_count INTEGER NOT NULL,
  milestones TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  code TEXT,
  description TEXT,
  start_date TEXT,
  end_date TEXT,
  source_path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  objective TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  project_id TEXT,
  product_id TEXT,
  portfolio_id TEXT,
  owner TEXT NOT NULL,
  assignee TEXT,
  assignee_role TEXT,
  assignment_status TEXT DEFAULT 'unassigned',
  completion INTEGER NOT NULL,
  linked_tasks TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  parent_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_requirements_deleted_at ON requirements(deleted_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  status_text TEXT NOT NULL,
  project_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT,
  requirement_id TEXT,
  progress INTEGER NOT NULL,
  blocker TEXT,
  type TEXT NOT NULL,
  parent_id TEXT,
  wbs_code TEXT,
  kanban_column TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  estimated_hours DOUBLE PRECISION NOT NULL,
  actual_hours DOUBLE PRECISION NOT NULL,
  assignee_role TEXT,
  source_type TEXT,
  source_id TEXT,
  sprint_id TEXT,
  assignee_id TEXT,
  dependency_ids TEXT DEFAULT '[]',
  remaining_hours DOUBLE PRECISION DEFAULT 0,
  build_id TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  requirement_id TEXT,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  owner TEXT NOT NULL,
  assignee_role TEXT,
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  blocked_cases INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  steps TEXT DEFAULT '',
  expected_result TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  test_case_id TEXT NOT NULL,
  result TEXT NOT NULL,
  notes TEXT DEFAULT '',
  executed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::text
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'project',
  version TEXT NOT NULL,
  ai_status TEXT NOT NULL,
  owner TEXT NOT NULL,
  owner_role TEXT DEFAULT 'pm',
  project_id TEXT,
  updated_at TEXT NOT NULL,
  linked_requirements TEXT NOT NULL,
  risks TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  storage_key TEXT,
  content TEXT DEFAULT '',
  collab_revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS document_chunk (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  project_id TEXT,
  chunk_index INTEGER NOT NULL,
  section_title TEXT,
  page_no INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  embedding_provider TEXT,
  embedding_model TEXT,
  embedding_vector TEXT,
  indexed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_chunk_project ON document_chunk(project_id);
CREATE INDEX IF NOT EXISTS idx_document_chunk_document ON document_chunk(document_id, chunk_index);

CREATE TABLE IF NOT EXISTS rag_citation (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,
  document_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  project_id TEXT,
  quote TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rag_citation_document ON rag_citation(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_citation_query_created ON rag_citation(query_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  project TEXT,
  content TEXT NOT NULL,
  blockers TEXT,
  next_plan TEXT,
  analysis TEXT NOT NULL,
  created_at TEXT NOT NULL,
  log_date TEXT,
  source_document_id TEXT,
  file_name TEXT,
  file_type TEXT,
  week_key TEXT,
  weekly_summary TEXT,
  role TEXT DEFAULT 'dev',
  project_id TEXT,
  author_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_work_logs_author_id_created_at ON work_logs(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members(project_id, user_id);

CREATE TABLE IF NOT EXISTS capacity_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  working_days DOUBLE PRECISION NOT NULL DEFAULT 5,
  daily_hours DOUBLE PRECISION NOT NULL DEFAULT 8,
  leave_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  meeting_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  training_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  support_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_commitment_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  use_calendar INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_plans_user_period ON capacity_plans(user_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS leave_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  leave_date TEXT NOT NULL,
  hours DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL DEFAULT 'annual',
  status TEXT NOT NULL DEFAULT 'submitted',
  reason TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_records_status_date ON leave_records(status, leave_date);
CREATE INDEX IF NOT EXISTS idx_leave_records_user_date ON leave_records(user_id, leave_date DESC);

CREATE TABLE IF NOT EXISTS project_allocations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  allocation_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  planned_hours DOUBLE PRECISION,
  notes TEXT DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  overload_reason TEXT,
  approval_status TEXT NOT NULL DEFAULT 'approved',
  approved_by TEXT,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_allocations_project_period ON project_allocations(project_id, period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_allocations_user_project_period ON project_allocations(project_id, user_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT,
  work_date TEXT NOT NULL,
  hours DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL DEFAULT 'delivery',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  work_nature TEXT NOT NULL DEFAULT 'unspecified'
);

CREATE INDEX IF NOT EXISTS idx_time_entries_project_date ON time_entries(project_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, work_date DESC);

CREATE TABLE IF NOT EXISTS project_risks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  owner_id TEXT,
  owner_name TEXT,
  mitigation_plan TEXT DEFAULT '',
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_risks_project_status ON project_risks(project_id, status);

CREATE TABLE IF NOT EXISTS project_decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  context TEXT DEFAULT '',
  decision TEXT DEFAULT '',
  owner_id TEXT,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_decisions_project_status ON project_decisions(project_id, status);

CREATE TABLE IF NOT EXISTS ai_jobs (
  job_id TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL,
  current_step TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  goals TEXT NOT NULL,
  result TEXT NOT NULL,
  evidence TEXT NOT NULL,
  written_requirement_id TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  started_at TEXT,
  failed_at TEXT,
  rejected_at TEXT,
  rejected_reason TEXT
);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT
);

CREATE TABLE IF NOT EXISTS sprint_commitments (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  baseline_task_ids TEXT NOT NULL,
  baseline_task_count INTEGER NOT NULL,
  baseline_estimated_hours DOUBLE PRECISION NOT NULL,
  baseline_remaining_hours DOUBLE PRECISION NOT NULL,
  committed_by TEXT,
  committed_by_name TEXT,
  committed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sprint_scope_changes (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT,
  change_type TEXT NOT NULL,
  impact_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sprint_scope_changes_sprint_created ON sprint_scope_changes(sprint_id, created_at DESC);

CREATE TABLE IF NOT EXISTS defects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  project_id TEXT NOT NULL,
  requirement_id TEXT,
  assignee TEXT,
  assignee_role TEXT,
  found_in_build TEXT,
  affected_version TEXT,
  reporter TEXT,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_histories (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  project_id TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT DEFAULT '',
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_histories_project_created ON status_histories(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_histories_resource_created ON status_histories(resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS burndown_snapshots (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL,
  date TEXT NOT NULL,
  remaining_hours DOUBLE PRECISION NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  build_date TEXT,
  status TEXT NOT NULL DEFAULT 'building',
  linked_stories TEXT DEFAULT '[]',
  linked_bugs TEXT DEFAULT '[]',
  scm_hash TEXT,
  creator TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  name TEXT NOT NULL,
  version TEXT,
  release_date TEXT,
  build_id TEXT,
  release_type TEXT DEFAULT 'official',
  linked_stories TEXT DEFAULT '[]',
  linked_bugs TEXT DEFAULT '[]',
  release_notes TEXT,
  creator TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  creator_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_releases_creator_id ON releases(creator_id);

CREATE TABLE IF NOT EXISTS release_approvals (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT DEFAULT '',
  approver_id TEXT,
  approver_name TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_approvals_release_approver
      ON release_approvals(release_id, approver_id)
      WHERE approver_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rollback_records (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  impact TEXT DEFAULT '',
  plan TEXT DEFAULT '',
  operator_id TEXT,
  operator_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_calendars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  working_weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_calendar_exceptions (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  calendar_date TEXT NOT NULL,
  is_working_day INTEGER NOT NULL DEFAULT 0,
  name TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_calendar_exceptions_date
        ON work_calendar_exceptions(calendar_id, calendar_date);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'draft',
  status TEXT NOT NULL DEFAULT 'draft',
  description TEXT DEFAULT '',
  definition_json TEXT NOT NULL,
  created_by TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_status_updated
  ON workflow_templates(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_workflow_bindings (
  project_id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  bound_by TEXT,
  bound_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_workflow_bindings_template
  ON project_workflow_bindings(template_id);
