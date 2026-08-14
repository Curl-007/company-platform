const { createTeamRepository } = require("./repository");

function createTeamService({
  mapDefect,
  mapProject,
  mapRequirement,
  mapTask,
  mapUser,
  normalizeRole,
  repository,
  rows,
}) {
  // Accept the old rows-only dependency during the server wiring transition.
  const teamRepository = repository || createTeamRepository({ rows });

  function roleSkills(role) {
    const normalized = normalizeRole(role);
    if (normalized === "admin") return ["权限治理", "平台配置", "流程审计"];
    if (normalized === "pm") return ["项目协调", "风险管理", "交付推进"];
    if (normalized === "pdm") return ["产品规划", "需求分析", "路线图管理"];
    if (normalized === "qa") return ["测试设计", "缺陷跟踪", "质量保障"];
    return ["研发实现", "代码评审", "构建发布"];
  }

  function derivePresence(userRow, recentAuditRows) {
    if (userRow.status !== "active") return "offline";
    const lastAudit = recentAuditRows
      .filter((item) => item.actor_id === userRow.id || item.actor_name === userRow.name)
      .map((item) => new Date(item.created_at).getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => b - a)[0];
    if (!lastAudit) return "offline";
    const minutes = (Date.now() - lastAudit) / 60000;
    if (minutes <= 30) return "online";
    if (minutes <= 24 * 60) return "away";
    return "offline";
  }

  async function buildTeamMembers() {
    const users = await teamRepository.listTeamUsers();
    const projects = (await teamRepository.listActiveProjects()).map(mapProject);
    const activeProjectIds = new Set(projects.map((project) => project.id));
    const tasks = (await teamRepository.listTasks()).map(mapTask).filter((task) => activeProjectIds.has(task.projectId));
    const projectMembers = await teamRepository.listProjectMembers();
    const requirements = (await teamRepository.listActiveRequirements()).map(mapRequirement).filter((requirement) => activeProjectIds.has(requirement.projectId));
    const defects = (await teamRepository.listDefects()).map(mapDefect);
    const workLogs = await teamRepository.listWorkLogs();
    const auditRows = await teamRepository.listRecentAuditRows();
    const activeTaskStatuses = new Set(["todo", "in_progress", "blocked", "code_review", "testing", "acceptance"]);
    const closedDefectStatuses = new Set(["closed", "rejected"]);

    return users.map((userRow) => {
      const user = mapUser(userRow);
      const role = normalizeRole(user.role);
      const userTasks = tasks.filter((task) => task.owner === user.name);
      const activeTasks = userTasks.filter((task) => activeTaskStatuses.has(task.status));
      const doneTasks = userTasks.filter((task) => task.status === "done");
      const blockedTasks = userTasks.filter((task) => task.status === "blocked" || Boolean(String(task.blocker || "").trim()));
      const userRequirements = requirements.filter((item) => item.owner === user.name || item.assignee === user.name);
      const userDefects = defects.filter((item) => item.assignee === user.name && !closedDefectStatuses.has(item.status));
      const userLogs = workLogs.filter((item) => item.author === user.name);
      const projectMap = new Map();

      projects
        .filter((project) => project.owner === user.name)
        .forEach((project) => projectMap.set(project.id, { id: project.id, name: project.name, role: "owner", status: project.status, progress: project.progress }));
      projectMembers
        .filter((member) => member.user_id === user.id || (!member.user_id && member.user_name === user.name))
        .forEach((member) => {
          const project = projects.find((item) => item.id === member.project_id);
          if (project) projectMap.set(project.id, { id: project.id, name: project.name, role: normalizeRole(member.role), status: project.status, progress: project.progress });
        });
      tasks
        .filter((task) => task.owner === user.name)
        .forEach((task) => {
          const project = projects.find((item) => item.id === task.projectId);
          if (project && !projectMap.has(project.id)) {
            projectMap.set(project.id, { id: project.id, name: project.name, role, status: project.status, progress: project.progress });
          }
        });
      userRequirements.forEach((requirement) => {
        const project = projects.find((item) => item.id === requirement.projectId);
        if (project && !projectMap.has(project.id)) {
          projectMap.set(project.id, { id: project.id, name: project.name, role, status: project.status, progress: project.progress });
        }
      });

      const recentLogs = userLogs.slice(0, 3).map((item) => ({
        id: item.id,
        projectId: item.project_id || null,
        project: item.project || "",
        content: item.content,
        blockers: item.blockers || "",
        logDate: item.log_date || item.created_at?.slice(0, 10),
        createdAt: item.created_at,
      }));

      return {
        ...user,
        department: user.department || "未归属部门",
        presence: derivePresence(userRow, auditRows),
        skills: roleSkills(role),
        stats: {
          totalTasks: userTasks.length,
          activeTasks: activeTasks.length,
          doneTasks: doneTasks.length,
          blockedTasks: blockedTasks.length,
          requirements: userRequirements.length,
          openDefects: userDefects.length,
          workLogs: userLogs.length,
          blockers: userLogs.filter((item) => String(item.blockers || "").trim()).length + blockedTasks.length + userDefects.length,
          estimatedHours: userTasks.reduce((sum, task) => sum + (Number(task.estimatedHours) || 0), 0),
          actualHours: userTasks.reduce((sum, task) => sum + (Number(task.actualHours) || 0), 0),
          remainingHours: userTasks.reduce((sum, task) => sum + (Number(task.remainingHours) || 0), 0),
        },
        projects: [...projectMap.values()],
        recentTasks: activeTasks.slice(0, 5).map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          projectId: task.projectId,
          progress: task.progress,
          dueDate: task.dueDate,
        })),
        recentLogs,
        lastActiveAt: auditRows.find((item) => item.actor_id === userRow.id || item.actor_name === user.name)?.created_at || null,
      };
    });
  }

  return {
    buildTeamMembers,
    derivePresence,
    roleSkills,
  };
}

module.exports = {
  createTeamService,
};
