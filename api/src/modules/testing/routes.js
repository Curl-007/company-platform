const express = require("express");

function createTestingRouter({
  audit,
  canAccessProject,
  canWriteProject,
  ensureRoleAllowed,
  fail,
  insert,
  mapTestCase,
  mapTestRun,
  nextId,
  now,
  ok,
  paginatedResponse,
  requireAnyPermission,
  row,
  rows,
  run,
  syncTestCaseTask,
  testCaseStatuses,
}) {
  const router = express.Router();
  const openDefectStatuses = new Set(["new", "confirmed", "in_fix", "resolved", "verified"]);

  function buildTestPlan(project) {
    const requirements = rows("SELECT id, title, status, priority FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL ORDER BY id", { projectId: project.id });
    const testCases = rows("SELECT * FROM test_cases WHERE project_id = @projectId ORDER BY id", { projectId: project.id });
    const defects = rows("SELECT id, title, status, severity, requirement_id FROM defects WHERE project_id = @projectId ORDER BY id", { projectId: project.id });
    const coveredRequirementIds = new Set(testCases.map((testCase) => testCase.requirement_id).filter(Boolean));
    const untestedRequirements = requirements.filter((requirement) => !coveredRequirementIds.has(requirement.id));
    const totals = testCases.reduce((sum, testCase) => ({
      totalCases: sum.totalCases + Number(testCase.total_cases || 0),
      passedCases: sum.passedCases + Number(testCase.passed_cases || 0),
      failedCases: sum.failedCases + Number(testCase.failed_cases || 0),
      blockedCases: sum.blockedCases + Number(testCase.blocked_cases || 0),
    }), { totalCases: 0, passedCases: 0, failedCases: 0, blockedCases: 0 });
    const executedCases = totals.passedCases + totals.failedCases + totals.blockedCases;
    const openDefects = defects.filter((defect) => openDefectStatuses.has(defect.status));
    return {
      id: `TP-${project.id}`,
      projectId: project.id,
      projectName: project.name,
      status: openDefects.length || untestedRequirements.length ? "attention" : "ready",
      requirementCount: requirements.length,
      coveredRequirementCount: coveredRequirementIds.size,
      coverageRate: requirements.length ? Math.round((coveredRequirementIds.size / requirements.length) * 100) : 0,
      testCaseCount: testCases.length,
      totalCases: totals.totalCases,
      executedCases,
      passedCases: totals.passedCases,
      failedCases: totals.failedCases,
      blockedCases: totals.blockedCases,
      passRate: executedCases ? Math.round((totals.passedCases / executedCases) * 100) : 0,
      openDefectCount: openDefects.length,
      untestedRequirements: untestedRequirements.map((requirement) => ({ id: requirement.id, title: requirement.title, priority: requirement.priority, status: requirement.status })),
      openDefects: openDefects.map((defect) => ({ id: defect.id, title: defect.title, severity: defect.severity, status: defect.status, requirementId: defect.requirement_id || null })),
      generatedAt: now(),
    };
  }

  router.get("/test-plans", (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId).trim() : "";
    if (projectId) {
      const project = row("SELECT id, name FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
      if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      if (!canAccessProject(req.user, project.id)) return fail(res, 403, "PERMISSION_DENIED", "You cannot access this project's test plan.");
      return res.json(ok([buildTestPlan(project)]));
    }
    const plans = rows("SELECT id, name FROM projects WHERE deleted_at IS NULL ORDER BY id")
      .filter((project) => canAccessProject(req.user, project.id))
      .map(buildTestPlan);
    res.json(ok(paginatedResponse(plans, req.query)));
  });

  router.get("/test-cases", (req, res) => {
    const { requirementId, projectId } = req.query;
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
    sql += " ORDER BY id";
    const allItems = rows(sql, params)
      .filter((testCase) => canAccessProject(req.user, testCase.project_id))
      .map(mapTestCase);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/test-cases", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
    const { requirementId, projectId, title, description, steps, expectedResult, owner, assigneeRole } = req.body || {};
    if (!title || (!requirementId && !projectId)) return fail(res, 400, "VALIDATION_FAILED", "title and requirementId or projectId are required.");
    const requirement = requirementId ? row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId }) : null;
    if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (requirement && projectId && requirement.project_id !== projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Requirement and projectId must refer to the same project.");
    }
    const targetProjectId = projectId || requirement?.project_id;
    if (!targetProjectId) return fail(res, 400, "VALIDATION_FAILED", "A valid project is required for the test case.");
    if (!canWriteProject(req.user, targetProjectId)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a test case in an archived or inaccessible project.");
    if (!canAccessProject(req.user, targetProjectId)) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建测试用例。");
    if (assigneeRole) {
      const roleError = ensureRoleAllowed(assigneeRole, ["qa", "dev"], "assigneeRole");
      if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
    }
    const testCase = {
      id: nextId("TC", "test_cases"),
      name: String(title).trim(),
      requirement_id: requirementId || null,
      project_id: targetProjectId,
      status: "active",
      owner: owner || req.user.name,
      assignee_role: assigneeRole || "qa",
      total_cases: 0,
      passed_cases: 0,
      failed_cases: 0,
      blocked_cases: 0,
      description: String(description || ""),
      steps: JSON.stringify(steps || []),
      expected_result: String(expectedResult || ""),
    };
    insert("test_cases", testCase);
    syncTestCaseTask(testCase);
    audit(req.user, "test_case.create", "test_case", testCase.id, null, testCase, req.ip);
    res.status(201).json(ok(mapTestCase(testCase)));
  });

  router.patch("/test-cases/:id/status", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
    const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!canWriteProject(req.user, before.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot change a test case in an archived or inaccessible project.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权变更该测试用例状态。");
    const { status } = req.body || {};
    if (!status || !testCaseStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Test case status must be one of: ${testCaseStatuses.join(", ")}`);
    }
    run("UPDATE test_cases SET status = @status WHERE id = @id", { id: req.params.id, status });
    const after = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    syncTestCaseTask(after);
    audit(req.user, "test_case.status_update", "test_case", req.params.id, before, after, req.ip);
    res.json(ok(mapTestCase(after)));
  });

  router.patch("/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
    const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!canWriteProject(req.user, before.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot update a test case in an archived or inaccessible project.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该测试用例。");
    const { name, owner, description, steps, expectedResult, requirementId, assigneeRole } = req.body || {};
    if (name !== undefined) run("UPDATE test_cases SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
    if (owner !== undefined) run("UPDATE test_cases SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
    if (assigneeRole !== undefined) run("UPDATE test_cases SET assignee_role = @role WHERE id = @id", { id: req.params.id, role: assigneeRole || null });
    if (description !== undefined) run("UPDATE test_cases SET description = @desc WHERE id = @id", { id: req.params.id, desc: description });
    if (steps !== undefined) run("UPDATE test_cases SET steps = @steps WHERE id = @id", { id: req.params.id, steps: JSON.stringify(steps) });
    if (expectedResult !== undefined) run("UPDATE test_cases SET expected_result = @result WHERE id = @id", { id: req.params.id, result: expectedResult });
    if (requirementId !== undefined) {
      const requirement = requirementId ? row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId }) : null;
      if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
      if (requirement && requirement.project_id !== before.project_id) {
        return fail(res, 400, "VALIDATION_FAILED", "Requirement must belong to the same project as the test case.");
      }
      run("UPDATE test_cases SET requirement_id = @rid WHERE id = @id", { id: req.params.id, rid: requirementId || null });
    }
    const after = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    syncTestCaseTask(after);
    audit(req.user, "test_case.update", "test_case", req.params.id, before, after, req.ip);
    res.json(ok(mapTestCase(after)));
  });

  router.delete("/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
    const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!canWriteProject(req.user, before.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete a test case in an archived or inaccessible project.");
    if (!canAccessProject(req.user, before.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权删除该测试用例。");
    run("DELETE FROM test_cases WHERE id = @id", { id: req.params.id });
    audit(req.user, "test_case.delete", "test_case", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/tests", (req, res) => res.json(ok(
    rows("SELECT * FROM test_cases")
      .filter((testCase) => canAccessProject(req.user, testCase.project_id))
      .map(mapTestCase),
  )));

  router.post("/tests", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
    const { name, requirementId, projectId, owner, totalCases } = req.body || {};
    if (!name || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Test name and projectId are required.");
    const requirement = requirementId ? row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId }) : null;
    if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (requirement && requirement.project_id !== projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Requirement and projectId must refer to the same project.");
    }
    if (!canWriteProject(req.user, projectId)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a test case in an archived or inaccessible project.");
    if (!canAccessProject(req.user, projectId)) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建测试用例。");
    const testCase = {
      id: nextId("TEST", "test_cases"),
      name: String(name).trim(),
      requirement_id: requirementId || null,
      project_id: projectId,
      status: "active",
      owner: owner || req.user.name,
      total_cases: Number(totalCases) || 0,
      passed_cases: 0,
      failed_cases: 0,
      blocked_cases: 0,
    };
    insert("test_cases", testCase);
    audit(req.user, "test_case.create", "test_case", testCase.id, null, testCase, req.ip);
    res.status(201).json(ok(mapTestCase(testCase)));
  });

  router.post("/test-runs", requireAnyPermission(["project:*", "test:*"]), (req, res) => {
    const { testCaseId, result, notes } = req.body || {};
    if (!testCaseId || !result) return fail(res, 400, "VALIDATION_FAILED", "testCaseId and result are required.");
    if (!["passed", "failed", "blocked"].includes(result)) return fail(res, 400, "VALIDATION_FAILED", "result must be one of: passed, failed, blocked.");
    const testCase = row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
    if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!canWriteProject(req.user, testCase.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot execute a test case in an archived or inaccessible project.");
    if (!canAccessProject(req.user, testCase.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权执行该测试用例。");
    const id = nextId("TR", "test_runs");
    const testRun = {
      id,
      test_case_id: testCaseId,
      result,
      notes: notes || "",
      executed_by: req.user.name || "Unknown",
      created_at: now(),
    };
    insert("test_runs", testRun);
    run(`UPDATE test_cases SET
      passed_cases = passed_cases + CASE WHEN @result = 'passed' THEN 1 ELSE 0 END,
      failed_cases = failed_cases + CASE WHEN @result = 'failed' THEN 1 ELSE 0 END,
      blocked_cases = blocked_cases + CASE WHEN @result = 'blocked' THEN 1 ELSE 0 END,
      status = @result
    WHERE id = @id`, { id: testCaseId, result });
    const after = row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
    syncTestCaseTask(after);
    audit(req.user, "test_run.create", "test_run", id, null, testRun, req.ip);
    res.status(201).json(ok(mapTestRun(testRun)));
  });

  router.get("/test-cases/:id/runs", (req, res) => {
    const testCase = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!canAccessProject(req.user, testCase.project_id)) return fail(res, 403, "PERMISSION_DENIED", "无权访问该测试执行记录。");
    const runs = rows("SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC", { id: req.params.id });
    res.json(ok(runs.map(mapTestRun)));
  });

  return router;
}

module.exports = {
  createTestingRouter,
};
