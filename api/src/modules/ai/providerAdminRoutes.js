const express = require("express");

function createAiProviderAdminRouter({ audit, callModelWithConfig, callRealModel, fail, ok, publicConfig, requirePermission, service }) {
  const router = express.Router();
  const handle = (res, error) => fail(res, error.status || 500, error.code || "AI_PROVIDER_UPDATE_FAILED", error.message || "AI Provider update failed.");

  router.get("/admin/ai-provider", requirePermission("admin:*"), async (req, res) => {
    try {
      res.json(ok(await service.get()));
    } catch (error) { return handle(res, error); }
  });
  router.get("/admin/ai-provider/models", requirePermission("admin:*"), async (req, res) => {
    try {
      res.json(ok(await service.listModels(req.query?.id)));
    } catch (error) { return handle(res, error); }
  });
  // AI analysis page also needs model discovery without full admin surface.
  router.get("/ai/models", requirePermission("ai:*"), async (req, res) => {
    try {
      res.json(ok(await service.listModels()));
    } catch (error) { return handle(res, error); }
  });
  router.patch("/admin/ai-provider", requirePermission("admin:*"), async (req, res) => {
    try {
      const result = await service.update(req.body);
      await audit(req.user, "admin.ai_provider_update", "app_setting", "ai_provider", result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.post("/admin/ai-provider/:id/activate", requirePermission("admin:*"), async (req, res) => {
    try {
      const result = await service.activate(req.params.id);
      await audit(req.user, "admin.ai_provider_activate", "app_setting", result.resourceId, result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.patch("/admin/ai-provider/:id/status", requirePermission("admin:*"), async (req, res) => {
    try {
      const result = await service.setStatus(req.params.id, req.body?.enabled);
      await audit(req.user, result.enabled ? "admin.ai_provider_enable" : "admin.ai_provider_disable", "app_setting", result.resourceId, result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.delete("/admin/ai-provider/:id", requirePermission("admin:*"), async (req, res) => {
    try {
      const result = await service.remove(req.params.id);
      await audit(req.user, "admin.ai_provider_delete", "app_setting", result.resourceId, result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.post("/admin/ai-provider/test", requirePermission("admin:*"), async (req, res) => {
    const started = Date.now();
    try {
      const config = await service.prepareTest(req.body || {});
      const prompt = "Please reply only: connection successful";
      const text = typeof callModelWithConfig === "function"
        ? await callModelWithConfig(config, prompt, { temperature: 0 })
        : await callRealModel(prompt, { temperature: 0 });
      res.json(ok({
        ok: Boolean(text),
        latencyMs: Date.now() - started,
        sample: String(text || "").slice(0, 120),
        provider: await publicConfig(config),
      }));
    } catch (error) {
      return fail(res, error.status || 502, error.code || "AI_PROVIDER_TEST_FAILED", error.message || "AI provider test failed.");
    }
  });
  return router;
}

module.exports = { createAiProviderAdminRouter };
