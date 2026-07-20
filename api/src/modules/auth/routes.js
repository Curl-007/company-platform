const express = require("express");

function createAuthRouter({ audit, authLimiter, buildCapabilities, fail, ok, publicUser, service }) {
  const router = express.Router();

  router.post("/auth/login", authLimiter, (req, res) => {
    try {
      const result = service.login(req.body || {});
      audit(result.user, "auth.login", "user", result.user.id, null, { email: result.user.email }, req.ip);
      res.json(ok(result));
    } catch (error) {
      const email = req.body?.email;
      if (error.code === "INVALID_CREDENTIALS") audit(null, "auth.login_failed", "user", email, null, { email }, req.ip);
      if (error.code === "ACCOUNT_DISABLED") audit(null, "auth.login_disabled", "user", email, null, { email }, req.ip);
      return fail(res, error.status || 500, error.code || "AUTHENTICATION_FAILED", error.message || "登录失败。");
    }
  });

  router.get("/auth/me", (req, res) => res.json(ok(req.user)));
  router.get("/auth/capabilities", (req, res) => res.json(ok(req.user.capabilities || buildCapabilities(req.user))));
  router.patch("/auth/me", (req, res) => {
    try {
      const { before, after } = service.updateProfile(req.user.id, req.body);
      const beforePublic = publicUser(before);
      const afterPublic = publicUser(after);
      audit(afterPublic, "user.profile_update", "user", req.user.id, beforePublic, afterPublic, req.ip);
      res.json(ok(afterPublic));
    } catch (error) {
      return fail(res, error.status || 500, error.code || "PROFILE_UPDATE_FAILED", error.message || "资料更新失败。");
    }
  });

  return router;
}

module.exports = { createAuthRouter };
