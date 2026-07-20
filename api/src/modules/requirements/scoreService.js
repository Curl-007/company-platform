function createRequirementScoreService({ row, rows, parse }) {
  function requirementScore(requirementId) {
    const requirement = row("SELECT * FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId });
    if (!requirement) return null;
    // 1) Task completion rate × 0.40
    const linkedTasks = rows("SELECT * FROM tasks WHERE requirement_id = @id", { id: requirementId });
    const taskScore = linkedTasks.length ? Math.round(linkedTasks.reduce((sum, task) => sum + task.progress, 0) / linkedTasks.length) : 0;

    // 2) Test pass rate × 0.30
    const linkedTests = rows("SELECT * FROM test_cases WHERE requirement_id = @id", { id: requirementId });
    const testScore = linkedTests.length
      ? Math.round(linkedTests.reduce((sum, test) => sum + (test.total_cases > 0 ? (test.passed_cases / test.total_cases) * 100 : 0), 0) / linkedTests.length)
      : 0;

    // 3) Work log progress × 0.20 — scan work_logs whose analysis references this requirement
    const allLogs = rows("SELECT analysis FROM work_logs WHERE analysis != ''");
    const matchingLogs = allLogs.filter((log) => {
      const parsed = parse(log.analysis, {});
      const linked = parsed.linkedRequirements || [];
      return linked.some((lr) => (typeof lr === "object" ? lr.id === requirementId : lr === requirementId));
    });
    const logScore = matchingLogs.length ? Math.min(100, matchingLogs.length * 20) : 0;

    // 4) Manual confirmation × 0.10 (stored completion as proxy)
    const manualScore = requirement.completion || 0;

    // Weighted score
    const score = Math.round(taskScore * 0.40 + testScore * 0.30 + logScore * 0.20 + manualScore * 0.10);

    // Hard rules (design doc §5)
    const hardRules = [];
    if (linkedTests.length === 0 && score > 80) {
      hardRules.push("No linked tests — max completion is 80%");
    }
    const openBlockingDefects = rows("SELECT * FROM defects WHERE requirement_id = @id AND status NOT IN ('closed', 'verified', 'rejected')", { id: requirementId });
    if (openBlockingDefects.length > 0 && score > 70) {
      hardRules.push(`Has ${openBlockingDefects.length} open defect(s) — max completion is 70%`);
    }

    let adjustedScore = score;
    if (linkedTests.length === 0) adjustedScore = Math.min(adjustedScore, 80);
    if (openBlockingDefects.length > 0) adjustedScore = Math.min(adjustedScore, 70);

    return { requirementId, score: adjustedScore, taskScore, testScore, logScore, declaredCompletion: requirement.completion, hardRules: hardRules.length ? hardRules : undefined };
  }

  return { requirementScore };
}

module.exports = { createRequirementScoreService };
