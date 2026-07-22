const express = require("express");
const { filterAsync, mapAsync } = require("../../lib/asyncIter");

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

  async function buildTestPlan(project) {
    const requirements = await rows("SELECT id, title, status, priority FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL ORDER BY id", { projectId: project.id });
    const testCases = await rows("SELECT * FROM test_cases WHERE project_id = @projectId ORDER BY id", { projectId: project.id });
    const defects = await rows("SELECT id, title, status, severity, requirement_id FROM defects WHERE project_id = @projectId ORDER BY id", { projectId: project.id });
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

  router.get("/test-plans", async (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId).trim() : "";
    if (projectId) {
      const project = await row("SELECT id, name FROM projects WHERE id = @id AND deleted_at IS NULL", { id: projectId });
      if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "You cannot access this project's test plan.");
      return res.json(ok([await buildTestPlan(project)]));
    }
    const projects = await rows("SELECT id, name FROM projects WHERE deleted_at IS NULL ORDER BY id");
    const visible = await filterAsync(projects, async (project) => await canAccessProject(req.user, project.id));
    const plans = await mapAsync(visible, async (project) => await buildTestPlan(project));
    res.json(ok(paginatedResponse(plans, req.query)));
  });

  router.get("/test-cases", async (req, res) => {
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
    const rowsResult = await rows(sql, params);
    const visible = await filterAsync(rowsResult, async (testCase) => await canAccessProject(req.user, testCase.project_id));
    const allItems = visible.map(mapTestCase);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/test-cases", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const { requirementId, projectId, title, description, steps, expectedResult, owner, assigneeRole } = req.body || {};
    if (!title || (!requirementId && !projectId)) return fail(res, 400, "VALIDATION_FAILED", "title and requirementId or projectId are required.");
    const requirement = requirementId ? await row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId }) : null;
    if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (requirement && projectId && requirement.project_id !== projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Requirement and projectId must refer to the same project.");
    }
    const targetProjectId = projectId || requirement?.project_id;
    if (!targetProjectId) return fail(res, 400, "VALIDATION_FAILED", "A valid project is required for the test case.");
    if (!(await canWriteProject(req.user, targetProjectId))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, targetProjectId))) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建测试用例。");
    if (assigneeRole) {
      const roleError = ensureRoleAllowed(assigneeRole, ["qa", "dev"], "assigneeRole");
      if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
    }
    const testCase = {
      id: await nextId("TC", "test_cases"),
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
    await insert("test_cases", testCase);
    await syncTestCaseTask(testCase);
    await audit(req.user, "test_case.create", "test_case", testCase.id, null, testCase, req.ip);
    res.status(201).json(ok(mapTestCase(testCase)));
  });

  router.patch("/test-cases/:id/status", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const before = await row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot change a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权变更该测试用例状态。");
    const { status } = req.body || {};
    if (!status || !testCaseStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Test case status must be one of: ${testCaseStatuses.join(", ")}`);
    }
    await run("UPDATE test_cases SET status = @status WHERE id = @id", { id: req.params.id, status });
    const after = await row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    await syncTestCaseTask(after);
    await audit(req.user, "test_case.status_update", "test_case", req.params.id, before, after, req.ip);
    res.json(ok(mapTestCase(after)));
  });

  router.patch("/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const before = await row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot update a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该测试用例。");
    const { name, owner, description, steps, expectedResult, requirementId, assigneeRole } = req.body || {};
    if (name !== undefined) await run("UPDATE test_cases SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
    if (owner !== undefined) await run("UPDATE test_cases SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
    if (assigneeRole !== undefined) await run("UPDATE test_cases SET assignee_role = @role WHERE id = @id", { id: req.params.id, role: assigneeRole || null });
    if (description !== undefined) await run("UPDATE test_cases SET description = @desc WHERE id = @id", { id: req.params.id, desc: description });
    if (steps !== undefined) await run("UPDATE test_cases SET steps = @steps WHERE id = @id", { id: req.params.id, steps: JSON.stringify(steps) });
    if (expectedResult !== undefined) await run("UPDATE test_cases SET expected_result = @result WHERE id = @id", { id: req.params.id, result: expectedResult });
    if (requirementId !== undefined) {
      const requirement = requirementId ? await row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId }) : null;
      if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
      if (requirement && requirement.project_id !== before.project_id) {
        return fail(res, 400, "VALIDATION_FAILED", "Requirement must belong to the same project as the test case.");
      }
      await run("UPDATE test_cases SET requirement_id = @rid WHERE id = @id", { id: req.params.id, rid: requirementId || null });
    }
    const after = await row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    await syncTestCaseTask(after);
    await audit(req.user, "test_case.update", "test_case", req.params.id, before, after, req.ip);
    res.json(ok(mapTestCase(after)));
  });

  router.delete("/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const before = await row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该测试用例。");
    await run("DELETE FROM test_cases WHERE id = @id", { id: req.params.id });
    await audit(req.user, "test_case.delete", "test_case", req.params.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/tests", async (req, res) => {
    const rowsResult = await rows("SELECT * FROM test_cases");
    const visible = await filterAsync(rowsResult, async (testCase) => await canAccessProject(req.user, testCase.project_id));
    res.json(ok(visible.map(mapTestCase)));
  });

  router.post("/tests", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const { name, requirementId, projectId, owner, totalCases } = req.body || {};
    if (!name || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Test name and projectId are required.");
    const requirement = requirementId ? await row("SELECT project_id FROM requirements WHERE id = @id AND deleted_at IS NULL", { id: requirementId }) : null;
    if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (requirement && requirement.project_id !== projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Requirement and projectId must refer to the same project.");
    }
    if (!(await canWriteProject(req.user, projectId))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, projectId))) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建测试用例。");
    const testCase = {
      id: await nextId("TEST", "test_cases"),
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
    await insert("test_cases", testCase);
    await audit(req.user, "test_case.create", "test_case", testCase.id, null, testCase, req.ip);
    res.status(201).json(ok(mapTestCase(testCase)));
  });

  router.post("/test-runs", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const { testCaseId, result, notes } = req.body || {};
    if (!testCaseId || !result) return fail(res, 400, "VALIDATION_FAILED", "testCaseId and result are required.");
    if (!["passed", "failed", "blocked"].includes(result)) return fail(res, 400, "VALIDATION_FAILED", "result must be one of: passed, failed, blocked.");
    const testCase = await row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
    if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, testCase.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot execute a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, testCase.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权执行该测试用例。");
    const id = await nextId("TR", "test_runs");
    const testRun = {
      id,
      test_case_id: testCaseId,
      result,
      notes: notes || "",
      executed_by: req.user.name || "Unknown",
      created_at: now(),
    };
    await insert("test_runs", testRun);
    await run(`UPDATE test_cases SET
      passed_cases = passed_cases + CASE WHEN @result = 'passed' THEN 1 ELSE 0 END,
      failed_cases = failed_cases + CASE WHEN @result = 'failed' THEN 1 ELSE 0 END,
      blocked_cases = blocked_cases + CASE WHEN @result = 'blocked' THEN 1 ELSE 0 END,
      status = @result
    WHERE id = @id`, { id: testCaseId, result });
    const after = await row("SELECT * FROM test_cases WHERE id = @id", { id: testCaseId });
    await syncTestCaseTask(after);
    await audit(req.user, "test_run.create", "test_run", id, null, testRun, req.ip);
    res.status(201).json(ok(mapTestRun(testRun)));
  });

  router.get("/test-cases/:id/runs", async (req, res) => {
    const testCase = await row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
    if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canAccessProject(req.user, testCase.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该测试执行记录。");
    const runs = await rows("SELECT * FROM test_runs WHERE test_case_id = @id ORDER BY created_at DESC", { id: req.params.id });
    res.json(ok(runs.map(mapTestRun)));
  });

  return router;
}

module.exports = {
  createTestingRouter,
};
