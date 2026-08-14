function createTestingRepository({ insert, row, rows, run }) {
  async function testCaseDependencies(testCaseId) {
    const [runCountRow, runSamples, taskCountRow, taskSamples] = await Promise.all([
      row("SELECT COUNT(*) AS count FROM test_runs WHERE test_case_id = @id", { id: testCaseId }),
      rows("SELECT id FROM test_runs WHERE test_case_id = @id ORDER BY id LIMIT 10", { id: testCaseId }),
      row("SELECT COUNT(*) AS count FROM tasks WHERE source_type = 'test_case' AND source_id = @id", { id: testCaseId }),
      rows("SELECT id FROM tasks WHERE source_type = 'test_case' AND source_id = @id ORDER BY id LIMIT 10", { id: testCaseId }),
    ]);
    return {
      testRuns: {
        count: Number(runCountRow?.count || 0),
        sampleIds: runSamples.map((item) => item.id),
      },
      tasks: {
        count: Number(taskCountRow?.count || 0),
        sampleIds: taskSamples.map((item) => item.id),
      },
    };
  }

  async function cascadeDeleteTestCase(testCaseId) {
    const before = await row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
    const runs = await rows("SELECT id FROM test_runs WHERE test_case_id = @id ORDER BY id", { id: testCaseId });
    const tasks = await rows("SELECT id FROM tasks WHERE source_type = 'test_case' AND source_id = @id ORDER BY id", { id: testCaseId });
    await run("DELETE FROM test_runs WHERE test_case_id = @id", { id: testCaseId });
    await run("DELETE FROM tasks WHERE source_type = 'test_case' AND source_id = @id", { id: testCaseId });
    await run("DELETE FROM test_cases WHERE id = @id", { id: testCaseId });
    return { before, runs, tasks };
  }

  async function getTestPlanInputs(projectId) {
    const [requirements, testCases, defects] = await Promise.all([
      rows("SELECT id, title, status, priority FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL ORDER BY id", { projectId }),
      rows("SELECT * FROM test_cases WHERE project_id = @projectId ORDER BY id", { projectId }),
      rows("SELECT id, title, status, severity, requirement_id FROM defects WHERE project_id = @projectId ORDER BY id", { projectId }),
    ]);
    return { requirements, testCases, defects };
  }

  async function listTestCases({ requirementId, projectId } = {}) {
    let sql = "SELECT * FROM test_cases WHERE 1=1";
    const params = {};
    if (requirementId) {
      sql += " AND requirement_id = @rid";
      params.rid = requirementId;
    }
    if (projectId) {
      sql += " AND project_id = @projectId";
      params.projectId = projectId;
    }
    return rows(`${sql} ORDER BY id`, params);
  }

  return {
    applyTestRunResult: ({ id, result }) => run(
      `UPDATE test_cases SET
        passed_cases = passed_cases + CASE WHEN @result = 'passed' THEN 1 ELSE 0 END,
        failed_cases = failed_cases + CASE WHEN @result = 'failed' THEN 1 ELSE 0 END,
        blocked_cases = blocked_cases + CASE WHEN @result = 'blocked' THEN 1 ELSE 0 END,
        status = @result
      WHERE id = @id`,
      { id, result },
    ),
    cascadeDeleteTestCase,
    createTestCase: (testCase) => insert("test_cases", testCase),
    createTestCaseTask: (task) => insert("tasks", task),
    createTestRun: (testRun) => insert("test_runs", testRun),
    deleteTestCase: (id) => run("DELETE FROM test_cases WHERE id = @id", { id }),
    findProject: (id) => row("SELECT id, name FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findRequirementProject: (id) => row(
      "SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL",
      { id },
    ),
    findTestCase: (id) => row("SELECT * FROM test_cases WHERE id = @id", { id }),
    findTestCaseTask: (sourceId) => row(
      "SELECT * FROM tasks WHERE source_type = 'test_case' AND source_id = @sourceId",
      { sourceId },
    ),
    getTestPlanInputs,
    listActiveProjects: () => rows("SELECT id, name FROM projects WHERE deleted_at IS NULL ORDER BY id"),
    listAllTestCases: () => rows("SELECT * FROM test_cases"),
    listTestCases,
    listTestRuns: (testCaseId) => rows(
      "SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC",
      { id: testCaseId },
    ),
    testCaseDependencies,
    updateTestCase: (testCase) => run(
      `UPDATE test_cases SET
        name = @name,
        owner = @owner,
        assignee_role = @assigneeRole,
        description = @description,
        steps = @steps,
        expected_result = @expectedResult,
        requirement_id = @requirementId
      WHERE id = @id`,
      testCase,
    ),
    updateTestCaseStatus: ({ id, status }) => run(
      "UPDATE test_cases SET status = @status WHERE id = @id",
      { id, status },
    ),
    updateTestCaseTask: (id, task) => run(
      `UPDATE tasks SET
        title = @title,
        status = @status,
        status_text = @status_text,
        project_id = @project_id,
        owner = @owner,
        description = @description,
        requirement_id = @requirement_id,
        progress = @progress,
        blocker = @blocker,
        remaining_hours = @remaining_hours,
        kanban_column = @kanban_column,
        assignee_role = @assignee_role,
        version = version + 1
      WHERE id = @id`,
      {
        id,
        title: task.title,
        status: task.status,
        status_text: task.status_text,
        project_id: task.project_id,
        owner: task.owner,
        description: task.description,
        requirement_id: task.requirement_id,
        progress: task.progress,
        blocker: task.blocker,
        remaining_hours: task.remaining_hours,
        kanban_column: task.kanban_column,
        assignee_role: task.assignee_role,
      },
    ),
  };
}

module.exports = {
  createTestingRepository,
};
