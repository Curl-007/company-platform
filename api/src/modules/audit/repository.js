function createAuditRepository({ rows }) {
  async function listAuditLogs({
    keyword,
    actor,
    action,
    resourceType,
    dateFrom,
    dateTo,
    includePageViews,
    actorId,
    actorIds,
    resourceIds,
    visibility,
  } = {}) {
    const clauses = [];
    const params = {};
    if (visibility && visibility.all !== true) {
      params.viewerActorId = String(visibility.actorId || "");
      const projectIds = Array.isArray(visibility.projectIds)
        ? [...new Set(visibility.projectIds.map(String).filter(Boolean))]
        : [];
      if (projectIds.length) {
        const keys = projectIds.map((_, index) => `@visibleProjectId${index}`);
        projectIds.forEach((id, index) => {
          params[`visibleProjectId${index}`] = id;
        });
        clauses.push(`(actor_id = @viewerActorId OR (scope_type = 'user' AND subject_user_id = @viewerActorId) OR (scope_type = 'project' AND project_id IN (${keys.join(", ")})))`);
      } else {
        clauses.push("(actor_id = @viewerActorId OR (scope_type = 'user' AND subject_user_id = @viewerActorId))");
      }
    }
    if (actor) {
      clauses.push("actor_name = @actor");
      params.actor = String(actor);
    }
    if (actorId) {
      clauses.push("actor_id = @actorId");
      params.actorId = String(actorId);
    }
    if (Array.isArray(actorIds)) {
      if (actorIds.length === 0) {
        clauses.push("1 = 0");
      } else {
        const keys = actorIds.map((_, index) => `@actorIds${index}`);
        actorIds.forEach((id, index) => {
          params[`actorIds${index}`] = String(id);
        });
        clauses.push(`actor_id IN (${keys.join(", ")})`);
      }
    }
    if (Array.isArray(resourceIds)) {
      if (resourceIds.length === 0) {
        clauses.push("1 = 0");
      } else {
        const keys = resourceIds.map((_, index) => `@resourceIds${index}`);
        resourceIds.forEach((id, index) => {
          params[`resourceIds${index}`] = String(id);
        });
        clauses.push(`resource_id IN (${keys.join(", ")})`);
      }
    }
    if (action) {
      clauses.push("action LIKE @action");
      params.action = `${String(action)}%`;
    }
    if (resourceType) {
      clauses.push("resource_type = @resourceType");
      params.resourceType = String(resourceType);
    }
    if (dateFrom) {
      clauses.push("created_at >= @dateFrom");
      params.dateFrom = `${String(dateFrom).slice(0, 10)}T00:00:00.000Z`;
    }
    if (dateTo) {
      clauses.push("created_at <= @dateTo");
      params.dateTo = `${String(dateTo).slice(0, 10)}T23:59:59.999Z`;
    }
    if (includePageViews !== "1") clauses.push("action != 'page.view'");
    if (keyword) {
      clauses.push("(actor_name LIKE @keyword OR action LIKE @keyword OR resource_type LIKE @keyword OR resource_id LIKE @keyword)");
      params.keyword = `%${String(keyword).trim()}%`;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return await rows(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 1000`, params);
  }

  return { listAuditLogs };
}

module.exports = {
  createAuditRepository,
};
