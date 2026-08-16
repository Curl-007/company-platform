// Authoritative catalog exposed to the company DSH UI plugin. It describes
// frontend surfaces and the closed declarative vocabulary; it never contains
// executable frontend code, selectors, HTML, CSS, or arbitrary URLs.

const UI_PAGE_SURFACES = Object.freeze([
  ["dashboard", "Dashboard", "工作台"],
  ["mywork", "My Work", "我的工作"],
  ["team", "Team", "团队管理"],
  ["teamlogs", "Team Logs", "团队日报"],
  ["capacity", "Capacity", "团队容量"],
  ["dynamic", "Activity", "动态中心"],
  ["projects", "Projects", "项目执行"],
  ["requirements", "Requirements", "需求管理"],
  ["testing", "Testing", "测试质量"],
  ["delivery", "Delivery", "交付中心"],
  ["builds", "Builds", "构建"],
  ["releases", "Releases", "发布"],
  ["documents", "Documents", "文档中心"],
  ["ai", "AI Analysis", "AI 分析"],
  ["reports", "Reports", "报表中心"],
  ["products", "Products", "产品管理"],
  ["flow", "Workflow", "研发流程"],
  ["settings", "Settings", "系统设置"],
  ["dsh-ui", "DSH Workspace", "智能界面"],
].map(([id, label, labelZh]) => Object.freeze({
  id,
  kind: "page",
  label,
  labelZh,
  route: `/${id}`,
  supportsLayout: false,
  supportsStyle: true,
})));

const UI_DETAIL_SURFACES = Object.freeze([
  ["projects.detail", "Project detail", "项目详情", ["hero", "activation-alert", "workspace", "ai-advice"]],
  ["projects.task-detail", "Task detail", "任务详情", ["wbs-code", "owner", "status", "estimated-hours", "remaining-hours", "due-date", "progress", "description"]],
  ["requirements.detail", "Requirement detail", "需求详情", ["summary", "ai-advice", "fields"]],
  ["documents.detail", "Document detail", "文档详情", ["summary", "ai-advice", "file-info", "linked-requirements", "risks", "content"]],
  ["delivery.build-detail", "Build detail", "构建详情", ["metrics", "readiness", "ai-advice", "gates", "linked-stories", "linked-bugs", "notes"]],
  ["delivery.release-detail", "Release detail", "发布详情", ["metrics", "readiness", "ai-advice", "gates", "linked-stories", "linked-bugs", "notes", "governance", "release-report"]],
  ["team.member-detail", "Member detail", "成员详情", ["profile", "metrics", "workload", "projects", "recent-tasks", "recent-logs"]],
  ["flow.project-detail", "Workflow detail", "流程详情", ["workflow-binding", "pipeline", "defect-funnel", "hours"]],
  ["products.detail", "Product detail", "产品详情", ["hero", "gallery", "modules", "roadmap", "assets", "metrics"]],
  ["programs.detail", "Program detail", "项目集详情", ["hero", "progress", "linked-projects", "risks"]],
  ["portfolios.detail", "Portfolio detail", "组合详情", ["hero", "products", "roadmap"]],
  ["mywork.task-detail", "My work task detail", "我的任务详情", ["header", "metadata", "progress", "description", "handoff", "status-history"]],
  ["mywork.requirement-detail", "My work requirement detail", "我的需求详情", ["header", "metadata", "progress", "description", "acceptance-criteria", "access-hint"]],
  ["mywork.defect-detail", "My work defect detail", "我的缺陷详情", ["header", "metadata", "description", "handoff", "access-hint"]],
  ["teamlogs.member-summary", "Team log member summary", "团队日报成员摘要", ["status", "summary", "completed", "blockers", "next-plans", "related-details", "weekly-markdown"]],
].map(([id, label, labelZh, blocks]) => Object.freeze({
  blocks: Object.freeze(blocks),
  id,
  kind: "detail",
  label,
  labelZh,
  supportsLayout: true,
  supportsStyle: true,
})));

const UI_DECLARATIVE_BLOCK_TYPES = Object.freeze([
  Object.freeze({ id: "stat", purpose: "A labeled scalar value with optional detail and tone." }),
  Object.freeze({ id: "text", purpose: "Plain text content. HTML and Markdown execution are not supported." }),
  Object.freeze({ id: "list", purpose: "A bounded list of plain-text items." }),
  Object.freeze({ id: "table", purpose: "A bounded table with explicit columns and scalar cells." }),
  Object.freeze({ id: "progress", purpose: "A labeled progress value from 0 to 100." }),
  Object.freeze({ id: "notice", purpose: "A status or guidance message using a predefined tone." }),
  Object.freeze({ id: "links", purpose: "Buttons that navigate only to registered internal pages." }),
]);

const UI_CONTROL_OPERATIONS = Object.freeze([
  Object.freeze({ id: "control", directiveKinds: Object.freeze([
    "theme", "fontSize", "fontFamily", "density", "accentColor",
    "contentPadding", "reduceMotion", "navigate", "openAiSidebar",
  ]) }),
  Object.freeze({ id: "layout", directiveKinds: Object.freeze(["layout"]) }),
  Object.freeze({ id: "style", directiveKinds: Object.freeze(["surfaceStyle"]) }),
  Object.freeze({ id: "view", directiveKinds: Object.freeze(["viewUpsert", "viewRemove", "viewOpen"]) }),
]);

function listUiSurfaces() {
  return Object.freeze([...UI_PAGE_SURFACES, ...UI_DETAIL_SURFACES]);
}

const UI_SURFACES_BY_ID = new Map(listUiSurfaces().map((surface) => [surface.id, surface]));

function findUiSurface(id) {
  return UI_SURFACES_BY_ID.get(String(id || "").trim()) || null;
}

function listUiPageIds() {
  return Object.freeze(UI_PAGE_SURFACES.map((surface) => surface.id));
}

function publicUiCatalog() {
  return {
    blockTypes: UI_DECLARATIVE_BLOCK_TYPES,
    operations: UI_CONTROL_OPERATIONS,
    safety: {
      arbitraryCss: false,
      arbitraryHtml: false,
      arbitraryJavaScript: false,
      arbitraryUrls: false,
      rendering: "closed-declarative-schema",
    },
    surfaces: listUiSurfaces(),
  };
}

module.exports = {
  UI_CONTROL_OPERATIONS,
  UI_DECLARATIVE_BLOCK_TYPES,
  UI_DETAIL_SURFACES,
  UI_PAGE_SURFACES,
  findUiSurface,
  listUiPageIds,
  listUiSurfaces,
  publicUiCatalog,
};
