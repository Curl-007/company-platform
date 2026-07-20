const express = require("express");
const {
  boundedNumber,
  createCapacityService,
  isoDate,
  mapAllocation,
  mapPlan,
  DEFAULT_WORKLOAD_THRESHOLDS,
  normalizeWorkingWeekdays,
  normalizeWorkloadThresholds,
  resolvePeriod,
} = require("./service");

function createCapacityRouter({
  audit,
  canManageProject,
  canViewCapacity,
  fail,
  nextId,
  now,
  ok,
  repository,
  requirePermission,
}) {
  const router = express.Router();
  const { buildOverview, defaultCalendar, mapCalendar, resolveCalendar } = createCapacityService({ repository });
  const thresholdSettingKey = "capacity_workload_thresholds";
  async function workloadThresholds() {
    const setting = await repository.getSetting(thresholdSettingKey);
    try { return normalizeWorkloadThresholds(JSON.parse(setting?.value || "{}")) || DEFAULT_WORKLOAD_THRESHOLDS; } catch { return DEFAULT_WORKLOAD_THRESHOLDS; }
  }

  router.get("/capacity/overview", async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队容量。");
    res.json(ok(await buildOverview(resolvePeriod(req.query), undefined, await workloadThresholds())));
  });

  router.get("/capacity/me", async (req, res) => {
    const overview = await buildOverview(resolvePeriod(req.query), req.user.id, await workloadThresholds());
    res.json(ok(overview.members[0] || null));
  });

  router.get("/capacity/settings/workload-thresholds", async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看容量阈值。");
    res.json(ok(await workloadThresholds()));
  });

  router.put("/capacity/settings/workload-thresholds", requirePermission("admin:*"), async (req, res) => {
    if (req.user.role !== "admin") return fail(res, 403, "PERMISSION_DENIED", "只有管理员可以调整容量风险阈值。");
    const thresholds = normalizeWorkloadThresholds(req.body || {});
    if (!thresholds) return fail(res, 400, "VALIDATION_FAILED", "阈值必须是非负数字，且平衡下限 ≤ 关注下限 ≤ 过载阈值。");
    const before = await workloadThresholds();
    await repository.saveSetting(thresholdSettingKey, JSON.stringify(thresholds), now());
    await audit(req.user, "capacity.workload_thresholds_update", "app_setting", thresholdSettingKey, before, thresholds, req.ip);
    res.json(ok(thresholds));
  });

  router.get("/capacity/calendar", async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "Only project managers and administrators can view the work calendar.");
    const period = resolvePeriod(req.query);
    if (period.periodEnd < period.periodStart) return fail(res, 400, "VALIDATION_FAILED", "periodEnd must not be before periodStart.");
    res.json(ok({ period, ...mapCalendar(await resolveCalendar(period)) }));
  });

  router.put("/capacity/calendar", requirePermission("project:*"), async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "You cannot maintain the work calendar.");
    const calendar = await defaultCalendar();
    if (!calendar) return fail(res, 500, "CALENDAR_NOT_INITIALIZED", "Default work calendar is not initialized.");
    const body = req.body || {};
    if (body.workingWeekdays !== undefined && (!Array.isArray(body.workingWeekdays) || normalizeWorkingWeekdays(body.workingWeekdays).length !== body.workingWeekdays.length || normalizeWorkingWeekdays(body.workingWeekdays).length === 0)) {
      return fail(res, 400, "VALIDATION_FAILED", "workingWeekdays must contain unique weekdays from 0 to 6.");
    }
    const before = calendar;
    const workingWeekdays = body.workingWeekdays === undefined ? normalizeWorkingWeekdays(calendar.working_weekdays) : normalizeWorkingWeekdays(body.workingWeekdays);
    await repository.updateCalendar({
      id: calendar.id,
      name: body.name === undefined ? calendar.name : String(body.name || "").trim() || calendar.name,
      workingWeekdays: JSON.stringify(workingWeekdays),
      timezone: body.timezone === undefined ? calendar.timezone : String(body.timezone || "").trim() || calendar.timezone,
      updatedAt: now(),
    });
    const after = await defaultCalendar();
    await audit(req.user, "work_calendar.update", "work_calendar", calendar.id, before, after, req.ip);
    const period = resolvePeriod(body);
    res.json(ok({ period, ...mapCalendar(await resolveCalendar(period)) }));
  });

  router.post("/capacity/calendar/exceptions", requirePermission("project:*"), async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "You cannot maintain the work calendar.");
    const calendar = await defaultCalendar();
    const body = req.body || {};
    const date = isoDate(body.date);
    if (!calendar || !date || typeof body.isWorkingDay !== "boolean") return fail(res, 400, "VALIDATION_FAILED", "date and isWorkingDay are required.");
    const existing = await repository.findCalendarException({ calendarId: calendar.id, date });
    const exception = { id: existing?.id || await nextId("CALX", "work_calendar_exceptions"), calendar_id: calendar.id, calendar_date: date, is_working_day: body.isWorkingDay ? 1 : 0, name: String(body.name || "").trim(), created_at: existing?.created_at || now(), updated_at: now() };
    await repository.upsertCalendarException(exception);
    await audit(req.user, "work_calendar.exception_upsert", "work_calendar_exception", exception.id, existing || null, exception, req.ip);
    res.status(existing ? 200 : 201).json(ok({ id: exception.id, calendarId: exception.calendar_id, date: exception.calendar_date, isWorkingDay: Boolean(exception.is_working_day), name: exception.name, createdAt: exception.created_at, updatedAt: exception.updated_at }));
  });

  router.delete("/capacity/calendar/exceptions/:id", requirePermission("project:*"), async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "You cannot maintain the work calendar.");
    const exception = await repository.findCalendarExceptionById(req.params.id);
    if (!exception) return fail(res, 404, "RESOURCE_NOT_FOUND", "Calendar exception not found.");
    await repository.deleteCalendarException(exception.id);
    await audit(req.user, "work_calendar.exception_delete", "work_calendar_exception", exception.id, exception, null, req.ip);
    res.json(ok({ deleted: true, id: exception.id }));
  });

  router.put("/capacity/plans/:userId", requirePermission("project:*"), async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "无权维护团队容量。");
    const user = await repository.findActiveUser(req.params.userId);
    if (!user) return fail(res, 404, "RESOURCE_NOT_FOUND", "Active user not found.");
    const period = resolvePeriod(req.body || {});
    if (period.periodEnd < period.periodStart) return fail(res, 400, "VALIDATION_FAILED", "periodEnd must not be before periodStart.");
    const existing = await repository.findPlan({ userId: req.params.userId, ...period });
    if (req.body?.useCalendar !== undefined && typeof req.body.useCalendar !== "boolean") return fail(res, 400, "VALIDATION_FAILED", "useCalendar must be a boolean.");
    const fields = {
      workingDays: boundedNumber(req.body?.workingDays, Number(existing?.working_days) || 5, { max: 31 }),
      dailyHours: boundedNumber(req.body?.dailyHours, Number(existing?.daily_hours) || 8, { max: 24 }),
      meetingHours: boundedNumber(req.body?.meetingHours, Number(existing?.meeting_hours) || 0),
      trainingHours: boundedNumber(req.body?.trainingHours, Number(existing?.training_hours) || 0),
      supportHours: boundedNumber(req.body?.supportHours, Number(existing?.support_hours) || 0),
      otherCommitmentHours: boundedNumber(req.body?.otherCommitmentHours, Number(existing?.other_commitment_hours) || 0),
    };
    if (Object.values(fields).some((value) => value === null)) return fail(res, 400, "VALIDATION_FAILED", "Capacity fields must be valid non-negative numbers.");
    const useCalendar = req.body?.useCalendar === undefined ? existing?.use_calendar !== 0 : req.body.useCalendar;
    const plan = {
      id: existing?.id || await nextId("CAP", "capacity_plans"),
      user_id: req.params.userId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      working_days: fields.workingDays,
      use_calendar: useCalendar ? 1 : 0,
      daily_hours: fields.dailyHours,
      meeting_hours: fields.meetingHours,
      training_hours: fields.trainingHours,
      support_hours: fields.supportHours,
      other_commitment_hours: fields.otherCommitmentHours,
      notes: String(req.body?.notes || "").trim(),
      updated_by: req.user.id,
      updated_at: now(),
    };
    await repository.upsertPlan(plan);
    const calendar = await resolveCalendar(period);
    const before = existing ? mapPlan(existing, calendar.workingDays) : null;
    const mapped = mapPlan(await repository.findPlanById(plan.id), calendar.workingDays);
    await audit(req.user, "capacity.plan_upsert", "capacity_plan", plan.id, before, mapped, req.ip);
    res.json(ok(mapped));
  });

  router.put("/capacity/allocations", requirePermission("project:*"), async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "无权维护项目投入。");
    const { projectId, userId } = req.body || {};
    if (!projectId || !userId) return fail(res, 400, "VALIDATION_FAILED", "projectId and userId are required.");
    if (!(await canManageProject(req.user, projectId))) return fail(res, 403, "PERMISSION_DENIED", "无权维护该项目的资源投入。");
    const user = await repository.findActiveUser(userId);
    if (!user) return fail(res, 404, "RESOURCE_NOT_FOUND", "Active user not found.");
    const project = await repository.findProject(projectId);
    if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
    const membership = await repository.findProjectMembership({ projectId, userId, userName: user.name });
    if (project.owner !== user.name && !membership) {
      return fail(res, 400, "USER_NOT_PROJECT_MEMBER", "用户必须先加入项目，才能分配项目投入。");
    }
    const period = resolvePeriod(req.body || {});
    if (period.periodEnd < period.periodStart) return fail(res, 400, "VALIDATION_FAILED", "periodEnd must not be before periodStart.");
    const allocationPercent = boundedNumber(req.body?.allocationPercent, 0, { max: 200 });
    const plannedHours = boundedNumber(req.body?.plannedHours, null);
    if (allocationPercent === null || plannedHours === null && req.body?.plannedHours !== undefined && req.body?.plannedHours !== null && req.body?.plannedHours !== "") {
      return fail(res, 400, "VALIDATION_FAILED", "Allocation percent and planned hours must be valid non-negative numbers.");
    }
    if (allocationPercent <= 0 && plannedHours === null) return fail(res, 400, "VALIDATION_FAILED", "Provide allocationPercent or plannedHours.");
    const existing = await repository.findAllocationForProject({ projectId, userId, ...period });
    const plan = await repository.findPlan({ userId, ...period });
    const calendar = await resolveCalendar(period);
    const effectiveHours = mapPlan(plan, calendar.workingDays)?.effectiveHours || 0;
    const currentAllocations = await repository.listOtherAllocations({ userId, ...period, existingId: existing?.id || "" });
    const projectedAllocationPercent = currentAllocations.reduce((sum, item) => sum + (Number(item.allocation_percent) || 0), allocationPercent);
    const hoursFor = (item) => item.planned_hours === null || item.planned_hours === undefined
      ? effectiveHours * (Number(item.allocation_percent) || 0) / 100
      : Number(item.planned_hours) || 0;
    const projectedPlannedHours = currentAllocations.reduce((sum, item) => sum + hoursFor(item), plannedHours === null ? effectiveHours * allocationPercent / 100 : plannedHours);
    const needsOverrideApproval = projectedAllocationPercent > 100 || (effectiveHours > 0 && projectedPlannedHours > effectiveHours);
    const overloadReason = String(req.body?.overloadReason || "").trim();
    if (needsOverrideApproval && !overloadReason) {
      return fail(res, 400, "ALLOCATION_OVERRIDE_REASON_REQUIRED", "投入超过成员有效容量或 100%，必须填写超配原因并提交独立审批。", {
        projectedAllocationPercent,
        projectedPlannedHours,
        effectiveHours,
      });
    }
    const allocation = {
      id: existing?.id || await nextId("ALLOC", "project_allocations"),
      project_id: projectId,
      user_id: userId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      allocation_percent: allocationPercent,
      planned_hours: plannedHours,
      notes: String(req.body?.notes || "").trim(),
      overload_reason: needsOverrideApproval ? overloadReason : null,
      approval_status: needsOverrideApproval ? "pending" : "approved",
      approved_by: needsOverrideApproval ? null : existing?.approved_by || req.user.id,
      approved_at: needsOverrideApproval ? null : existing?.approved_at || now(),
      updated_by: req.user.id,
      updated_at: now(),
    };
    await repository.upsertAllocation(allocation);
    const mapped = mapAllocation(allocation, project, effectiveHours);
    await audit(req.user, needsOverrideApproval ? "capacity.allocation_override_submitted" : "capacity.allocation_upsert", "project_allocation", allocation.id, existing || null, mapped, req.ip);
    res.json(ok(mapped));
  });

  router.patch("/capacity/allocations/:id/approval", requirePermission("admin:*"), async (req, res) => {
    const allocation = await repository.findAllocation(req.params.id);
    if (!allocation) return fail(res, 404, "RESOURCE_NOT_FOUND", "Allocation not found.");
    if (req.user.role !== "admin") return fail(res, 403, "PERMISSION_DENIED", "只有管理员可以审批超配例外。");
    if (allocation.approval_status !== "pending") return fail(res, 409, "ALLOCATION_OVERRIDE_NOT_PENDING", "该超配例外不处于待审批状态。");
    if (allocation.updated_by === req.user.id) return fail(res, 400, "ALLOCATION_SELF_APPROVAL_FORBIDDEN", "提交超配的人员不能审批自己的例外申请。");
    await repository.approveAllocation({ id: allocation.id, approvedBy: req.user.id, approvedAt: now(), updatedAt: now() });
    const after = await repository.findAllocation(allocation.id);
    const project = await repository.findProject(after.project_id);
    const plan = await repository.findPlan({ userId: after.user_id, periodStart: after.period_start, periodEnd: after.period_end });
    const calendar = await resolveCalendar({ periodStart: after.period_start, periodEnd: after.period_end });
    const effectiveHours = mapPlan(plan, calendar.workingDays)?.effectiveHours || 0;
    const mapped = mapAllocation(after, project, effectiveHours);
    await audit(req.user, "capacity.allocation_override_approved", "project_allocation", after.id, allocation, mapped, req.ip);
    res.json(ok(mapped));
  });

  router.delete("/capacity/allocations/:id", requirePermission("project:*"), async (req, res) => {
    if (!canViewCapacity(req.user)) return fail(res, 403, "PERMISSION_DENIED", "无权维护项目投入。");
    const allocation = await repository.findAllocation(req.params.id);
    if (!allocation) return fail(res, 404, "RESOURCE_NOT_FOUND", "Allocation not found.");
    if (!(await canManageProject(req.user, allocation.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权维护该项目的资源投入。");
    await repository.deleteAllocation(req.params.id);
    await audit(req.user, "capacity.allocation_delete", "project_allocation", allocation.id, allocation, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  return router;
}

module.exports = {
  createCapacityRouter,
};
