const express = require("express");

function createWorkflowRouter({
  canAccessProject,
  evaluateProjectFlow,
  fail,
  ok,
  repository,
  workflowTemplates,
}) {
  const router = express.Router();

  router.get("/projects/:id/flow", (req, res) => {
    const project = repository.findProjectId(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!canAccessProject(req.user, project.id)) return fail(res, 403, "PERMISSION_DENIED", "Cannot access this project flow.");
    return res.json(ok(evaluateProjectFlow(project.id)));
  });

  router.get("/flow/overview", (req, res) => {
    const overview = repository.listProjectFlowSummaries()
      .filter((project) => canAccessProject(req.user, project.id))
      .map((project) => {
        const flow = evaluateProjectFlow(project.id);
        if (!flow) return null;
        const currentGate = flow.gates.find((gate) => gate.state !== "passed" && gate.state !== "done");
        return {
          projectId: project.id,
          projectName: project.name,
          status: project.status,
          healthScore: project.health_score,
          currentStage: currentGate ? currentGate.stage : "release",
          gates: flow.gates.map((gate) => ({ stage: gate.stage, state: gate.state })),
        };
      })
      .filter(Boolean);
    return res.json(ok(overview));
  });

  router.get("/flow/templates", (req, res) => {
    return res.json(ok({
      version: "2026-07-15",
      source: "api/src/workflow/templates.js",
      templates: workflowTemplates(),
    }));
  });

  return router;
}

module.exports = {
  createWorkflowRouter,
};
