const express = require("express");
const { sessionListLimit } = require("./sessionReplay");

// Admin surface for dsh session replay (GET /api/ai/sessions). The data source
// is strictly read-only (sessions.db opened readOnly, or the legacy JSONL
// tree); permissions follow the AI masking admin gate (requirePermission
// ("admin:*")) even though the paths live under /api/ai/sessions: the contract
// is frozen for the web client.
function createAiSessionReplayRouter({ fail, ok, requirePermission, service }) {
  const router = express.Router();

  router.get("/ai/sessions", requirePermission("admin:*"), async (req, res, next) => {
    try {
      const limit = sessionListLimit(req.query.limit);
      if (limit === null) {
        return fail(res, 400, "VALIDATION_FAILED", "Query parameter 'limit' must be a positive integer (1-100).");
      }
      res.json(ok({ items: await service.list(limit) }));
    } catch (error) { next(error); }
  });

  router.get("/ai/sessions/:id", requirePermission("admin:*"), async (req, res, next) => {
    try {
      const record = await service.get(String(req.params.id || ""));
      if (!record) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI session not found.");
      res.json(ok(record));
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAiSessionReplayRouter };
