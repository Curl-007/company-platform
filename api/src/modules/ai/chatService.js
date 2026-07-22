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

  async function buildContext() {
    const projects = (await rows("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY id")).map(mapProject);
    const requirements = (await rows("SELECT * FROM requirements WHERE deleted_at IS NULL ORDER BY id")).map(mapRequirement);
    const tasks = (await rows("SELECT * FROM tasks ORDER BY id")).map(mapTask);
    const defects = (await rows("SELECT * FROM defects ORDER BY id")).map(mapDefect);
    const documents = (await rows("SELECT * FROM documents ORDER BY updated_at DESC LIMIT 12")).map(mapDocument);
    const builds = (await rows("SELECT * FROM builds ORDER BY build_date DESC LIMIT 10")).map(mapBuild);
    const releases = (await rows("SELECT * FROM releases ORDER BY release_date DESC LIMIT 10")).map(mapRelease);
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

  async function buildPrompt({ messages, attachments, scope, currentPage }) {
    const context = await buildContext();
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
      "6. 若用户意图是新建/创建需求（含「帮我建需求」「根据文档生成需求」「登记需求」），先用自然语言说明拟建内容，",
      "   然后在回答末尾单独追加一行 JSON（不要用代码块包裹），格式必须为：",
      '   ACTION_JSON:{"type":"create_requirement","title":"...","description":"...","priority":"high|medium|low","projectId":"PRJ-xxx或空字符串","acceptanceCriteria":["..."],"assignee":"","assigneeRole":"dev|qa|"}',
      "   规则：title 必填；priority 仅 high/medium/low；projectId 尽量从平台上下文匹配；无把握则留空；",
      "   acceptanceCriteria 从对话/文档提取，无则 []；不要编造不存在的项目 id。",
      "   非新建需求意图时禁止输出 ACTION_JSON。平台只会把 ACTION_JSON 作为「待确认草稿」，不会自动写库。",
      `当前页面：${currentPage || "未知"}`,
      `对话范围：${scope || "project-management"}`,
      `平台上下文：${JSON.stringify(context)}`,
      `附件：${JSON.stringify(attachmentSummaries)}`,
      `最近对话：${JSON.stringify(messages)}`,
      `用户最新问题：${messages[messages.length - 1]?.content || ""}`,
    ].join("\n");
  }

  async function localReply({ messages, attachments }) {
    const latest = messages[messages.length - 1]?.content || "";
    const context = await buildContext();
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

  async function localReplyV2({ messages, attachments }) {
    const latest = messages[messages.length - 1]?.content || "";
    const context = await buildContext();
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

const CREATE_REQUIREMENT_INTENT =
  /(新建|创建|登记|录入|起草|生成).{0,12}(需求|story|requirement)|(帮我).{0,8}(建|写|录).{0,8}(需求)|(需求).{0,8}(帮我|直接).{0,8}(建|写|创建)/i;

function wantsCreateRequirement(messages = [], attachments = []) {
  const latest = String(messages[messages.length - 1]?.content || "");
  if (CREATE_REQUIREMENT_INTENT.test(latest)) return true;
  // Document + create-ish verb nearby in last 2 user turns
  const recent = messages
    .filter((item) => item.role === "user")
    .slice(-2)
    .map((item) => item.content)
    .join("\n");
  if (attachments.some((item) => item.kind === "document") && /(需求|requirement|验收|功能点)/i.test(recent) && /(建|创建|生成|提炼|整理)/i.test(recent)) {
    return true;
  }
  return false;
}

function stripActionJson(content) {
  return String(content || "")
    .replace(/\n?ACTION_JSON\s*:\s*\{[\s\S]*\}\s*$/i, "")
    .replace(/\n?```(?:json)?\s*\{[\s\S]*?"type"\s*:\s*"create_requirement"[\s\S]*?\}\s*```\s*$/i, "")
    .trim();
}

function normalizePriority(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["high", "高", "p0", "p1"].includes(raw)) return "high";
  if (["low", "低", "p3"].includes(raw)) return "low";
  if (["medium", "中", "p2", "mid"].includes(raw)) return "medium";
  return "medium";
}

function normalizeAssigneeRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "qa" || raw === "测试") return "qa";
  if (raw === "dev" || raw === "开发") return "dev";
  return "";
}

