function normalizeAiChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").trim().slice(0, 6000),
    }))
    .filter((item) => item.content)
    .slice(-12);
}

function dataUrlForAttachment(attachment) {
  if (!attachment?.mimeType?.startsWith("image/") || !attachment.contentBase64) return null;
  const safeMime = attachment.mimeType.replace(/[^-\w/+.;=]/g, "");
  return `data:${safeMime};base64,${attachment.contentBase64}`;
}

function normalizeAccessScope(accessScope) {
  if (accessScope?.all === true) return { all: true, projectIds: [] };
  if (!Array.isArray(accessScope?.projectIds)) return { all: false, projectIds: [] };
  return {
    all: false,
    projectIds: [...new Set(accessScope.projectIds.map(String).map((id) => id.trim()).filter(Boolean))].sort(),
  };
}

function scopedParams(projectIds) {
  return Object.fromEntries(projectIds.map((id, index) => [`projectId${index}`, id]));
}

function projectClause(projectIds, column = "project_id") {
  return `${column} IN (${projectIds.map((_, index) => `@projectId${index}`).join(", ")})`;
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 12 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "text/plain", "text/markdown", "text/csv", "text/xml",
  "application/json", "application/xml", "application/x-yaml",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function attachmentError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function decodeAttachmentBase64(value, name) {
  const normalized = String(value || "").replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw attachmentError(400, "INVALID_ATTACHMENT", `附件 ${name} 的 Base64 内容无效。`);
  }
  return Buffer.from(normalized, "base64");
}

