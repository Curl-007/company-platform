function createWorkLogHelpers({ normalizeRole, parse, row, rows }) {
  function canSubmitDailyLog(user) {
    return normalizeRole(user?.role) !== "admin";
  }

  function buildWeeklySummary(logs) {
    const entries = Array.isArray(logs) ? logs : [];
    const completed = [];
    const blockers = [];
    const nextPlans = [];
    const linkedRequirements = new Map();
    for (const item of entries) {
      const analysis = parse(item.analysis, {});
      (analysis.completedItems || []).forEach((text) => completed.push(text));
      (analysis.blockers || []).forEach((text) => blockers.push(text));
      if (item.next_plan) nextPlans.push(item.next_plan);
      (analysis.linkedRequirements || []).forEach((entryItem) => {
        if (entryItem?.id) linkedRequirements.set(entryItem.id, entryItem.title || entryItem.id);
      });
    }
    return {
      summary: [
        `本周共提交 ${entries.length} 篇日报。`,
        completed.length ? `已完成事项聚焦在：${[...new Set(completed)].slice(0, 6).join("；")}。` : "本周暂无结构化完成事项。",
        blockers.length ? `当前阻塞主要包括：${[...new Set(blockers)].slice(0, 5).join("；")}。` : "本周未记录明显阻塞。",
        nextPlans.length ? `下周计划集中在：${[...new Set(nextPlans)].slice(0, 4).join("；")}。` : "下周计划尚未补充完整。",
      ].join("\n"),
      completedItems: [...new Set(completed)],
      blockers: [...new Set(blockers)],
      nextPlans: [...new Set(nextPlans)],
      linkedRequirements: [...linkedRequirements.entries()].map(([id, title]) => ({ id, title })),
    };
  }

  function canViewTeamLogs(user) {
    const role = normalizeRole(user?.role);
    return role === "admin" || role === "pm";
  }

  function resolveWorkLogProjectFilter(query) {
    const projectId = String(query.projectId || "").trim();
    const projectName = String(query.project || "").trim();
    if (projectId) {
      const project = row("SELECT id, name FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
      return { id: projectId, name: project?.name || projectName };
    }
    if (projectName) {
      const project = row("SELECT id, name FROM projects WHERE name = @name AND deleted_at IS NULL", { name: projectName });
      return { id: project?.id || "", name: projectName };
    }
    return { id: "", name: "" };
  }

  function workLogMatchesProject(item, projectFilter) {
    if (!projectFilter.id && !projectFilter.name) return true;
    if (projectFilter.id && item.projectId === projectFilter.id) return true;
    if (projectFilter.name && item.project === projectFilter.name) return true;
    return false;
  }

  function buildTeamWeeklySummary(logs, missingMembers, weekKey, project) {
    const grouped = new Map();
    logs.forEach((item) => {
      const key = `${item.author}::${item.role || "dev"}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    const members = [...grouped.entries()].map(([key, entries]) => {
      const [author, role] = key.split("::");
      const summary = buildWeeklySummary(entries);
      const markdown = [
        `# ${author} 周报`,
        "",
        `- 项目：${project || "未绑定项目"}`,
        `- 周起始：${weekKey}`,
        `- 日报数量：${entries.length}`,
        "",
        "## AI 总结",
        summary.summary,
      ].join("\n");
      return { author, role, count: entries.length, summary, markdown };
    });
    const overall = buildWeeklySummary(logs);
    return {
      project,
      weekKey,
      submittedCount: members.length,
      missingCount: missingMembers.length,
      members,
      missingMembers,
      overall,
    };
  }

  function collectProjectMembers(projectFilter) {
    const members = new Map();
    if (!projectFilter?.id && !projectFilter?.name) return [];
    const project = projectFilter.id
      ? row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectFilter.id })
      : row("SELECT * FROM projects WHERE name = @name AND deleted_at IS NULL", { name: projectFilter.name });
    if (!project) return [];

    rows("SELECT * FROM project_members WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
      members.set(`${item.user_name}::${normalizeRole(item.role)}`, { name: item.user_name, role: normalizeRole(item.role) });
    });

    if (project.owner) {
      const pmUser = row("SELECT * FROM users WHERE name = @name AND status = 'active'", { name: project.owner });
      if (pmUser) members.set(`${pmUser.name}::${normalizeRole(pmUser.role)}`, { name: pmUser.name, role: normalizeRole(pmUser.role) });
    }

    rows("SELECT * FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL", { projectId: project.id }).forEach((item) => {
      if (item.assignee && item.assignee_role) {
        members.set(`${item.assignee}::${normalizeRole(item.assignee_role)}`, { name: item.assignee, role: normalizeRole(item.assignee_role) });
      }
    });

    rows("SELECT * FROM tasks WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
      if (item.owner && item.assignee_role) {
        members.set(`${item.owner}::${normalizeRole(item.assignee_role)}`, { name: item.owner, role: normalizeRole(item.assignee_role) });
      }
    });

    rows("SELECT * FROM test_cases WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
      if (item.owner) members.set(`${item.owner}::qa`, { name: item.owner, role: "qa" });
    });

    rows("SELECT * FROM defects WHERE project_id = @projectId", { projectId: project.id }).forEach((item) => {
      if (item.assignee && item.assignee_role) {
        members.set(`${item.assignee}::${normalizeRole(item.assignee_role)}`, { name: item.assignee, role: normalizeRole(item.assignee_role) });
      }
    });

    return [...members.values()].filter((item) => ["pdm", "dev", "qa"].includes(item.role));
  }

  return {
    buildTeamWeeklySummary,
    buildWeeklySummary,
    canSubmitDailyLog,
    canViewTeamLogs,
    collectProjectMembers,
    resolveWorkLogProjectFilter,
    workLogMatchesProject,
  };
}

module.exports = {
  createWorkLogHelpers,
};
