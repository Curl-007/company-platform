const { filterAsync, mapAsync } = require("../../lib/asyncIter");
const CATEGORIES = ["delivery", "support", "meeting", "training", "other"];
const WORK_NATURES = ["planned", "unplanned", "unspecified"];

function isoDate(value) {
  const parsed = new Date(`${String(value || "").slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function mapTimeEntry(item, project) {
  return {
    id: item.id,
    userId: item.user_id,
    projectId: item.project_id,
    projectName: project?.name || item.project_id,
    taskId: item.task_id || null,
    workDate: item.work_date,
    hours: Number(item.hours),
    category: item.category,
    workNature: item.work_nature || "unspecified",
    note: item.note || "",
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function validateInput(body = {}, existing = {}) {
  const projectId = body.projectId !== undefined ? String(body.projectId || "").trim() : existing.project_id;
  const workDate = body.workDate !== undefined ? isoDate(body.workDate) : existing.work_date;
  const hours = body.hours !== undefined ? Number(body.hours) : Number(existing.hours);
  const category = body.category !== undefined ? String(body.category || "").trim() : existing.category;
  const workNature = body.workNature !== undefined ? String(body.workNature || "").trim() : existing.work_nature || "unspecified";
  const taskId = body.taskId !== undefined ? String(body.taskId || "").trim() || null : existing.task_id || null;
  if (!projectId || !workDate || !Number.isFinite(hours) || hours <= 0 || hours > 24 || !CATEGORIES.includes(category) || !WORK_NATURES.includes(workNature)) {
    return { ok: false, message: "projectId, workDate, hours (0-24), category, and workNature are required." };
  }
  return { ok: true, projectId, workDate, hours: Math.round(hours * 100) / 100, category, workNature, taskId, note: body.note !== undefined ? String(body.note || "").trim() : existing.note || "" };
}

function createTimeEntriesService({ canAccessProject, canWriteProject, repository }) {
  async function validateProjectAndTask(user, input) {
    const project = await repository.findProject(input.projectId);
    if (!project) return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND", message: "Project not found." };
    if (!(await canWriteProject(user, input.projectId))) return { ok: false, status: 403, code: "PROJECT_ARCHIVED_OR_ACCESS_DENIED", message: "Cannot record time for an archived or inaccessible project." };
    if (input.taskId) {
      const task = await repository.findTask(input.taskId);
      if (!task || task.project_id !== input.projectId) return { ok: false, status: 400, code: "VALIDATION_FAILED", message: "Task must belong to the selected project." };
    }
    return { ok: true, project };
  }

  return {
    listForUser: async (user, query = {}) => {
      const projects = new Map((await repository.listProjects()).map((project) => [project.id, project]));
      const entries = await repository.listForUser({
        userId: user.id,
        periodStart: query.periodStart ? isoDate(query.periodStart) : "",
        periodEnd: query.periodEnd ? isoDate(query.periodEnd) : "",
        projectId: query.projectId,
      });
      const visible = await filterAsync(entries, async (entry) => await canAccessProject(user, entry.project_id));
      return visible.map((entry) => mapTimeEntry(entry, projects.get(entry.project_id)));
    },
    mapTimeEntry,
    validateInput,
    validateProjectAndTask,
    buildEntry: (input, { id, userId, timestamp }) => ({
      id, user_id: userId, project_id: input.projectId, task_id: input.taskId,
      work_date: input.workDate, hours: input.hours, category: input.category, work_nature: input.workNature,
      note: input.note, created_at: timestamp, updated_at: timestamp,
    }),
    buildUpdate: (input, { id, updatedAt }) => {
      const { ok, ...fields } = input;
      return { ...fields, id, updatedAt };
    },
  };
}

module.exports = { createTimeEntriesService, validateInput };
