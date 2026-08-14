const assert = require("node:assert/strict");
const test = require("node:test");
const { createTeamRepository } = require("../src/modules/team/repository");
const { createTeamService } = require("../src/modules/team/service");

test("team repository keeps user writes on the asynchronous database contract", async () => {
  const calls = [];
  const repository = createTeamRepository({
    insert: async (table, value) => calls.push({ type: "insert", table, value }),
    row: async (sql, params) => {
      calls.push({ type: "row", sql, params });
      return { id: "USR-1" };
    },
    rows: async (sql, params) => {
      calls.push({ type: "rows", sql, params });
      return [];
    },
    run: async (sql, params) => {
      calls.push({ type: "run", sql, params });
      return { changes: 1 };
    },
  });

  await repository.createUser({ id: "USR-1" });
  await repository.findOtherUserByEmail({ email: "user@example.com", id: "USR-1" });
  await repository.updateUserPassword({ id: "USR-1", value: "hash" });
  await repository.disableUser("USR-1");

  assert.deepEqual(calls[0], { type: "insert", table: "users", value: { id: "USR-1" } });
  assert.match(calls[1].sql, /email = @email AND id != @id/);
  assert.deepEqual(calls[1].params, { email: "user@example.com", id: "USR-1" });
  assert.match(calls[2].sql, /password_hash = @val, token_version = token_version \+ 1/);
  assert.deepEqual(calls[2].params, { id: "USR-1", val: "hash" });
  assert.match(calls[3].sql, /status = @status/);
  assert.deepEqual(calls[3].params, { id: "USR-1", status: "disabled" });
});

test("team service depends on the named repository snapshot contract", async () => {
  const calls = [];
  const repository = {
    listTeamUsers: async () => { calls.push("users"); return [{ id: "USR-1", name: "Dev", email: "dev@example.com", role: "dev", status: "active" }]; },
    listActiveProjects: async () => { calls.push("projects"); return [{ id: "PRJ-1", name: "Alpha", owner: "Dev", status: "active", progress: 25 }]; },
    listTasks: async () => { calls.push("tasks"); return [{ id: "TASK-1", title: "Implement", owner: "Dev", status: "in_progress", project_id: "PRJ-1", progress: 50, estimated_hours: 2, actual_hours: 1, remaining_hours: 1 }]; },
    listProjectMembers: async () => { calls.push("members"); return []; },
    listActiveRequirements: async () => { calls.push("requirements"); return []; },
    listDefects: async () => { calls.push("defects"); return []; },
    listWorkLogs: async () => { calls.push("workLogs"); return []; },
    listRecentAuditRows: async () => { calls.push("audit"); return []; },
  };
  const service = createTeamService({
    repository,
    normalizeRole: (role) => role || "dev",
    mapUser: (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role, department: row.department || "" }),
    mapProject: (row) => ({ id: row.id, name: row.name, owner: row.owner, status: row.status, progress: row.progress }),
    mapTask: (row) => ({ id: row.id, title: row.title, owner: row.owner, status: row.status, projectId: row.project_id, progress: row.progress, estimatedHours: row.estimated_hours, actualHours: row.actual_hours, remainingHours: row.remaining_hours }),
    mapRequirement: (row) => row,
    mapDefect: (row) => row,
  });

  const [member] = await service.buildTeamMembers();

  assert.deepEqual(calls, ["users", "projects", "tasks", "members", "requirements", "defects", "workLogs", "audit"]);
  assert.equal(member.stats.activeTasks, 1);
  assert.equal(member.stats.estimatedHours, 2);
  assert.equal(member.projects[0].id, "PRJ-1");
});
