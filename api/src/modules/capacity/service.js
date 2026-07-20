function isoDate(value) {
  const parsed = new Date(`${String(value || "").slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function currentWeek() {
  const date = new Date();
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { periodStart: start, periodEnd: date.toISOString().slice(0, 10) };
}

function resolvePeriod(query = {}) {
  const fallback = currentWeek();
  return {
    periodStart: isoDate(query.periodStart) || fallback.periodStart,
    periodEnd: isoDate(query.periodEnd) || fallback.periodEnd,
  };
}

function boundedNumber(value, fallback, { min = 0, max = 10000 } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function normalizeWorkingWeekdays(value) {
  let source = value;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = []; }
  }
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))].sort((a, b) => a - b);
}

function calendarContext(period, calendar, exceptions) {
  const workingWeekdays = normalizeWorkingWeekdays(calendar?.working_weekdays);
  const exceptionByDate = new Map(exceptions.map((item) => [item.calendar_date, Number(item.is_working_day) === 1]));
  const isWorkingDate = (date) => {
    if (exceptionByDate.has(date)) return exceptionByDate.get(date);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return workingWeekdays.includes(weekday);
  };
  let workingDays = 0;
  const cursor = new Date(`${period.periodStart}T00:00:00.000Z`);
  const end = new Date(`${period.periodEnd}T00:00:00.000Z`);
  while (cursor <= end) {
    if (isWorkingDate(cursor.toISOString().slice(0, 10))) workingDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { workingWeekdays, isWorkingDate, workingDays, exceptions };
}

function mapPlan(plan, calendarWorkingDays = null) {
  if (!plan) return null;
  const manualWorkingDays = Math.max(0, Number(plan.working_days) || 0);
  const useCalendar = Number(plan.use_calendar) !== 0;
  const workingDays = useCalendar && calendarWorkingDays !== null ? calendarWorkingDays : manualWorkingDays;
  const theoreticalHours = Math.max(0, workingDays * Number(plan.daily_hours));
  const unavailableHours = [
    plan.meeting_hours,
    plan.training_hours,
    plan.support_hours,
    plan.other_commitment_hours,
  ].reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return {
    id: plan.id,
    userId: plan.user_id,
    periodStart: plan.period_start,
    periodEnd: plan.period_end,
    workingDays,
    manualWorkingDays,
    useCalendar,
    calendarWorkingDays,
    dailyHours: Number(plan.daily_hours),
    meetingHours: Number(plan.meeting_hours),
    trainingHours: Number(plan.training_hours),
    supportHours: Number(plan.support_hours),
    otherCommitmentHours: Number(plan.other_commitment_hours),
    theoreticalHours,
    unavailableHours,
    effectiveHours: Math.max(0, theoreticalHours - unavailableHours),
    notes: plan.notes || "",
    updatedBy: plan.updated_by || null,
    updatedAt: plan.updated_at,
  };
}

function mapAllocation(allocation, project, effectiveHours) {
  const allocationPercent = Number(allocation.allocation_percent) || 0;
  const configuredHours = allocation.planned_hours === null || allocation.planned_hours === undefined
    ? null
    : Number(allocation.planned_hours);
  const plannedHours = configuredHours === null ? effectiveHours * allocationPercent / 100 : configuredHours;
  return {
    id: allocation.id,
    projectId: allocation.project_id,
    projectName: project?.name || allocation.project_id,
    userId: allocation.user_id,
    periodStart: allocation.period_start,
    periodEnd: allocation.period_end,
    allocationPercent,
    plannedHours: Math.round(plannedHours * 100) / 100,
    configuredPlannedHours: configuredHours,
    notes: allocation.notes || "",
    overloadReason: allocation.overload_reason || "",
    approvalStatus: allocation.approval_status || "approved",
    approvedBy: allocation.approved_by || null,
    approvedAt: allocation.approved_at || null,
    updatedBy: allocation.updated_by || null,
    updatedAt: allocation.updated_at,
  };
}

const DEFAULT_WORKLOAD_THRESHOLDS = Object.freeze({ balancedMin: 0.7, attentionMin: 0.9, overloadedAbove: 1.1 });

function normalizeWorkloadThresholds(value = {}) {
  const thresholds = {
    balancedMin: Number(value.balancedMin ?? DEFAULT_WORKLOAD_THRESHOLDS.balancedMin),
    attentionMin: Number(value.attentionMin ?? DEFAULT_WORKLOAD_THRESHOLDS.attentionMin),
    overloadedAbove: Number(value.overloadedAbove ?? DEFAULT_WORKLOAD_THRESHOLDS.overloadedAbove),
  };
  if (!Object.values(thresholds).every(Number.isFinite) || thresholds.balancedMin < 0 || thresholds.balancedMin > thresholds.attentionMin || thresholds.attentionMin > thresholds.overloadedAbove) return null;
  return thresholds;
}

function workloadRisk(effectiveHours, plannedHours, thresholds = DEFAULT_WORKLOAD_THRESHOLDS) {
  if (effectiveHours <= 0) return { code: "unconfigured", label: "未配置" };
  const ratio = plannedHours / effectiveHours;
  if (ratio > thresholds.overloadedAbove) return { code: "overloaded", label: "过载" };
  if (ratio >= thresholds.attentionMin) return { code: "attention", label: "关注" };
  if (ratio >= thresholds.balancedMin) return { code: "balanced", label: "平衡" };
  return { code: "underallocated", label: "低负载" };
}

function createCapacityService({ repository }) {
  function defaultCalendar() {
    return repository.defaultCalendar();
  }

  function resolveCalendar(period) {
    const calendar = defaultCalendar();
    const exceptions = calendar ? repository.listCalendarExceptions({ calendarId: calendar.id, ...period }) : [];
    return { calendar, ...calendarContext(period, calendar, exceptions) };
  }

  function mapCalendar(context) {
    const { calendar } = context;
    return {
      id: calendar?.id || "",
      name: calendar?.name || "默认工作日历",
      timezone: calendar?.timezone || "Asia/Shanghai",
      workingWeekdays: context.workingWeekdays,
      isDefault: Boolean(calendar?.is_default),
      workingDays: context.workingDays,
      exceptions: context.exceptions.map((item) => ({ id: item.id, calendarId: item.calendar_id, date: item.calendar_date, isWorkingDay: Number(item.is_working_day) === 1, name: item.name || "", createdAt: item.created_at, updatedAt: item.updated_at })),
    };
  }

  function buildOverview(period, userId, thresholds = DEFAULT_WORKLOAD_THRESHOLDS) {
    const users = repository.listActiveUsers(userId);
    const plans = repository.listPlans(period);
    const allocations = repository.listAllocations(period);
    const timeEntries = repository.listTimeEntries(period);
    const inProgressTasks = repository.listInProgressTasks();
    const calendar = resolveCalendar(period);
    const projects = new Map(repository.listProjects().map((project) => [project.id, project]));

    const members = users.map((user) => {
      const plan = mapPlan(plans.find((item) => item.user_id === user.id), calendar.workingDays);
      const effectiveHours = plan?.effectiveHours || 0;
      const memberAllocations = allocations
        .filter((item) => item.user_id === user.id)
        .map((item) => mapAllocation(item, projects.get(item.project_id), effectiveHours));
      const plannedHours = memberAllocations.reduce((sum, item) => sum + item.plannedHours, 0);
      const memberTimeEntries = timeEntries.filter((item) => item.user_id === user.id);
      const actualHours = memberTimeEntries
        .reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
      const unplannedActualHours = memberTimeEntries
        .filter((item) => item.work_nature === "unplanned")
        .reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
      const classifiedActualHours = memberTimeEntries
        .filter((item) => item.work_nature === "planned" || item.work_nature === "unplanned")
        .reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
      const allocationPercent = memberAllocations.reduce((sum, item) => sum + item.allocationPercent, 0);
      const currentWipCount = inProgressTasks.filter((task) => task.assignee_id === user.id || (!task.assignee_id && task.owner === user.name)).length;
      const projectFragmentationCount = new Set(memberAllocations.map((item) => item.projectId)).size;
      return {
        userId: user.id,
        userName: user.name,
        role: user.role,
        plan,
        allocations: memberAllocations,
        effectiveHours,
        plannedHours: Math.round(plannedHours * 100) / 100,
        actualHours: Math.round(actualHours * 100) / 100,
        unplannedActualHours: Math.round(unplannedActualHours * 100) / 100,
        classifiedActualHours: Math.round(classifiedActualHours * 100) / 100,
        unplannedRatio: classifiedActualHours > 0 ? Math.round((unplannedActualHours / classifiedActualHours) * 1000) / 1000 : null,
        currentWipCount,
        projectFragmentationCount,
        fragmentationRisk: projectFragmentationCount >= 3,
        allocationPercent: Math.round(allocationPercent * 100) / 100,
        loadRatio: effectiveHours > 0 ? Math.round((plannedHours / effectiveHours) * 1000) / 1000 : null,
        risk: workloadRisk(effectiveHours, plannedHours, thresholds),
      };
    });

    return {
      period,
      thresholds,
      calendar: mapCalendar(calendar),
      summary: {
        memberCount: members.length,
        configuredCount: members.filter((item) => item.plan).length,
        overloadedCount: members.filter((item) => item.risk.code === "overloaded").length,
        attentionCount: members.filter((item) => item.risk.code === "attention").length,
        pendingOverrideCount: members.reduce((sum, item) => sum + item.allocations.filter((allocation) => allocation.approvalStatus === "pending").length, 0),
        highFragmentationCount: members.filter((item) => item.fragmentationRisk).length,
        totalEffectiveHours: members.reduce((sum, item) => sum + item.effectiveHours, 0),
        totalPlannedHours: members.reduce((sum, item) => sum + item.plannedHours, 0),
        totalActualHours: members.reduce((sum, item) => sum + item.actualHours, 0),
        totalUnplannedActualHours: members.reduce((sum, item) => sum + item.unplannedActualHours, 0),
        totalClassifiedActualHours: members.reduce((sum, item) => sum + item.classifiedActualHours, 0),
      },
      members,
    };
  }

  return { buildOverview, defaultCalendar, mapCalendar, resolveCalendar };
}

module.exports = {
  boundedNumber,
  calendarContext,
  createCapacityService,
  DEFAULT_WORKLOAD_THRESHOLDS,
  isoDate,
  mapAllocation,
  mapPlan,
  normalizeWorkingWeekdays,
  normalizeWorkloadThresholds,
  resolvePeriod,
  workloadRisk,
};
