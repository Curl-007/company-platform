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
    return attachments
      .map((item) => {
        const mimeType = String(item?.mimeType || "").trim();
        const name = String(item?.name || "附件").trim().slice(0, 120);
        const size = Number(item?.size) || 0;
        const contentBase64 = String(item?.contentBase64 || "").trim();
        const kind = mimeType.startsWith("image/") ? "image" : "document";
        const extracted = kind === "document" && contentBase64
          ? extractTextFromUpload(name, mimeType, contentBase64)
          : "";
        const contentText = String(item?.contentText || extracted || "").slice(0, 12000);
        return { kind, name, mimeType, size, contentText, contentBase64 };
      })
      .filter((item) => item.name && (item.contentText || item.contentBase64 || item.size))
      .slice(0, 6);
  }

  function buildContext() {
    const projects = rows("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY id").map(mapProject);
    const requirements = rows("SELECT * FROM requirements WHERE deleted_at IS NULL ORDER BY id").map(mapRequirement);
    const tasks = rows("SELECT * FROM tasks ORDER BY id").map(mapTask);
    const defects = rows("SELECT * FROM defects ORDER BY id").map(mapDefect);
    const documents = rows("SELECT * FROM documents ORDER BY updated_at DESC LIMIT 12").map(mapDocument);
    const builds = rows("SELECT * FROM builds ORDER BY build_date DESC LIMIT 10").map(mapBuild);
    const releases = rows("SELECT * FROM releases ORDER BY release_date DESC LIMIT 10").map(mapRelease);
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
        updatedAt: item.updatedAt,
      })),
      delivery: {
        builds: builds.map((item) => ({ id: item.id, name: item.name, status: item.status, projectId: item.projectId, version: item.version })),
        releases: releases.map((item) => ({ id: item.id, name: item.name, status: item.status, productId: item.productId, version: item.version })),
      },
    };
  }

  function buildPrompt({ messages, attachments, scope, currentPage }) {
    const context = buildContext();
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
      `当前页面：${currentPage || "未知"}`,
      `对话范围：${scope || "project-management"}`,
      `平台上下文：${JSON.stringify(context)}`,
      `附件：${JSON.stringify(attachmentSummaries)}`,
      `最近对话：${JSON.stringify(messages)}`,
      `用户最新问题：${messages[messages.length - 1]?.content || ""}`,
    ].join("\n");
  }

  function localReply({ messages, attachments }) {
    const latest = messages[messages.length - 1]?.content || "";
    const context = buildContext();
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

  function localReplyV2({ messages, attachments }) {
    const latest = messages[messages.length - 1]?.content || "";
    const context = buildContext();
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

module.exports = {
  createAiChatService,
  dataUrlForAttachment,
  normalizeAiChatMessages,
};
