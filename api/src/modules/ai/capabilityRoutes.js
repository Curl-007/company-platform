const express = require("express");

function createAiCapabilitiesRouter({ ok, requirePermission, service }) {
  const router = express.Router();

  router.get("/ai/capabilities", requirePermission("ai:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.listForUser(req.user)));
    } catch (error) { next(error); }
  });

  router.post("/ai/capabilities/:id/invocations", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const invocation = await service.invoke({
        actor: req.user,
        capabilityId: req.params.id,
        input: req.body || {},
        ip: req.ip,
      });
      res.json(ok(invocation));
    } catch (error) { next(error); }
  });

  router.get("/admin/ai-capabilities/:id", requirePermission("admin:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.getAdmin(req.params.id)));
    } catch (error) { next(error); }
  });

  router.patch("/admin/ai-capabilities/:id", requirePermission("admin:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.updateControl({
        actor: req.user,
        id: req.params.id,
        input: req.body || {},
        ip: req.ip,
      })));
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAiCapabilitiesRouter };
