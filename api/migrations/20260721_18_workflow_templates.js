module.exports = {
  id: "20260721_18_workflow_templates",
  up({ db }) {
    db.exec(`
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
      CREATE TABLE IF NOT EXISTS project_workflow_bindings (
        project_id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        template_version TEXT NOT NULL,
        bound_by TEXT,
        bound_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_templates_status_updated
        ON workflow_templates(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_workflow_bindings_template
        ON project_workflow_bindings(template_id);
    `);
  },
};
