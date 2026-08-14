const express = require("express");
const { filterAsync, mapAsync } = require("../../lib/asyncIter");
const { createTestingRepository } = require("./repository");
const { ensureRoleAllowed } = require("./validation");

function createTestingRouter({
  audit,
  canAccessProject,
  canWriteProject,
  fail,
  insert,
  mapTestCase,
  mapTestRun,
  nextId,
  now,
  ok,
  paginatedResponse,
  repository: suppliedRepository,
  requireAnyPermission,
  row,
  rows,
  run,
  syncTestCaseTask,
  testCaseStatuses,
  transaction = async (work) => work(),
}) {
  const router = express.Router();
  const repository = suppliedRepository || createTestingRepository({ insert, row, rows, run });
  const openDefectStatuses = new Set(["new", "confirmed", "in_fix", "resolved", "verified"]);

  async function testCaseDependencies(testCaseId) {
    return repository.testCaseDependencies(testCaseId);
  }

  // Cascade delete a test case together with its leaf dependencies
  // (test execution records and sync tasks). All deletes run inside the
  // caller's transaction; audit snapshots are captured before deletion.
  // Shared by the test-case route and the requirement cascade.
  async function cascadeDeleteTestCase(testCaseId, { audit: auditLog, user, ip }) {
    const { before, runs, tasks } = await repository.cascadeDeleteTestCase(testCaseId);
    if (auditLog) {
      await auditLog(user, "test_case.cascade_delete", "test_case", testCaseId, before, null, ip);
      for (const item of runs) await auditLog(user, "test_case.cascade_delete", "test_run", item.id, { id: item.id, testCaseId }, null, ip);
      for (const item of tasks) await auditLog(user, "test_case.cascade_delete", "task", item.id, { id: item.id, testCaseId }, null, ip);
    }
  }

  async function buildTestPlan(project) {
    const { requirements, testCases, defects } = await repository.getTestPlanInputs(project.id);
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
      const project = await repository.findProject(projectId);
      if (!project) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
      if (!(await canAccessProject(req.user, project.id))) return fail(res, 403, "PERMISSION_DENIED", "You cannot access this project's test plan.");
      return res.json(ok([await buildTestPlan(project)]));
    }
    const projects = await repository.listActiveProjects();
    const visible = await filterAsync(projects, async (project) => await canAccessProject(req.user, project.id));
    const plans = await mapAsync(visible, async (project) => await buildTestPlan(project));
    res.json(ok(paginatedResponse(plans, req.query)));
  });

  router.get("/test-cases", async (req, res) => {
    const { requirementId, projectId } = req.query;
    const rowsResult = await repository.listTestCases({ requirementId, projectId });
    const visible = await filterAsync(rowsResult, async (testCase) => await canAccessProject(req.user, testCase.project_id));
    const allItems = visible.map(mapTestCase);
    const data = paginatedResponse(allItems, req.query);
    res.json(ok(data));
  });

  router.post("/test-cases", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const { requirementId, projectId, title, description, steps, expectedResult, owner, assigneeRole } = req.body || {};
    if (!title || (!requirementId && !projectId)) return fail(res, 400, "VALIDATION_FAILED", "title and requirementId or projectId are required.");
    const requirement = requirementId ? await repository.findRequirementProject(requirementId) : null;
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
    const testCase = await transaction(async () => {
      const record = {
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
      await repository.createTestCase(record);
      await syncTestCaseTask(record);
      await audit(req.user, "test_case.create", "test_case", record.id, null, record, req.ip);
      return record;
    });
    res.status(201).json(ok(mapTestCase(testCase)));
  });

  router.patch("/test-cases/:id/status", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const before = await repository.findTestCase(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot change a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权变更该测试用例状态。");
    const { status } = req.body || {};
    if (!status || !testCaseStatuses.includes(status)) {
      return fail(res, 400, "VALIDATION_FAILED", `Test case status must be one of: ${testCaseStatuses.join(", ")}`);
    }
    const after = await transaction(async () => {
      await repository.updateTestCaseStatus({ id: req.params.id, status });
      const updated = await repository.findTestCase(req.params.id);
      await syncTestCaseTask(updated);
      await audit(req.user, "test_case.status_update", "test_case", req.params.id, before, updated, req.ip);
      return updated;
    });
    res.json(ok(mapTestCase(after)));
  });

  router.patch("/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const before = await repository.findTestCase(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot update a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权编辑该测试用例。");
    const { name, owner, description, steps, expectedResult, requirementId, assigneeRole } = req.body || {};
    if (assigneeRole !== undefined && assigneeRole) {
      const roleError = ensureRoleAllowed(assigneeRole, ["qa", "dev"], "assigneeRole");
      if (roleError) return fail(res, 400, "VALIDATION_FAILED", roleError);
    }
    let nextRequirementId = before.requirement_id;
    if (requirementId !== undefined) {
      const requirement = requirementId ? await repository.findRequirementProject(requirementId) : null;
      if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
      if (requirement && requirement.project_id !== before.project_id) {
        return fail(res, 400, "VALIDATION_FAILED", "Requirement must belong to the same project as the test case.");
      }
      nextRequirementId = requirementId || null;
    }
    const nextName = name === undefined ? before.name : String(name).trim();
    if (!nextName) return fail(res, 400, "VALIDATION_FAILED", "Test case name is required.");
    const nextOwner = owner === undefined ? before.owner : String(owner).trim();
    const nextAssigneeRole = assigneeRole === undefined ? before.assignee_role : (assigneeRole || null);
    const nextDescription = description === undefined ? before.description : description;
    const nextSteps = steps === undefined ? before.steps : JSON.stringify(steps);
    const nextExpectedResult = expectedResult === undefined ? before.expected_result : expectedResult;

    const after = await transaction(async () => {
      await repository.updateTestCase({
        id: req.params.id,
        name: nextName,
        owner: nextOwner,
        assigneeRole: nextAssigneeRole,
        description: nextDescription,
        steps: nextSteps,
        expectedResult: nextExpectedResult,
        requirementId: nextRequirementId,
      });
      const updated = await repository.findTestCase(req.params.id);
      await syncTestCaseTask(updated);
      await audit(req.user, "test_case.update", "test_case", req.params.id, before, updated, req.ip);
      return updated;
    });
    res.json(ok(mapTestCase(after)));
  });

  router.delete("/test-cases/:id", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const before = await repository.findTestCase(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, before.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, before.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权删除该测试用例。");
    const wantsCascade = req.query.cascade === "true";
    if (wantsCascade) {
      await transaction(async () => {
        await cascadeDeleteTestCase(req.params.id, { audit, user: req.user, ip: req.ip });
      });
      return res.json(ok({ deleted: true, id: req.params.id, cascaded: true }));
    }
    const deletion = await transaction(async () => {
      const dependencies = await testCaseDependencies(req.params.id);
      if (dependencies.testRuns.count > 0 || dependencies.tasks.count > 0) return { dependencies };
      await repository.deleteTestCase(req.params.id);
      await audit(req.user, "test_case.delete", "test_case", req.params.id, before, null, req.ip);
      return null;
    });
    if (deletion) {
      return fail(res, 409, "TEST_CASE_HAS_DEPENDENCIES", "测试用例仍有执行记录或同步任务，不能直接删除。", deletion);
    }
    res.json(ok({ deleted: true, id: req.params.id }));
  });

  router.get("/tests", async (req, res) => {
    const rowsResult = await repository.listAllTestCases();
    const visible = await filterAsync(rowsResult, async (testCase) => await canAccessProject(req.user, testCase.project_id));
    res.json(ok(visible.map(mapTestCase)));
  });

  router.post("/tests", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const { name, requirementId, projectId, owner, totalCases } = req.body || {};
    if (!name || !projectId) return fail(res, 400, "VALIDATION_FAILED", "Test name and projectId are required.");
    const requirement = requirementId ? await repository.findRequirementProject(requirementId) : null;
    if (requirementId && !requirement) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
    if (requirement && requirement.project_id !== projectId) {
      return fail(res, 400, "VALIDATION_FAILED", "Requirement and projectId must refer to the same project.");
    }
    if (!(await canWriteProject(req.user, projectId))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot create a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, projectId))) return fail(res, 403, "PERMISSION_DENIED", "无权在该项目中创建测试用例。");
    const testCase = await transaction(async () => {
      const record = {
        id: await nextId("TEST", "test_cases"),
        name: String(name).trim(),
        requirement_id: requirementId || null,
        project_id: projectId,
        status: "active",
        owner: owner || req.user.name,
        assignee_role: "qa",
        total_cases: Number(totalCases) || 0,
        passed_cases: 0,
        failed_cases: 0,
        blocked_cases: 0,
      };
      await repository.createTestCase(record);
      await syncTestCaseTask(record);
      await audit(req.user, "test_case.create", "test_case", record.id, null, record, req.ip);
      return record;
    });
    res.status(201).json(ok(mapTestCase(testCase)));
  });

  router.post("/test-runs", requireAnyPermission(["project:*", "test:*"]), async (req, res) => {
    const { testCaseId, result, notes } = req.body || {};
    if (!testCaseId || !result) return fail(res, 400, "VALIDATION_FAILED", "testCaseId and result are required.");
    if (!["passed", "failed", "blocked"].includes(result)) return fail(res, 400, "VALIDATION_FAILED", "result must be one of: passed, failed, blocked.");
    const testCase = await repository.findTestCase(testCaseId);
    if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canWriteProject(req.user, testCase.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot execute a test case in an archived or inaccessible project.");
    if (!(await canAccessProject(req.user, testCase.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权执行该测试用例。");
    const testRun = await transaction(async () => {
      const id = await nextId("TR", "test_runs");
      const record = {
        id,
        test_case_id: testCaseId,
        result,
        notes: notes || "",
        executed_by: req.user.name || "Unknown",
        created_at: now(),
      };
      await repository.createTestRun(record);
      await repository.applyTestRunResult({ id: testCaseId, result });
      const after = await repository.findTestCase(testCaseId);
      await syncTestCaseTask(after);
      await audit(req.user, "test_run.create", "test_run", id, null, record, req.ip);
      return record;
    });
    res.status(201).json(ok(mapTestRun(testRun)));
  });

  router.get("/test-cases/:id/runs", async (req, res) => {
    const testCase = await repository.findTestCase(req.params.id);
    if (!testCase) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
    if (!(await canAccessProject(req.user, testCase.project_id))) return fail(res, 403, "PERMISSION_DENIED", "无权访问该测试执行记录。");
    const runs = await repository.listTestRuns(req.params.id);
    res.json(ok(runs.map(mapTestRun)));
  });

  return router;
}

module.exports = {
  createTestingRouter,
};
