const express = require("express");

function mapAuditLog(item, parse) {
  return {
    id: item.id,
    actorId: item.actor_id || null,
    actorName: item.actor_name,
    action: item.action,
    resourceType: item.resource_type,
    resourceId: item.resource_id || null,
    before: parse(item.before_json),
    after: parse(item.after_json),
    createdAt: item.created_at,
  };
}

function createAuditRouter({
  audit,
  fail,
  ok,
  paginatedResponse,
  parse,
  repository,
  requirePermission,
}) {
  const router = express.Router();

  router.get("/audit-logs", requirePermission("audit:read"), (req, res) => {
    const allItems = repository.listAuditLogs(req.query)
      .map((item) => mapAuditLog(item, parse));
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/activity/page-view", (req, res) => {
    const page = String(req.body?.page ?? "").trim();
    const pageTitle = String(req.body?.pageTitle ?? page).trim();
    if (!page) return fail(res, 400, "VALIDATION_FAILED", "Page is required.");
    audit(req.user, "page.view", "page", page, null, { page, pageTitle }, req.ip);
    res.status(201).json(ok({ page, pageTitle }));
  });

  return router;
}

module.exports = {
  createAuditRouter,
  mapAuditLog,
};
