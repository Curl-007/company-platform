const { addColumnIfMissing } = require("../src/db/sqliteSchema");

const PROJECT_LOOKUPS = Object.freeze({
  requirement: ["requirements", "id"],
  task: ["tasks", "id"],
  defect: ["defects", "id"],
  test_case: ["test_cases", "id"],
  document: ["documents", "id"],
  build: ["builds", "id"],
  sprint: ["sprints", "id"],
  work_log: ["work_logs", "id"],
  time_entry: ["time_entries", "id"],
  project_risk: ["project_risks", "id"],
  project_decision: ["project_decisions", "id"],
  project_allocation: ["project_allocations", "id"],
});

function parseJson(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function findField(value, names, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return null;
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (names.has(key) && item != null && String(item).trim()) return String(item).trim();
  }
  for (const item of Object.values(value)) {
    const found = findField(item, names, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = @name").get({ name: table }));
}

function verifiedId(db, table, candidate) {
  if (!candidate || !tableExists(db, table)) return null;
  const item = db.prepare(`SELECT id FROM ${table} WHERE id = @id`).get({ id: String(candidate) });
  return item?.id || null;
}

function lookupProjectId(db, log, before, after) {
  for (const value of [after, before]) {
    const candidate = findField(value, new Set(["project_id", "projectId"]));
    const verified = verifiedId(db, "projects", candidate);
    if (verified) return verified;
  }
  if (log.resource_type === "project") return verifiedId(db, "projects", log.resource_id);

  const lookup = PROJECT_LOOKUPS[log.resource_type];
  if (lookup && log.resource_id && tableExists(db, lookup[0])) {
    const linked = db.prepare(`SELECT project_id FROM ${lookup[0]} WHERE ${lookup[1]} = @id`).get({ id: log.resource_id });
    const verified = verifiedId(db, "projects", linked?.project_id);
    if (verified) return verified;
  }

  if (log.resource_type === "test_run" && tableExists(db, "test_runs") && tableExists(db, "test_cases")) {
    const linked = db.prepare(
      `SELECT tc.project_id
         FROM test_runs tr
         JOIN test_cases tc ON tc.id = tr.test_case_id
        WHERE tr.id = @id`,
    ).get({ id: log.resource_id });
    const verified = verifiedId(db, "projects", linked?.project_id);
    if (verified) return verified;
  }

  if (log.resource_type === "release" && tableExists(db, "builds")) {
    const buildId = [after, before]
      .map((value) => findField(value, new Set(["build_id", "buildId"])))
      .find(Boolean);
    let linked = buildId
      ? db.prepare("SELECT project_id FROM builds WHERE id = @id").get({ id: buildId })
      : null;
    if (!linked && tableExists(db, "releases")) {
      linked = db.prepare(
        `SELECT b.project_id
           FROM releases r
           JOIN builds b ON b.id = r.build_id
          WHERE r.id = @id`,
      ).get({ id: log.resource_id });
    }
    const verified = verifiedId(db, "projects", linked?.project_id);
    if (verified) return verified;
  }

  if (log.resource_type === "ai_job" && tableExists(db, "ai_jobs")) {
    const linked = db.prepare(
      `SELECT COALESCE(CASE WHEN j.source_type = 'project' THEN j.source_id END, d.project_id, sr.project_id, wr.project_id) AS project_id
         FROM ai_jobs j
         LEFT JOIN documents d ON j.source_type = 'document' AND d.id = j.source_id
         LEFT JOIN requirements sr ON j.source_type = 'requirement' AND sr.id = j.source_id
         LEFT JOIN requirements wr ON wr.id = j.written_requirement_id
        WHERE j.job_id = @id`,
    ).get({ id: log.resource_id });
    return verifiedId(db, "projects", linked?.project_id);
  }
  return null;
}

module.exports = {
  id: "20260723_20_audit_scope",
  up({ db }) {
    addColumnIfMissing(db, "audit_logs", "scope_type", "TEXT NOT NULL DEFAULT 'global'");
    addColumnIfMissing(db, "audit_logs", "project_id", "TEXT");
    addColumnIfMissing(db, "audit_logs", "subject_user_id", "TEXT");

    db.exec("UPDATE audit_logs SET scope_type = 'global', project_id = NULL, subject_user_id = NULL");
    const logs = db.prepare(
      "SELECT id, resource_type, resource_id, before_json, after_json FROM audit_logs",
    ).all();
    const updateProject = db.prepare(
      "UPDATE audit_logs SET scope_type = 'project', project_id = @projectId, subject_user_id = NULL WHERE id = @id",
    );
    const updateUser = db.prepare(
      "UPDATE audit_logs SET scope_type = 'user', project_id = NULL, subject_user_id = @subjectUserId WHERE id = @id",
    );
    for (const log of logs) {
      const before = parseJson(log.before_json);
      const after = parseJson(log.after_json);
      const projectId = lookupProjectId(db, log, before, after);
      if (projectId) {
        updateProject.run({ id: log.id, projectId });
        continue;
      }
      if (log.resource_type === "user") {
        const candidate = verifiedId(db, "users", log.resource_id)
          || verifiedId(db, "users", findField(after, new Set(["id", "user_id", "userId"])))
          || verifiedId(db, "users", findField(before, new Set(["id", "user_id", "userId"])));
        if (candidate) updateUser.run({ id: log.id, subjectUserId: candidate });
      }
    }

    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_scope_project_created ON audit_logs(scope_type, project_id, created_at DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_logs(actor_id, created_at DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_subject_created ON audit_logs(subject_user_id, created_at DESC)");
  },
};
