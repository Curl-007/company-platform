const AUDIT_SECRET_KEYS = new Set([
  "password",
  "passwordhash",
  "apikey",
  "apikeyencrypted",
  "authorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
]);

const AUDIT_PROJECT_LOOKUPS = Object.freeze({
  requirement: "SELECT project_id FROM requirements WHERE id = @id",
  task: "SELECT project_id FROM tasks WHERE id = @id",
  defect: "SELECT project_id FROM defects WHERE id = @id",
  test_case: "SELECT project_id FROM test_cases WHERE id = @id",
  document: "SELECT project_id FROM documents WHERE id = @id",
  build: "SELECT project_id FROM builds WHERE id = @id",
  sprint: "SELECT project_id FROM sprints WHERE id = @id",
  work_log: "SELECT project_id FROM work_logs WHERE id = @id",
  time_entry: "SELECT project_id FROM time_entries WHERE id = @id",
  project_risk: "SELECT project_id FROM project_risks WHERE id = @id",
  project_decision: "SELECT project_id FROM project_decisions WHERE id = @id",
  project_allocation: "SELECT project_id FROM project_allocations WHERE id = @id",
});

function sanitizeAuditValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    AUDIT_SECRET_KEYS.has(String(key).replace(/[-_]/g, "").toLowerCase()) ? "[REDACTED]" : sanitizeAuditValue(item),
  ]));
}

function findAuditField(value, names, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return null;
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (names.has(key) && item != null && String(item).trim()) return String(item).trim();
  }
  for (const item of Object.values(value)) {
    const found = findAuditField(item, names, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function createAuditService({ row, insert, json, now }) {
  if (typeof row !== "function" || typeof insert !== "function" || typeof json !== "function" || typeof now !== "function") {
    throw new Error("createAuditService requires row(), insert(), json(), and now() functions.");
  }

  async function verifiedProjectId(candidate) {
    if (!candidate) return null;
    const project = await row("SELECT id FROM projects WHERE id = @id", { id: String(candidate) });
    return project?.id || null;
  }

  async function verifiedUserId(candidate) {
    if (!candidate) return null;
    const user = await row("SELECT id FROM users WHERE id = @id", { id: String(candidate) });
    return user?.id || null;
  }

  async function resolveAuditScope(resourceType, resourceId, beforeValue, afterValue, explicitScope) {
    const explicit = explicitScope && typeof explicitScope === "object" ? explicitScope : null;
    if (explicit) {
      const explicitType = explicit.scopeType || explicit.scope_type;
      if (explicitType === "global") return { scope_type: "global", project_id: null, subject_user_id: null };
      if (explicitType === "project") {
        const projectId = await verifiedProjectId(explicit.projectId || explicit.project_id);
        return projectId
          ? { scope_type: "project", project_id: projectId, subject_user_id: null }
          : { scope_type: "global", project_id: null, subject_user_id: null };
      }
      if (explicitType === "user") {
        const subjectUserId = await verifiedUserId(explicit.subjectUserId || explicit.subject_user_id);
        return subjectUserId
          ? { scope_type: "user", project_id: null, subject_user_id: subjectUserId }
          : { scope_type: "global", project_id: null, subject_user_id: null };
      }
      return { scope_type: "global", project_id: null, subject_user_id: null };
    }

    const values = [afterValue, beforeValue];
    let projectId = null;
    for (const value of values) {
      projectId = await verifiedProjectId(findAuditField(value, new Set(["project_id", "projectId"])));
      if (projectId) break;
    }
    if (!projectId && resourceType === "project") projectId = await verifiedProjectId(resourceId);
    if (!projectId && resourceId && AUDIT_PROJECT_LOOKUPS[resourceType]) {
      const linked = await row(AUDIT_PROJECT_LOOKUPS[resourceType], { id: resourceId });
      projectId = await verifiedProjectId(linked?.project_id);
    }
    if (!projectId && resourceType === "test_run" && resourceId) {
      const linked = await row(
        `SELECT tc.project_id
           FROM test_runs tr
           JOIN test_cases tc ON tc.id = tr.test_case_id
          WHERE tr.id = @id`,
        { id: resourceId },
      );
      projectId = await verifiedProjectId(linked?.project_id);
    }
    if (!projectId && resourceType === "release") {
      const buildId = values.map((value) => findAuditField(value, new Set(["build_id", "buildId"]))).find(Boolean);
      const linked = buildId
        ? await row("SELECT project_id FROM builds WHERE id = @id", { id: buildId })
        : await row(
          `SELECT b.project_id
             FROM releases r
             JOIN builds b ON b.id = r.build_id
            WHERE r.id = @id`,
          { id: resourceId },
        );
      projectId = await verifiedProjectId(linked?.project_id);
    }
    if (!projectId && resourceType === "ai_job" && resourceId) {
      const linked = await row(
        `SELECT COALESCE(CASE WHEN j.source_type = 'project' THEN j.source_id END, d.project_id, sr.project_id, wr.project_id) AS project_id
           FROM ai_jobs j
           LEFT JOIN documents d ON j.source_type = 'document' AND d.id = j.source_id
           LEFT JOIN requirements sr ON j.source_type = 'requirement' AND sr.id = j.source_id
           LEFT JOIN requirements wr ON wr.id = j.written_requirement_id
          WHERE j.job_id = @id`,
        { id: resourceId },
      );
      projectId = await verifiedProjectId(linked?.project_id);
    }
    if (projectId) return { scope_type: "project", project_id: projectId, subject_user_id: null };

    let subjectUserId = null;
    if (resourceType === "user") {
      subjectUserId = await verifiedUserId(resourceId);
      if (!subjectUserId) {
        for (const value of values) {
          subjectUserId = await verifiedUserId(findAuditField(value, new Set(["id", "user_id", "userId"]))) || null;
          if (subjectUserId) break;
        }
      }
    }
    return subjectUserId
      ? { scope_type: "user", project_id: null, subject_user_id: subjectUserId }
      : { scope_type: "global", project_id: null, subject_user_id: null };
  }

  async function audit(actor, action, resourceType, resourceId, beforeValue, afterValue, ip, explicitScope) {
    const auditScope = await resolveAuditScope(resourceType, resourceId, beforeValue, afterValue, explicitScope);
    await insert("audit_logs", {
      id: `AUD-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      actor_id: actor?.id || null,
      actor_name: actor?.name || "anonymous",
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      before_json: json(sanitizeAuditValue(beforeValue)),
      after_json: json(sanitizeAuditValue(afterValue)),
      ip: ip || null,
      ...auditScope,
      created_at: now(),
    });
  }

  return {
    audit,
    resolveAuditScope,
  };
}

module.exports = {
  AUDIT_PROJECT_LOOKUPS,
  AUDIT_SECRET_KEYS,
  createAuditService,
  sanitizeAuditValue,
};
