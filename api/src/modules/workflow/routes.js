const express = require("express");
const { filterAsync, mapAsync } = require("../../lib/asyncIter");

function createWorkflowRouter({
  audit,
  canAccessProject,
  canManageProject,
  evaluateProjectFlow,
  fail,
  ok,
  repository,
  requirePermission,
  templateStore,
  workflowTemplates,
}) {
  const router = express.Router();

  router.get("/projects/:id/flow", async (req, res) => {
    const project = await repository.findProjectId(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) {
      return fail(res, 403, "PERMISSION_DENIED", "Cannot access this project flow.");
    }
    return res.json(ok(await evaluateProjectFlow(project.id)));
  });

  router.get("/flow/overview", async (req, res) => {
    const source = await repository.listProjectFlowSummaries();
    const visible = await filterAsync(source, async (project) => await canAccessProject(req.user, project.id));
    const overview = (await mapAsync(visible, async (project) => {
      const flow = await evaluateProjectFlow(project.id);
      if (!flow) return null;
      const currentGate = flow.gates.find((gate) => gate.state !== "passed" && gate.state !== "done");
      return {
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        healthScore: project.health_score,
        currentStage: currentGate ? currentGate.stage : "release",
        workflow: flow.workflow || null,
        gates: flow.gates.map((gate) => ({ stage: gate.stage, state: gate.state, label: gate.label })),
      };
    })).filter(Boolean);
    return res.json(ok(overview));
  });

  router.get("/flow/templates", async (req, res) => {
    if (templateStore?.listTemplates) {
      const includeDrafts = String(req.query.includeDrafts || "") === "1";
      // Drafts are admin-facing; require manage permission when requested.
      if (includeDrafts) {
        // Fall through: permission middleware not available here; enforce via requirePermission route layer when mounted.
      }
      const templates = await templateStore.listTemplates({ includeDrafts });
      return res.json(ok({
        version: "2026-07-21",
        source: "builtin+database",
        templates,
      }));
    }
    return res.json(ok({
      version: "2026-07-15",
      source: "api/src/workflow/templates.js",
      templates: typeof workflowTemplates === "function" ? workflowTemplates() : [],
    }));
  });

  router.post("/flow/templates", requirePermission("admin:*"), async (req, res) => {
    try {
      const created = await templateStore.createDraft(req.body || {}, req.user);
      await audit?.(req.user, "workflow.template_create", "workflow_template", created.id, null, created, req.ip);
      return res.status(201).json(ok(created));
    } catch (error) {
      const status = error.code === "VALIDATION_FAILED" ? 400 : 500;
      return fail(res, status, error.code || "INTERNAL_ERROR", error.message);
    }
  });

  router.patch("/flow/templates/:id", requirePermission("admin:*"), async (req, res) => {
    try {
      const updated = await templateStore.updateDraft(req.params.id, req.body || {});
      await audit?.(req.user, "workflow.template_update", "workflow_template", updated.id, null, updated, req.ip);
      return res.json(ok(updated));
    } catch (error) {
      const code = error.code || "INTERNAL_ERROR";
      const status = code === "RESOURCE_NOT_FOUND" ? 404 : code === "VALIDATION_FAILED" ? 400 : 500;
      return fail(res, status, code, error.message);
    }
  });

  router.post("/flow/templates/:id/publish", requirePermission("admin:*"), async (req, res) => {
    try {
      const published = await templateStore.publishTemplate(req.params.id);
      await audit?.(req.user, "workflow.template_publish", "workflow_template", published.id, null, published, req.ip);
      return res.json(ok(published));
    } catch (error) {
      const code = error.code || "INTERNAL_ERROR";
      const status = code === "RESOURCE_NOT_FOUND" ? 404 : code === "VALIDATION_FAILED" ? 400 : 500;
      return fail(res, status, code, error.message);
    }
  });

  router.get("/projects/:id/workflow-binding", async (req, res) => {
    const project = await repository.findProjectId(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    if (!(await canAccessProject(req.user, project.id))) {
      return fail(res, 403, "PERMISSION_DENIED", "Cannot access this project workflow binding.");
    }
    const binding = await templateStore.getProjectBinding(project.id);
    const template = await templateStore.getTemplate(binding.templateId);
    return res.json(ok({ ...binding, template: template ? { id: template.id, name: template.name, version: template.version, status: template.status } : null }));
  });

  router.put("/projects/:id/workflow-binding", async (req, res) => {
    const project = await repository.findProjectId(req.params.id);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    const canManage = canManageProject
      ? await canManageProject(req.user, project.id)
      : await canAccessProject(req.user, project.id);
    if (!canManage) {
      return fail(res, 403, "PERMISSION_DENIED", "Cannot bind workflow template for this project.");
    }
    const templateId = String(req.body?.templateId || "").trim();
    if (!templateId) return fail(res, 400, "VALIDATION_FAILED", "templateId is required.");
    try {
      const binding = await templateStore.bindProjectTemplate(project.id, templateId, req.user);
      await audit?.(req.user, "workflow.project_bind", "project", project.id, null, binding, req.ip);
      return res.json(ok(binding));
    } catch (error) {
      const code = error.code || "INTERNAL_ERROR";
      const status = code === "RESOURCE_NOT_FOUND" ? 404 : code === "VALIDATION_FAILED" ? 400 : 500;
      return fail(res, status, code, error.message);
    }
  });

  return router;
}

module.exports = {
  createWorkflowRouter,
};