function createAiChatService({
  extractTextFromUpload,
  mapBuild,
  mapDefect,
  mapDocument,
  mapProject,
  mapRelease,
  mapRequirement,
  mapTask,
  rows,
}) {
  function normalizeAttachments(attachments) {
    if (!Array.isArray(attachments)) return [];
    if (attachments.length > 6) {
      throw attachmentError(400, "TOO_MANY_ATTACHMENTS", "单次对话最多附加 6 个文件。");
    }
    let totalBytes = 0;
    return attachments.map((item) => {
        const mimeType = String(item?.mimeType || "").trim();
        const name = String(item?.name || "附件").trim().slice(0, 120);
        const contentBase64 = String(item?.contentBase64 || "").trim();
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
          throw attachmentError(400, "UNSUPPORTED_ATTACHMENT_TYPE", `附件 ${name} 的类型不受支持。`);
        }
        const decoded = decodeAttachmentBase64(contentBase64, name);
        const size = decoded.length;
        if (size > MAX_ATTACHMENT_BYTES) {
          throw attachmentError(413, "ATTACHMENT_TOO_LARGE", `附件 ${name} 超过 5 MB 单文件上限。`);
        }
        totalBytes += size;
        if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
          throw attachmentError(413, "ATTACHMENTS_TOO_LARGE", "附件总大小超过 12 MB。");
        }
        const kind = mimeType.startsWith("image/") ? "image" : "document";
        const extracted = kind === "document" && contentBase64
          ? extractTextFromUpload(name, mimeType, contentBase64)
          : "";
        const contentText = String(item?.contentText || extracted || "").slice(0, 12000);
        return { kind, name, mimeType, size, contentText, contentBase64 };
      });
  }

  async function buildContext(accessScope) {
    const normalizedScope = normalizeAccessScope(accessScope);
    if (!normalizedScope.all && normalizedScope.projectIds.length === 0) {
      return {
        metrics: {
          projects: 0,
          activeProjects: 0,
          riskyProjects: 0,
          requirements: 0,
          tasks: 0,
          blockedTasks: 0,
          openDefects: 0,
          documents: 0,
          builds: 0,
          releases: 0,
        },
        projects: [],
        requirements: [],
        blockedTasks: [],
        openDefects: [],
        recentDocuments: [],
        delivery: { builds: [], releases: [] },
      };
    }
    const params = normalizedScope.all ? {} : scopedParams(normalizedScope.projectIds);
    const allowedProjectIds = new Set(normalizedScope.projectIds);
    const isAllowedProject = (projectId) => normalizedScope.all || allowedProjectIds.has(projectId);
    const projectFilter = normalizedScope.all ? "" : ` AND ${projectClause(normalizedScope.projectIds, "id")}`;
    const boundFilter = normalizedScope.all ? "" : ` WHERE ${projectClause(normalizedScope.projectIds)}`;
    const requirementsFilter = normalizedScope.all ? "" : ` AND ${projectClause(normalizedScope.projectIds)}`;
    const releaseFilter = normalizedScope.all ? "" : ` WHERE ${projectClause(normalizedScope.projectIds, "b.project_id")}`;
    const projectRows = await rows(`SELECT * FROM projects WHERE deleted_at IS NULL${projectFilter} ORDER BY id`, params);
    const requirementRows = await rows(`SELECT * FROM requirements WHERE deleted_at IS NULL${requirementsFilter} ORDER BY id`, params);
    const projects = projectRows.map(mapProject).filter((item) => isAllowedProject(item.id));
    const requirements = requirementRows.map(mapRequirement).filter((item) => isAllowedProject(item.projectId));
    const tasks = (await rows(`SELECT * FROM tasks${boundFilter} ORDER BY id`, params)).map(mapTask).filter((item) => isAllowedProject(item.projectId));
    const defects = (await rows(`SELECT * FROM defects${boundFilter} ORDER BY id`, params)).map(mapDefect).filter((item) => isAllowedProject(item.projectId));
    const documents = (await rows(`SELECT * FROM documents${boundFilter} ORDER BY updated_at DESC LIMIT 12`, params)).map(mapDocument).filter((item) => isAllowedProject(item.projectId));
    const builds = (await rows(`SELECT * FROM builds${boundFilter} ORDER BY build_date DESC LIMIT 10`, params)).map(mapBuild).filter((item) => isAllowedProject(item.projectId));
    const releaseRows = await rows(
      `SELECT r.*, b.project_id AS project_id
       FROM releases r
       LEFT JOIN builds b ON b.id = r.build_id${releaseFilter}
       ORDER BY r.release_date DESC LIMIT 10`,
      params,
    );
    const releases = releaseRows
      .map((item) => ({ ...mapRelease(item), projectId: item.project_id || item.projectId || null }))
      .filter((item) => isAllowedProject(item.projectId));
    const activeProjects = projects.filter((item) => !["done", "archived"].includes(item.status));
    const riskyProjects = projects.filter((item) => item.riskCount > 0 || item.healthScore < 70);
    const openDefects = defects.filter((item) => !["closed", "rejected", "verified"].includes(item.status));
    const blockedTasks = tasks.filter((item) => item.status === "blocked");
    return {
      metrics: {
        projects: projects.length,
        activeProjects: activeProjects.length,
        riskyProjects: riskyProjects.length,
        requirements: requirements.length,
        tasks: tasks.length,
        blockedTasks: blockedTasks.length,
        openDefects: openDefects.length,
        documents: documents.length,
        builds: builds.length,
        releases: releases.length,
      },
      projects: projects.slice(0, 20).map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        owner: item.owner,
        progress: item.progress,
        healthScore: item.healthScore,
        riskCount: item.riskCount,
      })),
      requirements: requirements.slice(0, 25).map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        completion: item.completion,
        owner: item.owner,
        projectId: item.projectId,
      })),
      blockedTasks: blockedTasks.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.title,
        assignee: item.assignee,
        projectId: item.projectId,
        requirementId: item.requirementId,
        remainingHours: item.remainingHours,
      })),
      openDefects: openDefects.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        status: item.status,
        assignee: item.assignee,
        projectId: item.projectId,
      })),
      recentDocuments: documents.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        category: item.category,
        aiStatus: item.aiStatus,
        projectId: item.projectId,
        updatedAt: item.updatedAt,
      })),
      delivery: {
        builds: builds.map((item) => ({ id: item.id, name: item.name, status: item.status, projectId: item.projectId, version: item.version })),
        releases: releases.map((item) => ({ id: item.id, name: item.name, status: item.status, productId: item.productId, projectId: item.projectId, version: item.version })),
      },
    };
  }

  async function buildPrompt({ messages, attachments, scope, currentPage, accessScope }) {
    const context = await buildContext(accessScope);
    const attachmentSummaries = attachments.map((item, index) => ({
      index: index + 1,
      name: item.name,
      kind: item.kind,
      mimeType: item.mimeType,
      size: item.size,
      textPreview: item.contentText ? item.contentText.slice(0, 4000) : "",
      hasImagePayload: item.kind === "image" && Boolean(item.contentBase64),
    }));
    return [
      "你是公司项目管理平台内置 AI 助手。请直接用中文回答用户问题，给出可执行建议。",
      "回答原则：",
      "1. 结合平台当前项目、需求、任务、缺陷、文档、构建和发布数据。",
      "2. 如果用户上传文档，先概括内容，再指出可落地事项和风险。",
      "3. 如果用户上传图片，识别画面或界面问题，并给出改进建议。",
      "4. 不要输出固定的摘要/风险/建议三段模板，按对话自然回答。",
      "5. 数据不足时说明缺口，并给下一步需要补充的信息。",
      ...require("./chatActions").chatActionPromptRules(),
      `当前页面：${currentPage || "未知"}`,
      `对话范围：${scope || "project-management"}`,
      `平台上下文：${JSON.stringify(context)}`,
      `附件：${JSON.stringify(attachmentSummaries)}`,
      `最近对话：${JSON.stringify(messages)}`,
      `用户最新问题：${messages[messages.length - 1]?.content || ""}`,
    ].join("\n");
  }

  async function localReply({ messages, attachments, accessScope }) {
    const latest = messages[messages.length - 1]?.content || "";
    const context = await buildContext(accessScope);
    const attachmentLine = attachments.length
      ? `我已收到 ${attachments.length} 个附件：${attachments.map((item) => item.name).join("、")}。`
      : "当前没有附件。";
    return [
      "当前 AI Provider 未配置或调用失败，下面是基于平台数据的规则兜底分析：",
      attachmentLine,
      `当前共有 ${context.metrics.projects} 个项目、${context.metrics.requirements} 条需求、${context.metrics.blockedTasks} 个阻塞任务、${context.metrics.openDefects} 个未关闭缺陷。`,
      latest ? `围绕你的问题“${latest.slice(0, 80)}”，建议先检查高风险项目、阻塞任务和未关闭缺陷，再补充文档内容后重新让 AI 做深度判断。` : "你可以继续输入问题，或上传图片/文档让我分析。",
    ].join("\n\n");
  }

  async function localReplyV2({ messages, attachments, accessScope }) {
    const latest = messages[messages.length - 1]?.content || "";
    const context = await buildContext(accessScope);
    const documentAttachments = attachments.filter((item) => item.kind === "document");
    const imageAttachments = attachments.filter((item) => item.kind === "image");
    const documentNotes = documentAttachments
      .map((item, index) => {
        const preview = String(item.contentText || "").replace(/\s+/g, " ").trim().slice(0, 600);
        return preview
          ? `${index + 1}. ${item.name}: ${preview}`
          : `${index + 1}. ${item.name}: 已收到文件，但当前格式未提取到可读正文。`;
      })
      .join("\n");
    const imageNotes = imageAttachments.length
      ? `已收到 ${imageAttachments.length} 张图片：${imageAttachments.map((item) => item.name).join("、")}。当前规则兜底无法识别图片内容，需要真实多模态模型完成视觉分析。`
      : "";
    return [
      "当前 AI Provider 调用失败，下面先给出规则兜底结果。请在系统设置里重新测试连接后，可切回真实模型分析。",
      `平台快照：${context.metrics.projects} 个项目、${context.metrics.requirements} 条需求、${context.metrics.blockedTasks} 个阻塞任务、${context.metrics.openDefects} 个未关闭缺陷。`,
      documentNotes ? `我已读取到文档附件正文预览：\n${documentNotes}` : "",
      imageNotes,
      latest
        ? `围绕你的问题“${latest.slice(0, 120)}”，建议先核对高风险项目、阻塞任务、未关闭缺陷和附件里的验收口径，再补齐缺失负责人、截止时间和交付证据。`
        : "你可以继续输入问题，或上传截图、需求文档、测试记录让我分析。",
    ].filter(Boolean).join("\n\n");
  }

  return {
    buildContext,
    buildPrompt,
    localReply,
    localReplyV2,
    normalizeAttachments,
  };
}

const chatActions = require('./chatActions');

module.exports = {
  createAiChatService,
  dataUrlForAttachment,
  normalizeAccessScope,
  normalizeAiChatMessages,
  ACTION_TYPES: chatActions.ACTION_TYPES,
  wantsCreateRequirement: chatActions.wantsCreateRequirement,
  detectIntentType: chatActions.detectIntentType,
  extractProposedActions: chatActions.extractProposedActions,
  stripActionJson: chatActions.stripActionJson,
  buildLocalAction: chatActions.buildLocalAction,
  buildLocalRequirementAction: chatActions.buildLocalRequirementAction,
  appendLocalActionDraft: chatActions.appendLocalActionDraft,
  appendLocalRequirementDraft: chatActions.appendLocalRequirementDraft,
  actionLabel: chatActions.actionLabel,
  normalizeAction: chatActions.normalizeAction,
};
