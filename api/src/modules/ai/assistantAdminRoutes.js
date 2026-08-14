const express = require("express");

function createAiAssistantAdminRouter({ audit, fail, ok, requirePermission, service }) {
  const router = express.Router();
  const handle = (res, error) => fail(res, error.status || 500, error.code || "AI_ASSISTANT_UPDATE_FAILED", error.message || "AI assistant update failed.");

  router.get("/admin/ai-assistant", requirePermission("admin:*"), async (req, res) => {
    try {
      res.json(ok(await service.get()));
    } catch (error) { return handle(res, error); }
  });
  router.patch("/admin/ai-assistant", requirePermission("admin:*"), async (req, res) => {
    try {
      const result = await service.update(req.body || {});
      await audit(req.user, "admin.ai_assistant_update", "app_setting", "ai_assistant", result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  return router;
}

module.exports = { createAiAssistantAdminRouter };
