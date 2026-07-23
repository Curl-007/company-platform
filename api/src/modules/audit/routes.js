const express = require("express");
const { wrapRouterAsync } = require("../../lib/asyncHandler");

function mapAuditLog(item, parse, sanitizeAuditValue = (value) => value) {
  return {
    id: item.id,
    actorId: item.actor_id || null,
    actorName: item.actor_name,
    action: item.action,
    resourceType: item.resource_type,
    resourceId: item.resource_id || null,
    before: sanitizeAuditValue(parse(item.before_json)),
    after: sanitizeAuditValue(parse(item.after_json)),
    scopeType: item.scope_type || "global",
    projectId: item.project_id || null,
    subjectUserId: item.subject_user_id || null,
    createdAt: item.created_at,
  };
}

/**
 * Visibility:
 * - admin: global
 * - others with audit:read: own actor/subject logs plus logs for accessible projects
 */
function createAuditRouter({
  audit,
  fail,
  ok,
  paginatedResponse,
  parse,
  repository,
  requirePermission,
  resolveAccessScope,
  sanitizeAuditValue,
}) {
  const router = express.Router();

  router.get("/audit-logs", requirePermission("audit:read"), async (req, res) => {
    const accessScope = typeof resolveAccessScope === "function"
      ? await resolveAccessScope(req.user)
      : { projectIds: [] };
    const isAdmin = accessScope?.all === true;
    const query = { ...req.query };
    if (!isAdmin) {
      delete query.actor;
      delete query.actorIds;
      delete query.actorId;
      query.visibility = {
        actorId: req.user?.id,
        projectIds: Array.isArray(accessScope?.projectIds) ? accessScope.projectIds : [],
      };
    }
    const allItems = (await repository.listAuditLogs(query)).map((item) => mapAuditLog(item, parse, sanitizeAuditValue));
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
