function createAuditRepository({ rows }) {
  function listAuditLogs({ keyword, actor, action, resourceType, dateFrom, dateTo, includePageViews } = {}) {
    const clauses = [];
    const params = {};
    if (actor) {
      clauses.push("actor_name = @actor");
      params.actor = String(actor);
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
    return rows(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 1000`, params);
  }

  return { listAuditLogs };
}

module.exports = {
  createAuditRepository,
};
