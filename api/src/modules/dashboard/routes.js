const express = require("express");

function createDashboardRouter({ ok, service }) {
  const router = express.Router();

  router.get("/dashboard", async (req, res, next) => {
    try {
      res.json(ok(await service.build({ user: req.user })));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/personal", async (req, res, next) => {
    try {
      res.json(ok(await service.build({ owner: req.user?.name, user: req.user })));
    } catch (error) {
      next(error);
    }
  });

  // Thin reports read models (as-built): same aggregates as dashboard, separate URL surface.
  router.get("/reports/summary", async (req, res, next) => {
    try {
      const dashboard = await service.build({ user: req.user });
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
      const dashboard = await service.build({ owner: req.user?.name, user: req.user });
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
