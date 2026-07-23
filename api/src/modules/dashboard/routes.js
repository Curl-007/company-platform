const express = require("express");

function createDashboardRouter({ ok, resolveAccessScope, service }) {
  const router = express.Router();

  const isFresh = (req) => ["1", "true"].includes(String(req.query?.fresh || "").toLowerCase());
  const buildForRequest = async (req, owner) => service.build({
    accessScope: typeof resolveAccessScope === "function"
      ? await resolveAccessScope(req.user)
      : { projectIds: [] },
    ...(owner ? { owner } : {}),
    skipCache: isFresh(req),
    user: req.user,
  });

  router.get("/dashboard", async (req, res, next) => {
    try {
      res.json(ok(await buildForRequest(req)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/personal", async (req, res, next) => {
    try {
      res.json(ok(await buildForRequest(req, req.user?.name)));
    } catch (error) {
      next(error);
    }
  });

  // Thin reports read models (as-built): same aggregates as dashboard, separate URL surface.
  router.get("/reports/summary", async (req, res, next) => {
    try {
      const dashboard = await buildForRequest(req);
      res.json(ok({
        metrics: dashboard.metrics,
        riskyProjects: dashboard.riskyProjects,
        requirementProgress: dashboard.requirementProgress,
        ai: dashboard.ai,
        mode: "dashboard_projection",
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/reports/personal", async (req, res, next) => {
    try {
      const dashboard = await buildForRequest(req, req.user?.name);
      res.json(ok({
        metrics: dashboard.metrics,
        focusTasks: dashboard.focusTasks,
        myDefects: dashboard.myDefects || [],
        myBuilds: dashboard.myBuilds || [],
        mode: "dashboard_projection",
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createDashboardRouter };
