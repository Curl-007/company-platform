const express = require("express");

// Admin surface for AI data-masking rules (防泄密关键字屏蔽/替换).
//
// Permissions follow the AI provider admin gate (requirePermission("admin:*"))
// even though the paths live under /api/ai/masking: the contract is frozen for
// the web client. Every write lands in the audit log as
// ai.masking_rule.create / .update / .delete with the rule name included.
function createAiMaskingRouter({ audit, fail, ok, requirePermission, service }) {
  const router = express.Router();
  const handle = (res, error, fallbackCode, fallbackMessage) => fail(
    res,
    error.status || 500,
    error.code || fallbackCode,
    error.message || fallbackMessage,
  );

  router.get("/ai/masking/rules", requirePermission("admin:*"), async (req, res) => {
    try {
      res.json(ok({ items: await service.list() }));
    } catch (error) {
      return handle(res, error, "AI_MASKING_RULES_UNAVAILABLE", "AI masking rules are unavailable.");
    }
  });

  router.post("/ai/masking/rules", requirePermission("admin:*"), async (req, res) => {
    try {
      const item = await service.create(req.body || {});
      await audit(req.user, "ai.masking_rule.create", "ai_masking_rule", item.id, null, item, req.ip);
      res.json(ok({ item }));
    } catch (error) {
      return handle(res, error, "AI_MASKING_RULE_CREATE_FAILED", "AI masking rule creation failed.");
    }
  });

  router.patch("/ai/masking/rules/:id", requirePermission("admin:*"), async (req, res) => {
    try {
      const { after, before } = await service.update(req.params.id, req.body || {});
      await audit(req.user, "ai.masking_rule.update", "ai_masking_rule", after.id, before, after, req.ip);
      res.json(ok({ item: after }));
    } catch (error) {
      return handle(res, error, "AI_MASKING_RULE_UPDATE_FAILED", "AI masking rule update failed.");
    }
  });

  router.delete("/ai/masking/rules/:id", requirePermission("admin:*"), async (req, res) => {
    try {
      const removed = await service.remove(req.params.id);
      await audit(req.user, "ai.masking_rule.delete", "ai_masking_rule", removed.id, removed, null, req.ip);
      res.json(ok({ ok: true }));
    } catch (error) {
      return handle(res, error, "AI_MASKING_RULE_DELETE_FAILED", "AI masking rule deletion failed.");
    }
  });

  router.post("/ai/masking/test", requirePermission("admin:*"), async (req, res) => {
    try {
      const text = String(req.body?.text ?? "");
      const result = await service.applyToText(text);
      res.json(ok({ masked: result.text, violations: result.violations }));
    } catch (error) {
      return handle(res, error, "AI_MASKING_TEST_FAILED", "AI masking preview failed.");
    }
  });

  return router;
}

module.exports = { createAiMaskingRouter };
