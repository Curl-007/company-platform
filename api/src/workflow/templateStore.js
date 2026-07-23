/**
 * Workflow templates (simplified).
 *
 * Only two builtin templates are supported:
 * - fixed-project-delivery-v1 (完整固定交付)
 * - lightweight-delivery-v1 (轻量交付)
 *
 * Custom draft/publish authoring is disabled for UX simplicity.
 * Projects only choose one of the two builtins.
 */

const { publicWorkflowTemplates } = require("./templates");
const { defaultRulesForStage, normalizeStageRules } = require("./gateRules");

const BUILTIN_ID = "fixed-project-delivery-v1";
const LIGHTWEIGHT_ID = "lightweight-delivery-v1";
const ALLOWED_TEMPLATE_IDS = new Set([BUILTIN_ID, LIGHTWEIGHT_ID]);

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
  row,
  now,
  upsert,
}) {
  async function listTemplates() {
    // Only the two builtin templates are exposed.
    return builtinTemplates();
  }

  async function getTemplate(templateId) {
    const id = ALLOWED_TEMPLATE_IDS.has(templateId) ? templateId : BUILTIN_ID;
    return builtinTemplates().find((item) => item.id === id) || builtinTemplates()[0];
  }

  async function createDraft() {
    const error = new Error("自定义模板已关闭：仅支持「固定交付」和「轻量交付」两个内置模板。");
    error.code = "VALIDATION_FAILED";
    throw error;
  }

  async function updateDraft() {
    const error = new Error("内置模板不可编辑。请在项目中切换「固定交付 / 轻量交付」。");
    error.code = "VALIDATION_FAILED";
    throw error;
  }

  async function cloneAsDraft() {
    const error = new Error("已简化为两个固定模板，不再支持复制草稿。");
    error.code = "VALIDATION_FAILED";
    throw error;
  }

  async function publishTemplate(templateId) {
    // Builtin templates are always published.
    const template = await getTemplate(templateId);
    if (!template) {
      const error = new Error("Template not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    return template;
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
        templateVersion: "2026-07-21",
        source: "default",
        boundAt: null,
        boundBy: null,
      };
    }
    const templateId = ALLOWED_TEMPLATE_IDS.has(binding.template_id) ? binding.template_id : BUILTIN_ID;
    const template = await getTemplate(templateId);
    return {
      projectId,
      templateId,
      templateVersion: template?.version || binding.template_version || "2026-07-21",
      source: templateId === binding.template_id ? "binding" : "default",
      boundAt: binding.bound_at,
      boundBy: binding.bound_by,
    };
  }

  async function bindProjectTemplate(projectId, templateId, actor) {
    if (!ALLOWED_TEMPLATE_IDS.has(String(templateId || "").trim())) {
      const error = new Error("仅支持绑定：固定交付 或 轻量交付。");
      error.code = "VALIDATION_FAILED";
      throw error;
    }
    const template = await getTemplate(templateId);
    if (!template) {
      const error = new Error("Template not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    const project = await row("SELECT id, process_mode FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
    if (!project) {
      const error = new Error("Project not found.");
      error.code = "RESOURCE_NOT_FOUND";
      throw error;
    }
    const processMode = String(project.process_mode || "scrum").trim().toLowerCase();
    const allowedModes = Array.isArray(template.processModes) ? template.processModes.map((item) => String(item).toLowerCase()) : [];
    if (allowedModes.length && !allowedModes.includes(processMode)) {
      const error = new Error(`流程模板「${template.name}」不支持项目过程模式「${processMode}」，允许：${allowedModes.join(", ")}。`);
      error.code = "WORKFLOW_TEMPLATE_PROCESS_MODE_INCOMPATIBLE";
      error.status = 409;
      throw error;
    }
    const stamp = now();
    await upsert("project_workflow_bindings", {
      project_id: projectId,
      template_id: template.id,
      template_version: template.version || "published",
      bound_by: actor?.id || null,
      bound_at: stamp,
    }, { conflictTarget: "project_id" });
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
  LIGHTWEIGHT_ID,
  ALLOWED_TEMPLATE_IDS,
  createWorkflowTemplateStore,
  normalizeTemplateBody,
  mapStoredTemplate,
  builtinTemplates,
};
