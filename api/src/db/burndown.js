function createBurndownService({ row, rows, upsert, now }) {
  if (typeof row !== "function" || typeof rows !== "function" || typeof upsert !== "function" || typeof now !== "function") {
    throw new Error("createBurndownService requires row(), rows(), upsert(), and now() functions.");
  }

  async function recordBurndownSnapshot(sprintId) {
    if (!sprintId) return;
    const today = now().slice(0, 10);
    const taskHours = await rows("SELECT remaining_hours AS h FROM tasks WHERE sprint_id = @sid", { sid: sprintId });
    const total = taskHours.reduce((sum, task) => sum + (Number(task.h) || 0), 0);
    await upsert("burndown_snapshots", {
      id: `BURN-${sprintId}-${today}`,
      sprint_id: sprintId,
      date: today,
      remaining_hours: total,
      created_at: now(),
    }, {
      conflictTarget: ["sprint_id", "date"],
      excludeUpdateColumns: ["id", "created_at"],
    });
  }

  async function buildSprintBurndown(sprintId) {
    const sprint = await row("SELECT * FROM sprints WHERE id = @id", { id: sprintId });
    if (!sprint) return null;
    const tasks = await rows("SELECT * FROM tasks WHERE sprint_id = @sid", { sid: sprintId });
    const totalEstimate = tasks.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
    const snapshots = await rows("SELECT * FROM burndown_snapshots WHERE sprint_id = @sid ORDER BY date ASC", { sid: sprintId });

    const start = sprint.start_date ? sprint.start_date.slice(0, 10) : now().slice(0, 10);
    const end = sprint.end_date ? sprint.end_date.slice(0, 10) : now().slice(0, 10);
    const snapByDate = {};
    snapshots.forEach((snapshot) => { snapByDate[snapshot.date] = snapshot.remaining_hours; });

    const days = enumerateDays(start, end);
    const ideal = days.map((date, index) => ({
      date,
      ideal: days.length > 1 ? Math.round(totalEstimate * (1 - index / (days.length - 1)) * 10) / 10 : totalEstimate,
    }));

    const actual = snapshots.map((snapshot) => ({ date: snapshot.date, remaining: snapshot.remaining_hours }));
    const today = now().slice(0, 10);
    if (!snapByDate[today]) {
      const liveTotal = tasks.reduce((sum, task) => sum + (Number(task.remaining_hours) || 0), 0);
      actual.push({ date: today, remaining: liveTotal });
    }

    return { sprintId, startDate: start, endDate: end, totalEstimate, ideal, actual, taskCount: tasks.length };
  }

  return {
    recordBurndownSnapshot,
    buildSprintBurndown,
  };
}

function enumerateDays(start, end) {
  const out = [];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) return [start];
  const maxDays = 120;
  let count = 0;
  for (let date = new Date(startDate); date <= endDate && count < maxDays; date.setUTCDate(date.getUTCDate() + 1), count += 1) {
    out.push(date.toISOString().slice(0, 10));
  }
  return out.length ? out : [start];
}

module.exports = {
  createBurndownService,
  enumerateDays,
};
