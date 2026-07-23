const express = require("express");
const { wrapRouterAsync } = require("../../lib/asyncHandler");

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

/**
 * Visibility:
 * - admin: global
 * - others with audit:read: own actions only (actor_id), plus optional resourceId filter
 * Default decision from RC checklist: admin-global / role-scoped for others.
 */
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

  router.get("/audit-logs", requirePermission("audit:read"), async (req, res) => {
    const isAdmin = req.user?.role === "admin" || (Array.isArray(req.user?.permissions) && req.user.permissions.includes("*"));
    const query = { ...req.query };
    if (!isAdmin) {
      // Non-admin: only own audit trail (prevent cross-user leakage).
      query.actorId = req.user.id;
      delete query.actor;
      delete query.actorIds;
    }
    const allItems = (await repository.listAuditLogs(query)).map((item) => mapAuditLog(item, parse));
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/activity/page-view", async (req, res) => {
    const page = String(req.body?.page ?? "").trim();
    const pageTitle = String(req.body?.pageTitle ?? page).trim();
    if (!page) return fail(res, 400, "VALIDATION_FAILED", "Page is required.");
    await audit(req.user, "page.view", "page", page, null, { page, pageTitle }, req.ip);
    res.status(201).json(ok({ page, pageTitle }));
  });

  return wrapRouterAsync(router);
}

module.exports = {
  createAuditRouter,
  mapAuditLog,
};
