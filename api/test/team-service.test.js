const assert = require("node:assert/strict");
const test = require("node:test");
const { createTeamRepository } = require("../src/modules/team/repository");
const { createTeamService } = require("../src/modules/team/service");

function normalizeRole(role) {
  return ["admin", "pm", "pdm", "dev", "qa"].includes(role) ? role : "dev";
}

test("team service builds collaboration context without performance scoring fields", async () => {
  const now = new Date();
  const rowsByTable = {
    users: [
      { id: "USR-1", name: "Dev A", email: "dev@example.com", role: "dev", status: "active", department: "研发部" },
    ],
    projects: [
      { id: "PRJ-1", name: "Alpha", owner: "PM A", status: "active", progress: 45, health_score: 80, deleted_at: null },
    ],
    tasks: [
      { id: "TASK-1", title: "实现接口", owner: "Dev A", status: "in_progress", project_id: "PRJ-1", progress: 50, estimated_hours: 8, actual_hours: 3, remaining_hours: 5 },
      { id: "TASK-2", title: "阻塞任务", owner: "Dev A", status: "blocked", project_id: "PRJ-1", progress: 20, estimated_hours: 4, actual_hours: 2, remaining_hours: 2, blocker: "等待接口" },
      { id: "TASK-3", title: "已完成", owner: "Dev A", status: "done", project_id: "PRJ-1", progress: 100, estimated_hours: 2, actual_hours: 2, remaining_hours: 0 },
    ],
    project_members: [
      { project_id: "PRJ-1", user_id: "USR-1", user_name: "Dev A", role: "dev" },
    ],
    requirements: [
      { id: "REQ-1", title: "登录", owner: "PDM A", assignee: "Dev A", project_id: "PRJ-1", deleted_at: null },
    ],
    defects: [
      { id: "BUG-1", title: "缺陷", assignee: "Dev A", status: "new", project_id: "PRJ-1" },
      { id: "BUG-2", title: "关闭缺陷", assignee: "Dev A", status: "closed", project_id: "PRJ-1" },
    ],
    work_logs: [
      { id: "LOG-1", author: "Dev A", project_id: "PRJ-1", project: "Alpha", content: "完成接口", blockers: "等待联调", log_date: "2026-07-15", created_at: "2026-07-15T08:00:00.000Z" },
    ],
    audit_logs: [
      { actor_id: "USR-1", actor_name: "Dev A", created_at: now.toISOString() },
    ],
  };

  const repository = createTeamRepository({
    rows: (sql) => {
      if (sql.includes("FROM users")) return rowsByTable.users;
      if (sql.includes("FROM projects")) return rowsByTable.projects;
      if (sql.includes("FROM tasks")) return rowsByTable.tasks;
      if (sql.includes("FROM project_members")) return rowsByTable.project_members;
      if (sql.includes("FROM requirements")) return rowsByTable.requirements;
      if (sql.includes("FROM defects")) return rowsByTable.defects;
      if (sql.includes("FROM work_logs")) return rowsByTable.work_logs;
      if (sql.includes("FROM audit_logs")) return rowsByTable.audit_logs;
      return [];
    },
  });

  const service = createTeamService({
    normalizeRole,
    repository,
    mapUser: (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role, department: row.department }),
    mapProject: (row) => ({ id: row.id, name: row.name, owner: row.owner, status: row.status, progress: row.progress }),
    mapTask: (row) => ({
      id: row.id,
      title: row.title,
      owner: row.owner,
      status: row.status,
      projectId: row.project_id,
      progress: row.progress,
      estimatedHours: row.estimated_hours,
      actualHours: row.actual_hours,
      remainingHours: row.remaining_hours,
      blocker: row.blocker,
    }),
    mapRequirement: (row) => ({ id: row.id, owner: row.owner, assignee: row.assignee, projectId: row.project_id }),
    mapDefect: (row) => ({ id: row.id, assignee: row.assignee, status: row.status, projectId: row.project_id }),
  });

  assert.deepEqual(service.roleSkills("dev"), ["研发实现", "代码评审", "构建发布"]);
  assert.equal(service.derivePresence(rowsByTable.users[0], rowsByTable.audit_logs), "online");

  const [member] = await service.buildTeamMembers();
  assert.equal(member.name, "Dev A");
  assert.equal(member.presence, "online");
  assert.equal(member.stats.totalTasks, 3);
  assert.equal(member.stats.activeTasks, 2);
  assert.equal(member.stats.doneTasks, 1);
  assert.equal(member.stats.blockedTasks, 1);
  assert.equal(member.stats.openDefects, 1);
  assert.equal(member.stats.workLogs, 1);
  assert.equal(member.stats.estimatedHours, 14);
  assert.equal(member.stats.actualHours, 7);
  assert.equal(member.stats.remainingHours, 7);
  assert.equal(member.projects.length, 1);
  assert.equal(member.recentTasks.length, 2);
  assert.equal(member.recentLogs.length, 1);

  assert.equal(Object.prototype.hasOwnProperty.call(member.stats, "completionRate"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(member.stats, "score"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(member.stats, "ranking"), false);
});