function normalizeAcceptanceCriteria(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof value === "string") {
    return value
      .split(/\n+|；|;|。/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function parseJsonObject(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // tolerate trailing commas / single quotes lightly
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"'));
    } catch {
      return null;
    }
  }
}

function extractProposedActions(content) {
  const text = String(content || "");
  const actions = [];
  const patterns = [
    /ACTION_JSON\s*:\s*(\{[\s\S]*\})\s*$/im,
    /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"create_requirement"[\s\S]*?\})\s*```/im,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseJsonObject(match[1]);
    if (!parsed || parsed.type !== "create_requirement") continue;
    const title = String(parsed.title || "").trim().slice(0, 200);
    if (!title) continue;
    actions.push({
      type: "create_requirement",
      title,
      description: String(parsed.description || "").trim().slice(0, 8000),
      priority: normalizePriority(parsed.priority),
      projectId: String(parsed.projectId || "").trim().slice(0, 64),
      acceptanceCriteria: normalizeAcceptanceCriteria(parsed.acceptanceCriteria),
      assignee: String(parsed.assignee || "").trim().slice(0, 80),
      assigneeRole: normalizeAssigneeRole(parsed.assigneeRole),
    });
    break;
  }
  return actions;
}

function guessTitleFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const cleaned = line
      .replace(/^#+\s*/, "")
      .replace(/^(标题|需求|名称)[:：]\s*/i, "")
      .trim();
    if (cleaned.length >= 4 && cleaned.length <= 80 && !/^(背景|描述|验收|目标)/i.test(cleaned)) {
      return cleaned.slice(0, 80);
    }
  }
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "未命名需求草稿";
  return compact.slice(0, 48);
}

function buildLocalRequirementAction({ messages = [], attachments = [], context = null }) {
  if (!wantsCreateRequirement(messages, attachments)) return null;
  const latest = String(messages[messages.length - 1]?.content || "");
  const docText = attachments
    .filter((item) => item.kind === "document")
    .map((item) => item.contentText || "")
    .join("\n")
    .slice(0, 6000);
  const source = [latest, docText].filter(Boolean).join("\n");
  const titleMatch = source.match(/(?:标题|需求名称|名称)[:：]\s*([^\n，,；;]+)/i);
  const title = (titleMatch?.[1] || guessTitleFromText(source)).trim().slice(0, 80);
  const priorityMatch = source.match(/(?:优先级|priority)[:：]?\s*(high|medium|low|高|中|低)/i);
  const criteria = [];
  const criteriaBlock = source.match(/(?:验收标准|验收条件|acceptance)[:：]?\s*([\s\S]{0,1200})/i);
  if (criteriaBlock) {
    criteria.push(...normalizeAcceptanceCriteria(criteriaBlock[1]));
  }
  const projects = context?.projects || [];
  let projectId = "";
  for (const project of projects) {
    if (project?.id && source.includes(project.id)) {
      projectId = project.id;
      break;
    }
    if (project?.name && source.includes(project.name)) {
      projectId = project.id;
      break;
    }
  }
  if (!projectId && projects.length === 1) projectId = projects[0].id;
  const descriptionParts = [];
  if (docText) descriptionParts.push(`【来自附件】\n${docText.slice(0, 2500)}`);
  if (latest) descriptionParts.push(`【对话说明】\n${latest.slice(0, 1500)}`);
  return {
    type: "create_requirement",
    title,
    description: descriptionParts.join("\n\n").slice(0, 8000),
    priority: normalizePriority(priorityMatch?.[1]),
    projectId,
    acceptanceCriteria: criteria,
    assignee: "",
    assigneeRole: "",
  };
}

function appendLocalRequirementDraft(content, action) {
  if (!action) return content;
  const lines = [
    String(content || "").trim(),
    "",
    "我已根据对话/附件整理出一份「新建需求」草稿，请在下方确认后才会写入系统（不会自动创建）。",
    `标题：${action.title}`,
    `项目：${action.projectId || "（待选择）"}`,
    `优先级：${action.priority}`,
    action.acceptanceCriteria?.length ? `验收要点：${action.acceptanceCriteria.join("；")}` : "验收要点：（可确认时补充）",
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}

module.exports = {
  createAiChatService,
  dataUrlForAttachment,
  normalizeAiChatMessages,
  wantsCreateRequirement,
  extractProposedActions,
  stripActionJson,
  buildLocalRequirementAction,
  appendLocalRequirementDraft,
};
