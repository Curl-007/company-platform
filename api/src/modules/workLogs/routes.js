const express = require("express");
const { normalizeRole } = require("../../security/accessControl");
const { validateUploadMeta } = require("../../security/uploadPolicy");

function mapWorkLog(item, { parse, weekKeyOf }) {
  return {
    id: item.id,
    author: item.author,
    authorId: item.author_id || null,
    role: item.role || "dev",
    projectId: item.project_id || null,
    project: item.project,
    content: item.content,
    blockers: item.blockers,
    nextPlan: item.next_plan,
    analysis: parse(item.analysis, {}),
    logDate: item.log_date || item.created_at?.slice(0, 10),
    sourceDocumentId: item.source_document_id || null,
    fileName: item.file_name || null,
    fileType: item.file_type || null,
    weekKey: item.week_key || weekKeyOf(item.log_date || item.created_at),
    weeklySummary: item.weekly_summary || "",
    createdAt: item.created_at,
  };
}

function createWorkLogsRouter({
  analyzeWorkLog,
  audit,
  beginIdempotentRequest,
  buildTeamWeeklySummary,
  buildWeeklySummary,
  canSubmitDailyLog,
  canViewTeamLogs,
  canWriteProject,
  collectProjectMembers,
  extractTextFromUpload,
  fail,
  isoDateOnly,
  json,
  nextId,
  now,
  ok,
  paginatedResponse,
  parse,
  requirePermission,
  resolveWorkLogProjectFilter,
  repository,
  transaction,
  weekKeyOf,
  workLogMatchesProject,
}) {
  const router = express.Router();
  const mapLog = (item) => mapWorkLog(item, { parse, weekKeyOf });

  router.get("/work-logs", async (req, res) => {
    const allItems = (await repository.listForAuthor({ authorId: req.user.id, author: req.user.name })).map(mapLog);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.get("/work-logs/team", async (req, res) => {
    if (!canViewTeamLogs(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队日报。");
    const roleFilter = req.query.role ? normalizeRole(req.query.role) : "";
    const authorFilter = String(req.query.author || "").trim();
    const projectFilter = resolveWorkLogProjectFilter(req.query);
    const dateFilter = req.query.date ? isoDateOnly(req.query.date) : "";
    let allItems = (await repository.listTeam()).map(mapLog);
    if (roleFilter) allItems = allItems.filter((item) => normalizeRole(item.role) === roleFilter);
    if (authorFilter) allItems = allItems.filter((item) => item.author === authorFilter);
    allItems = allItems.filter((item) => workLogMatchesProject(item, projectFilter));
    if (dateFilter) allItems = allItems.filter((item) => item.logDate === dateFilter);
    res.json(ok(allItems));
  });

  router.post("/work-logs", async (req, res, next) => {
    try {
      if (!canSubmitDailyLog(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有管理员以外的角色可以提交每日日报。");
      if (req.body?.fileName || req.body?.contentBase64) {
        const uploadCheck = validateUploadMeta({
          fileName: req.body?.fileName,
          fileType: req.body?.fileType,
          contentBase64: req.body?.contentBase64,
        });
        if (!uploadCheck.ok) {
          return fail(res, 400, uploadCheck.errorCode || "VALIDATION_FAILED", uploadCheck.message);
        }
      }
      const extractedContent = extractTextFromUpload(req.body?.fileName, req.body?.fileType, req.body?.contentBase64);
      const content = String(req.body?.content ?? extractedContent ?? "").trim();
      if (!content) return fail(res, 400, "VALIDATION_FAILED", "工作日志 content 不能为空。");
      const requestedProjectId = String(req.body?.projectId || "").trim();
      const requestedProjectName = String(req.body?.project || "").trim();
      const matchedProject = requestedProjectId
        ? await repository.findProjectById(requestedProjectId)
        : requestedProjectName
          ? await repository.findProjectByName(requestedProjectName)
          : null;
      if (requestedProjectId && !matchedProject) return fail(res, 400, "VALIDATION_FAILED", "projectId does not match a known project.");
      if (matchedProject && !(await canWriteProject(req.user, matchedProject.id))) {
        return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a work log for an archived or inaccessible project.");
      }
      const logDate = isoDateOnly(req.body?.logDate);
      const weekKey = weekKeyOf(logDate);
      const idempotency = await beginIdempotentRequest(req, res, "work-log.create");
      if (!idempotency) return;
      try {
        const analysis = await analyzeWorkLog({ ...req.body, content });
        const response = await transaction(async () => {
          const id = await nextId("LOG", "work_logs");
          await repository.create({
            id,
            author: req.user.name,
            author_id: req.user.id,
            role: normalizeRole(req.user.role),
            project_id: matchedProject?.id || null,
            project: matchedProject?.name || requestedProjectName,
            content,
            blockers: req.body.blockers || "",
            next_plan: req.body.nextPlan || "",
            analysis: json(analysis),
            log_date: logDate,
            source_document_id: req.body.sourceDocumentId || null,
            file_name: req.body.fileName || null,
            file_type: req.body.fileType || null,
            week_key: weekKey,
            weekly_summary: "",
            created_at: now(),
          });
          const after = await repository.findById(id);
          const created = ok({ id, analysis, content, logDate, weekKey, projectId: matchedProject?.id || null });
          await audit(req.user, "work_log.create", "work_log", id, null, after, req.ip);
          await idempotency.commit(201, created);
          return created;
        });
        res.status(201).json(response);
      } catch (error) {
        await idempotency.abort();
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/work-logs/analyze", async (req, res, next) => {
    try {
      res.json(ok(await analyzeWorkLog(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/ai/logs/analyze", requirePermission("ai:*"), async (req, res, next) => {
    try {
      res.json(ok(await analyzeWorkLog(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/work-logs/weekly-summary", async (req, res) => {
    const role = normalizeRole(req.user?.role);
    const canReadAll = ["admin", "pm"].includes(role);
    const requestedAuthor = String(req.query.author || "").trim();
    const author = canReadAll ? requestedAuthor || req.user?.name : req.user?.name;
    const weekKey = weekKeyOf(req.query.week || now());
    const logs = canReadAll
      ? await repository.listWeeklyForAuthor({ author, weekKey })
      : await repository.listWeeklyForUser({ authorId: req.user.id, author, weekKey });
    const summary = buildWeeklySummary(logs);
    const markdown = [
      `# ${author} 周报`,
      "",
      `- 周起始：${weekKey}`,
      `- 日报数量：${logs.length}`,
      "",
      "## AI 总结",
      summary.summary,
      "",
      "## 本周完成",
      ...(summary.completedItems.length ? summary.completedItems.map((item) => `- ${item}`) : ["- 暂无结构化记录"]),
      "",
      "## 当前阻塞",
      ...(summary.blockers.length ? summary.blockers.map((item) => `- ${item}`) : ["- 暂无阻塞"]),
      "",
      "## 下周计划",
      ...(summary.nextPlans.length ? summary.nextPlans.map((item) => `- ${item}`) : ["- 暂无计划"]),
    ].join("\n");
    res.json(ok({ author, weekKey, count: logs.length, summary, markdown }));
  });

  router.get("/work-logs/team-weekly-summary", async (req, res) => {
    if (!canViewTeamLogs(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队周报。");
    const projectFilter = resolveWorkLogProjectFilter(req.query);
    const project = projectFilter.name;
    const weekKey = weekKeyOf(req.query.week || now());
    const roleFilter = req.query.role ? normalizeRole(req.query.role) : "";
    let logs = await repository.listByWeek(weekKey);
    logs = logs
      .map((item) => ({ ...item, projectId: item.project_id || null, project: item.project || "" }))
      .filter((item) => workLogMatchesProject(item, projectFilter));
    if (roleFilter) logs = logs.filter((item) => normalizeRole(item.role || "dev") === roleFilter);

    const projectUsers = await collectProjectMembers(projectFilter);
    const submitted = new Set(logs.map((item) => `${item.author}::${normalizeRole(item.role || "dev")}`));
    const missingMembers = projectUsers
      .filter((user) => !roleFilter || normalizeRole(user.role) === roleFilter)
      .filter((user) => !submitted.has(`${user.name}::${normalizeRole(user.role)}`))
      .map((user) => ({ name: user.name, role: user.role }));

    res.json(ok(buildTeamWeeklySummary(logs, missingMembers, weekKey, project)));
  });

  return router;
}

module.exports = {
  createWorkLogsRouter,
};
