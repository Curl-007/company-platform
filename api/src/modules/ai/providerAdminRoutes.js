const express = require("express");

function createAiProviderAdminRouter({ audit, callRealModel, fail, ok, publicConfig, requirePermission, service }) {
  const router = express.Router();
  const handle = (res, error) => fail(res, error.status || 500, error.code || "AI_PROVIDER_UPDATE_FAILED", error.message || "AI Provider 更新失败。");

  router.get("/admin/ai-provider", requirePermission("admin:*"), (req, res) => res.json(ok(service.get())));
  router.patch("/admin/ai-provider", requirePermission("admin:*"), (req, res) => {
    try {
      const result = service.update(req.body);
      audit(req.user, "admin.ai_provider_update", "app_setting", "ai_provider", result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.post("/admin/ai-provider/:id/activate", requirePermission("admin:*"), (req, res) => {
    try {
      const result = service.activate(req.params.id);
      audit(req.user, "admin.ai_provider_activate", "app_setting", result.resourceId, result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.patch("/admin/ai-provider/:id/status", requirePermission("admin:*"), (req, res) => {
    try {
      const result = service.setStatus(req.params.id, req.body?.enabled);
      audit(req.user, result.enabled ? "admin.ai_provider_enable" : "admin.ai_provider_disable", "app_setting", result.resourceId, result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.delete("/admin/ai-provider/:id", requirePermission("admin:*"), (req, res) => {
    try {
      const result = service.remove(req.params.id);
      audit(req.user, "admin.ai_provider_delete", "app_setting", result.resourceId, result.before, result.after, req.ip);
      res.json(ok(result.after));
    } catch (error) { return handle(res, error); }
  });
  router.post("/admin/ai-provider/test", requirePermission("admin:*"), async (req, res) => {
    const started = Date.now();
    const config = service.get();
    if (!config.enabled) return fail(res, 400, "AI_PROVIDER_DISABLED", "Current AI Provider is disabled.");
    if (!config.configured) return fail(res, 400, "AI_PROVIDER_NOT_CONFIGURED", "请先配置 API Key、Base URL 和模型。");
    try {
      const text = await callRealModel("请只回复：连接成功", { temperature: 0 });
      res.json(ok({ ok: Boolean(text), latencyMs: Date.now() - started, sample: String(text || "").slice(0, 120), provider: publicConfig() }));
    } catch (error) {
      return fail(res, 502, "AI_PROVIDER_TEST_FAILED", error.message || "AI provider 测试失败。");
    }
  });
  return router;
}

module.exports = { createAiProviderAdminRouter };
