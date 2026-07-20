const assert = require("node:assert/strict");
const test = require("node:test");
const { createTimeEntriesService, validateInput } = require("../src/modules/timeEntries/service");

test("time entry service validates, normalizes, and maps actual time entries", () => {
  const input = validateInput({
    projectId: " PRJ-1 ",
    workDate: "2026-07-14T08:00:00.000Z",
    hours: 2.345,
    category: "delivery",
    workNature: "planned",
    note: "  Build API  ",
  });
  assert.deepEqual(input, {
    ok: true,
    projectId: "PRJ-1",
    workDate: "2026-07-14",
    hours: 2.35,
    category: "delivery",
    workNature: "planned",
    taskId: null,
    note: "Build API",
  });
  assert.equal(validateInput({ projectId: "PRJ-1", workDate: "invalid", hours: 1, category: "delivery" }).ok, false);
});

test("time entry service applies project scope and task ownership rules", () => {
  const repository = {
    findProject: (id) => id === "PRJ-1" ? { id, name: "Visible project" } : null,
    findTask: (id) => id === "TASK-1" ? { id, project_id: "PRJ-1" } : { id, project_id: "PRJ-2" },
    listProjects: () => [{ id: "PRJ-1", name: "Visible project" }],
    listForUser: () => [{
      id: "TIME-1", user_id: "USR-1", project_id: "PRJ-1", task_id: null,
      work_date: "2026-07-14", hours: 2, category: "delivery", work_nature: "planned", note: "", created_at: "created", updated_at: "updated",
    }],
  };
  const service = createTimeEntriesService({
    repository,
    canAccessProject: (_user, projectId) => projectId === "PRJ-1",
    canWriteProject: (_user, projectId) => projectId === "PRJ-1",
  });
  const input = validateInput({ projectId: "PRJ-1", workDate: "2026-07-14", hours: 2, category: "delivery", taskId: "TASK-1" });
  assert.equal(service.validateProjectAndTask({ id: "USR-1" }, input).ok, true);
  assert.equal(service.validateProjectAndTask({ id: "USR-1" }, { ...input, taskId: "TASK-2" }).code, "VALIDATION_FAILED");
  assert.deepEqual(service.listForUser({ id: "USR-1" }), [{
    id: "TIME-1", userId: "USR-1", projectId: "PRJ-1", projectName: "Visible project", taskId: null,
    workDate: "2026-07-14", hours: 2, category: "delivery", workNature: "planned", note: "", createdAt: "created", updatedAt: "updated",
  }]);
});
