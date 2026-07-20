const express = require("express");
const { filterAsync, mapAsync, forEachAsync } = require("../../lib/asyncIter");

function createWorkflowRouter({
  canAccessProject,
  evaluateProjectFlow,
  fail,
  ok,
  repository,
  workflowTemplates,
}) {
  const router = express.Router();

  router.get("/projects/:id/flow", async (req, res) => {
    const project = await repository.findProjectId(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "Cannot access this project flow.");
    return res.json(ok(await evaluateProjectFlow(project.id)));
  });

  router.get("/flow/overview", async (req, res) => {
    const __src_overview = await repository.listProjectFlowSummaries();
    const __mid_overview = await filterAsync(__src_overview, async (project) => await canAccessProject(req.user, project.id));
    const overview = (await mapAsync(__mid_overview, async (project) => {
      const flow = await evaluateProjectFlow(project.id);
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
    })).filter(Boolean);
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
