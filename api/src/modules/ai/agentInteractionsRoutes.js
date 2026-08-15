// Sprint 5.1 platform-side REST surface for agent interactions. The AI page
// lists pending question/approval cards (with a 15s polling fallback) and
// answers or cancels them here; the loopback long-poll then wakes the dsh
// child runtime. All routes require ai:* and the responder must be the
// initiating user or hold project access (checked in the service).

const express = require("express");

function createAgentInteractionsRouter({ fail, ok, requirePermission, service }) {
  if (!service || typeof service.listForUser !== "function" || typeof service.respond !== "function" || typeof service.cancel !== "function") {
    throw new Error("Agent interactions router requires the interaction service.");
  }
  const router = express.Router();

  router.get("/ai/interactions", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const status = String(req.query.status || "pending").trim();
      res.json(ok({ items: await service.listForUser(req.user, { status }) }));
    } catch (error) {
      if (error?.status) return fail(res, error.status, error.code, error.message);
      return next(error);
    }
  });

  router.post("/ai/interactions/:id/respond", requirePermission("ai:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.respond({
        body: req.body || {},
        id: req.params.id,
        ip: req.ip,
        user: req.user,
      })));
    } catch (error) {
      if (error?.status) return fail(res, error.status, error.code, error.message);
      return next(error);
    }
  });

  router.post("/ai/interactions/:id/cancel", requirePermission("ai:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.cancel({ id: req.params.id, ip: req.ip, user: req.user })));
    } catch (error) {
      if (error?.status) return fail(res, error.status, error.code, error.message);
      return next(error);
    }
  });

  return router;
}

module.exports = { createAgentInteractionsRouter };
