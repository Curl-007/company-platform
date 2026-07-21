/**
 * Configurable workflow templates (Wave 1).
 *
 * Built-in fixed template remains the default.
 * Published custom templates can be bound per project and used to label/order gates.
 * Gate evaluation still uses fixed project metrics; stage catalog becomes configurable.
 */

const { publicWorkflowTemplates } = require("./templates");
const { defaultRulesForStage, normalizeStageRules } = require("./gateRules");

const BUILTIN_ID = "fixed-project-delivery-v1";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStage(stage, index = 0) {
  const id = String(stage?.id || `stage_${index + 1}`).trim().slice(0, 64);
  const label = String(stage?.label || id).trim().slice(0, 120);
  if (!id || !label) {
    const error = new Error("Each stage requires id and label.");
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  const explicitRules = Array.isArray(stage?.rules) ? normalizeStageRules(stage.rules) : null;
  return {
    id,
    label,
    description: String(stage?.description || "").trim().slice(0, 1000),
    evidence: Array.isArray(stage?.evidence)
      ? stage.evidence.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [],
    exitCriteria: Array.isArray(stage?.exitCriteria)
      ? stage.exitCriteria.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [],
    // Keep empty array if caller explicitly clears rules; only default when omitted.
    rules: explicitRules == null ? defaultRulesForStage(id) : explicitRules,
  };
}

function normalizeTemplateBody(input = {}) {
  const name = String(input.name || "").trim().slice(0, 160);
  if (!name) {
    const error = new Error("Template name is required.");
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  const stagesIn = Array.isArray(input.stages) ? input.stages : [];
  if (!stagesIn.length) {
    const error = new Error("Template requires at least one stage.");
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  if (stagesIn.length > 20) {
    const error = new Error("Template may contain at most 20 stages.");
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  const stages = stagesIn.map((stage, index) => normalizeStage(stage, index));
  const ids = stages.map((stage) => stage.id);
  if (new Set(ids).size !== ids.length) {
    const error = new Error("Stage ids must be unique within a template.");
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  return {
    name,
    description: String(input.description || "").trim().slice(0, 2000),
    processModes: Array.isArray(input.processModes) && input.processModes.length
      ? [...new Set(input.processModes.map((item) => String(item).trim()).filter(Boolean))].slice(0, 10)
      : ["scrum", "kanban", "waterfall"],
    stages,
    guardrails: Array.isArray(input.guardrails)
      ? input.guardrails.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [],
  };
}

function builtinTemplates() {
  return publicWorkflowTemplates().map((template) => ({
    ...template,
    builtin: true,
    status: "published",
    source: "builtin",
  }));
}

function mapStoredTemplate(row, parse) {
  if (!row) return null;
  const definition = typeof parse === "function" ? parse(row.definition_json, {}) : JSON.parse(row.definition_json || "{}");
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    scope: "project",
    mode: "configurable",
    status: row.status,
    description: row.description || definition.description || "",
    processModes: definition.processModes || ["scrum", "kanban", "waterfall"],
    stages: definition.stages || [],
    resources: definition.resources || [],
    guardrails: definition.guardrails || [],
    builtin: false,
    source: "database",
    createdBy: row.created_by || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createWorkflowTemplateStore({
  insert,
  row,
  rows,
  run,
  json,
  parse,
  now,
  nextId,
}) {
  async function listTemplates({ includeDrafts = false } = {}) {
    const builtins = builtinTemplates();
    const stored = await rows(
      includeDrafts
        ? "SELECT * FROM workflow_templates ORDER BY updated_at DESC"
        : "SELECT * FROM workflow_templates WHERE status = 'published' ORDER BY updated_at DESC",
    );
    const mapped = stored.map((item) => mapStoredTemplate(item, parse));
    // builtins first, then custom
    return [...builtins, ...mapped];
  }

  async function getTemplate(templateId) {
    if (!templateId || templateId === BUILTIN_ID) {
      return builtinTemplates().find((item) => item.id === BUILTIN_ID) || builtinTemplates()[0];
    }
    const stored = await row("SELECT * FROM workflow_templates WHERE id = @id", { id: templateId });
    return mapStoredTemplate(stored, parse);
  }

  async function createDraft(input, actor) {
    const body = normalizeTemplateBody(input);
    const id = typeof nextId === "function"
      ? await nextId("WFT", "workflow_templates", "id")
      : `WFT-${Date.now()}`;
    const stamp = now();
    await insert("workflow_templates", {
      id,
      name: body.name,
      version: "draft",
      status: "draft",
      description: body.description,
      definition_json: json({
        description: body.description,
        processModes: body.processModes,
        stages: body.stages,
        resources: [],
        guardrails: body.guardrails,
      }),
      created_by: actor?.id || null,
      published_at: null,
      created_at: stamp,
      updated_at: stamp,
    });
    return getTemplate(id);
  }

  async function updateDraft(templateId, input) {
    const existing = await row("SELECT * FROM workflow_templates WHERE id = @id", { id: templateId });
    if (!existing) {
      const error = new Error("Template not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    if (existing.status !== "draft") {
      const error = new Error("Only draft templates can be edited. Clone a published/builtin template first.");
      error.code = "VALIDATION_FAILED";
      throw error;
    }
    const body = normalizeTemplateBody(input);
    await run(
      `UPDATE workflow_templates
       SET name = @name,
           description = @description,
           definition_json = @definition,
           updated_at = @updatedAt
       WHERE id = @id`,
      {
        id: templateId,
        name: body.name,
        description: body.description,
        definition: json({
          description: body.description,
          processModes: body.processModes,
          stages: body.stages,
          resources: [],
          guardrails: body.guardrails,
        }),
        updatedAt: now(),
      },
    );
    return getTemplate(templateId);
  }

  async function cloneAsDraft(templateId, actor, overrides = {}) {
    const source = await getTemplate(templateId);
    if (!source) {
      const error = new Error("Template not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    return createDraft({
      name: String(overrides.name || `${source.name}（副本）`).trim().slice(0, 160),
      description: overrides.description != null ? overrides.description : source.description,
      processModes: overrides.processModes || source.processModes,
      stages: overrides.stages || source.stages,
      guardrails: overrides.guardrails || source.guardrails,
    }, actor);
  }

  async function publishTemplate(templateId) {
    const existing = await row("SELECT * FROM workflow_templates WHERE id = @id", { id: templateId });
    if (!existing) {
      const error = new Error("Template not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    if (existing.status === "published") return getTemplate(templateId);
    const stamp = now();
    const version = `v${stamp.slice(0, 10).replace(/-/g, "")}`;
    await run(
      `UPDATE workflow_templates
       SET status = 'published',
           version = @version,
           published_at = @publishedAt,
           updated_at = @updatedAt
       WHERE id = @id`,
      { id: templateId, version, publishedAt: stamp, updatedAt: stamp },
    );
    return getTemplate(templateId);
  }

  async function getProjectBinding(projectId) {
    const binding = await row(
      "SELECT * FROM project_workflow_bindings WHERE project_id = @projectId",
      { projectId },
    );
    if (!binding) {
      return {
        projectId,
        templateId: BUILTIN_ID,
        templateVersion: "2026-07-15",
        source: "default",
        boundAt: null,
        boundBy: null,
      };
    }
    return {
      projectId,
      templateId: binding.template_id,
      templateVersion: binding.template_version,
      source: "binding",
      boundAt: binding.bound_at,
      boundBy: binding.bound_by,
    };
  }

  async function bindProjectTemplate(projectId, templateId, actor) {
    const template = await getTemplate(templateId);
    if (!template) {
      const error = new Error("Template not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    if (template.status && template.status !== "published" && !template.builtin) {
      const error = new Error("Only published templates can be bound to projects.");
      error.code = "VALIDATION_FAILED";
      throw error;
    }
    const stamp = now();
    const existing = await row(
      "SELECT project_id FROM project_workflow_bindings WHERE project_id = @projectId",
      { projectId },
    );
    if (existing) {
      await run(
        `UPDATE project_workflow_bindings
         SET template_id = @templateId,
             template_version = @templateVersion,
             bound_by = @boundBy,
             bound_at = @boundAt
         WHERE project_id = @projectId`,
        {
          projectId,
          templateId: template.id,
          templateVersion: template.version || "published",
          boundBy: actor?.id || null,
          boundAt: stamp,
        },
      );
    } else {
      await insert("project_workflow_bindings", {
        project_id: projectId,
        template_id: template.id,
        template_version: template.version || "published",
        bound_by: actor?.id || null,
        bound_at: stamp,
      });
    }
    return getProjectBinding(projectId);
  }

  return {
    BUILTIN_ID,
    listTemplates,
    getTemplate,
    createDraft,
    updateDraft,
    cloneAsDraft,
    publishTemplate,
    getProjectBinding,
    bindProjectTemplate,
    normalizeTemplateBody,
    deepClone,
  };
}

module.exports = {
  BUILTIN_ID,
  createWorkflowTemplateStore,
  normalizeTemplateBody,
  mapStoredTemplate,
  builtinTemplates,
};
