const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const SwaggerParser = require("@apidevtools/swagger-parser");

test("OpenAPI core contract validates and describes versioned project writes", async () => {
  const document = await SwaggerParser.validate(path.resolve(__dirname, "..", "openapi.json"));
  assert.equal(document.openapi, "3.0.3");
  assert.ok(document.paths["/api/auth/login"]?.post);
  assert.ok(document.paths["/api/auth/me"]?.patch);
  assert.ok(document.paths["/api/auth/capabilities"]?.get);
  assert.ok(document.paths["/api/meta/enums"]?.get);
  assert.ok(document.paths["/api/health"]?.get);
  assert.ok(document.paths["/api/dashboard"]?.get);
  assert.ok(document.paths["/api/dashboard/personal"]?.get);
  assert.ok(document.paths["/api/reports/summary"]?.get);
  assert.ok(document.paths["/api/reports/personal"]?.get);
  assert.ok(document.paths["/api/audit-logs"]?.get);
  assert.ok(document.paths["/api/activity/page-view"]?.post);
  assert.ok(document.paths["/api/documents"]?.get);
  assert.ok(document.paths["/api/documents"]?.post);
  assert.ok(document.paths["/api/documents/{id}"]?.get);
  assert.ok(document.paths["/api/documents/{id}"]?.patch);
  assert.ok(document.paths["/api/documents/{id}"]?.delete);
  assert.ok(document.paths["/api/documents/{id}/object"]?.post);
  assert.ok(document.paths["/api/documents/{id}/upload-url"]?.post);
  assert.ok(document.paths["/api/objects/{key}"]?.get);
  assert.ok(document.paths["/api/org"]?.get);
  assert.ok(document.paths["/api/org/departments"]?.post);
  assert.ok(document.paths["/api/org/departments/{id}"]?.patch);
  assert.ok(document.paths["/api/org/departments/{id}"]?.delete);
  assert.ok(document.paths["/api/team/members"]?.get);
  assert.ok(document.paths["/api/users"]?.post);
  assert.ok(document.paths["/api/users/{id}"]?.patch);
  assert.ok(document.paths["/api/projects"]?.post);
  assert.ok(document.paths["/api/requirements"]?.post);
  assert.ok(document.paths["/api/requirements/{id}"]?.patch);
  assert.ok(document.paths["/api/requirements/{id}"]?.delete);
  assert.ok(document.paths["/api/projects/{id}"]?.delete);
  assert.ok(document.paths["/api/tasks/{id}"]?.patch);
  assert.ok(document.paths["/api/tasks/{id}"]?.delete);
  assert.ok(document.paths["/api/tasks/{id}/status-history"]?.get);
  assert.ok(document.paths["/api/projects/{id}/wbs/tasks"]?.post);
  assert.ok(document.paths["/api/projects/{id}/wbs"]?.get);
  assert.ok(document.paths["/api/projects/{id}/tasks"]?.get);
  assert.ok(document.paths["/api/projects/{id}/kanban"]?.get);
  assert.ok(document.paths["/api/projects/{id}/sprints"]?.get);
  assert.ok(document.paths["/api/projects/{id}/sprints"]?.post);
  assert.ok(document.paths["/api/sprints/{id}"]?.patch);
  assert.ok(document.paths["/api/sprints/{id}"]?.delete);
  assert.ok(document.paths["/api/sprints/{id}/status-history"]?.get);
  assert.ok(document.paths["/api/sprints/{id}/commitment"]?.get);
  assert.ok(document.paths["/api/sprints/{id}/scope-changes"]?.get);
  assert.ok(document.paths["/api/sprints/{id}/tasks"]?.post);
  assert.ok(document.paths["/api/sprints/{id}/burndown"]?.get);
  assert.ok(document.paths["/api/test-plans"]?.get);
  assert.ok(document.paths["/api/test-cases"]?.get);
  assert.ok(document.paths["/api/test-cases"]?.post);
  assert.ok(document.paths["/api/test-cases/{id}"]?.patch);
  assert.ok(document.paths["/api/test-cases/{id}"]?.delete);
  assert.ok(document.paths["/api/test-cases/{id}/status"]?.patch);
  assert.ok(document.paths["/api/test-cases/{id}/runs"]?.get);
  assert.ok(document.paths["/api/test-runs"]?.post);
  assert.ok(document.paths["/api/projects/{id}/members"]?.post);
  assert.ok(document.paths["/api/projects/{id}/milestones"]?.post);
  assert.ok(document.paths["/api/projects/{id}/sources"]?.get);
  assert.ok(document.paths["/api/projects/{id}/flow"]?.get);
  assert.ok(document.paths["/api/flow/overview"]?.get);
  assert.ok(document.paths["/api/flow/templates"]?.get);
  assert.ok(document.paths["/api/capacity/overview"]?.get);
  assert.ok(document.paths["/api/capacity/allocations"]?.put);
  assert.ok(document.paths["/api/capacity/allocations/{id}"]?.delete);
  assert.ok(document.paths["/api/capacity/allocations/{id}/approval"]?.patch);
  assert.ok(document.paths["/api/capacity/settings/workload-thresholds"]?.put);
  assert.ok(document.paths["/api/time-entries"]?.post);
  assert.ok(document.paths["/api/time-entries/{id}"]?.patch);
  assert.ok(document.paths["/api/time-entries/{id}"]?.delete);
  assert.ok(document.paths["/api/work-logs"]?.post);
  assert.ok(document.paths["/api/work-logs/team"]?.get);
  assert.ok(document.paths["/api/work-logs/team-weekly-summary"]?.get);
  assert.ok(document.paths["/api/ai/logs/analyze"]?.post);
  assert.ok(document.paths["/api/work-logs/weekly-summary"]?.get);
  assert.ok(document.paths["/api/defects"]?.post);
  assert.ok(document.paths["/api/defects/{id}"]?.patch);
  assert.ok(document.paths["/api/defects/{id}/status"]?.patch);
  assert.ok(document.paths["/api/products"]?.get);
  assert.ok(document.paths["/api/strategic-goals"]?.post);
  assert.ok(document.paths["/api/strategic-goals/{id}"]?.patch);
  assert.ok(document.paths["/api/programs"]?.get);
  assert.ok(document.paths["/api/programs/{id}"]?.get);
  assert.ok(document.paths["/api/programs/{id}/projects"]?.get);
  assert.ok(document.paths["/api/portfolios"]?.get);
  assert.ok(document.paths["/api/products/{id}/requirements"]?.get);
  assert.ok(document.paths["/api/builds"]?.post);
  assert.ok(document.paths["/api/builds/{id}/status"]?.patch);
  assert.ok(document.paths["/api/delivery/gates"]?.get);
  assert.ok(document.paths["/api/releases"]?.post);
  assert.ok(document.paths["/api/releases/{id}/status"]?.patch);
  assert.ok(document.paths["/api/releases/{id}/approvals"]?.get);
  assert.ok(document.paths["/api/releases/{id}/approvals"]?.post);
  assert.ok(document.paths["/api/releases/{id}/rollbacks"]?.post);
  assert.ok(document.paths["/api/releases/{id}/report"]?.get);
  assert.ok(document.paths["/api/ai/business-advice"]?.post);
  assert.ok(document.paths["/api/ai/requirements/{id}/score"]?.post);
  assert.ok(document.paths["/api/ai/documents/analyze"]?.post);
  assert.ok(document.paths["/api/ai/rag/search"]?.post);
  assert.ok(document.paths["/api/ai/jobs/{id}"]?.get);
  assert.ok(document.paths["/api/ai/jobs/{id}/confirm"]?.post);
  assert.ok(document.paths["/api/ai/jobs/{id}/reject"]?.post);
  assert.ok(document.paths["/api/ai/jobs/{id}/retry"]?.post);
  assert.ok(document.paths["/api/tasks/{id}/work-logs"]?.get);
  assert.equal(document.components.schemas.AiSummary.properties.modelRoutes.type, "array");
  assert.deepEqual(document.components.schemas.AiSummaryModelRoute.properties.status.enum, ["active", "degraded", "unavailable", "disabled", "unconfigured"]);
  assert.deepEqual(document.components.schemas.MetaEnums.properties.enums.required, [
    "projectStatuses",
    "requirementStatuses",
    "requirementPriorities",
    "taskStatuses",
    "taskTypes",
    "sprintStatuses",
    "testCaseStatuses",
    "testRunResults",
    "defectStatuses",
    "defectSeverities",
    "buildStatuses",
    "releaseStatuses",
    "releaseTypes",
    "releaseApprovalDecisions",
    "documentCategories",
    "documentTypes",
    "userRoles",
    "userStatuses",
    "workItemRoles",
    "aiJobStatuses",
  ]);
  assert.deepEqual(document.components.schemas.MetaEnums.properties.enums.properties.taskTypes.items.enum, ["epic", "story", "task", "bug", "milestone", "work_package"]);
  assert.ok(document.components.schemas.EnvelopeMetaEnums);
  assert.ok(document.components.schemas.EnvelopeWorkflowTemplateCatalog);
  assert.deepEqual(document.components.schemas.WorkflowTemplate.properties.mode.enum, ["fixed"]);
  assert.deepEqual(document.components.schemas.WorkflowResourceFlow.properties.resource.enum, ["project", "requirement", "task", "sprint", "aiJob"]);
  assert.ok(document.paths["/api/admin/ai-provider"]?.patch);
  assert.ok(document.paths["/api/admin/ai-provider/{id}"]?.delete);
  assert.ok(document.paths["/api/admin/ai-provider/test"]?.post);
  assert.deepEqual(document.components.schemas.UpdateProjectInput.required, ["version"]);
  assert.ok(document.components.schemas.Project.properties.objective);
  assert.ok(document.components.schemas.CreateProjectInput.properties.objective);
  assert.deepEqual(document.components.schemas.UpdateRequirementInput.required, ["version"]);
  assert.deepEqual(document.components.schemas.UpdateTaskInput.required, ["version"]);
  assert.deepEqual(document.components.schemas.Task.properties.type.enum, ["epic", "story", "task", "bug", "milestone", "work_package"]);
  assert.deepEqual(document.components.schemas.CreateWbsTaskInput.properties.type.enum, ["epic", "story", "task", "bug", "milestone", "work_package"]);
  assert.deepEqual(document.components.schemas.UpdateTaskInput.properties.type.enum, ["epic", "story", "task", "bug", "milestone", "work_package"]);
  assert.equal(document.components.schemas.UpdateSprintInput.minProperties, 1);
  assert.deepEqual(document.components.schemas.SprintTaskAssignmentInput.required, ["taskId"]);
  assert.deepEqual(document.components.schemas.TestCaseCreateInput.required, ["title"]);
  assert.deepEqual(document.components.schemas.TestRunCreateInput.required, ["testCaseId", "result"]);
  assert.deepEqual(document.components.schemas.TestRun.properties.result.enum, ["passed", "failed", "blocked"]);
  assert.deepEqual(document.components.schemas.TestPlan.properties.status.enum, ["ready", "attention"]);
  assert.ok(document.components.schemas.EnvelopeTestPlanList);
  assert.deepEqual(document.components.schemas.RequirementStatusUpdate.properties.status.enum, ["draft", "reviewing", "approved", "in_dev", "testing", "accepted", "closed", "cancelled"]);
  assert.equal(document.paths["/api/projects"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/requirements"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/projects/{id}/wbs/tasks"].post.parameters[1].name, "Idempotency-Key");
  assert.equal(document.paths["/api/projects/{id}/sprints"].post.parameters[1].name, "Idempotency-Key");
  assert.equal(document.paths["/api/time-entries"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/work-logs"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/builds"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/releases"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/releases/{id}/approvals"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/releases/{id}/rollbacks"].post.parameters[0].name, "Idempotency-Key");
  assert.equal(document.paths["/api/time-entries/{id}"].parameters[0].name, "id");
  assert.equal(document.components.schemas.TimeEntryUpdate.minProperties, 1);
  assert.match(document.paths["/api/projects/{id}"].delete.summary, /Soft-delete/);
  assert.match(document.paths["/api/projects/{id}/status"].patch.summary, /approved capacity allocations/);
  assert.match(document.paths["/api/requirements/{id}"].delete.summary, /Soft-delete/);
  assert.deepEqual(document.components.schemas.WorkLogInput.required, ["content"]);
  assert.ok(document.components.schemas.TaskWorkLogEvidence.properties || document.components.schemas.TaskWorkLogEvidence.allOf);
  assert.ok(document.components.schemas.EnvelopeTaskWorkLogEvidenceList);
  assert.deepEqual(document.components.schemas.DocumentCreateInput.required, ["title", "type", "owner", "fileName"]);
  assert.deepEqual(document.components.schemas.DocumentCreateInput.properties.category.enum, ["project", "general", "announcement"]);
  assert.deepEqual(document.components.schemas.PageViewInput.required, ["page"]);
  assert.equal(document.paths["/api/work-logs/team"].get.summary, "List team work logs for project managers and administrators; collaboration visibility only");
  assert.deepEqual(document.components.schemas.DefectCreateInput.required, ["title", "projectId"]);
  assert.deepEqual(document.components.schemas.ProductInput.required, ["name", "owner"]);
  assert.deepEqual(document.components.schemas.StrategicGoalInput.required, ["name", "owner", "objective"]);
  assert.deepEqual(document.components.schemas.BuildInput.required, ["projectId", "name"]);
  assert.deepEqual(document.components.schemas.Build.properties.status.enum, ["building", "testing", "released", "failed"]);
  assert.deepEqual(document.components.schemas.BuildStatusUpdate.required, ["status"]);
  assert.deepEqual(document.components.schemas.ReleaseStatusUpdate.required, ["status"]);
  assert.deepEqual(document.components.schemas.ReleaseApprovalInput.required, ["decision"]);
  assert.deepEqual(document.components.schemas.RollbackInput.required, ["reason"]);
  assert.deepEqual(document.components.schemas.ReleaseApproval.properties.decision.enum, ["approve", "reject"]);
  assert.deepEqual(document.components.schemas.AiBusinessAdviceInput.required, ["targetType", "targetId"]);
  assert.deepEqual(document.components.schemas.AuthLoginInput.required, ["email", "password"]);
  assert.deepEqual(document.components.schemas.OrganizationUnitInput.required, ["name"]);
  assert.ok(document.components.schemas.User.properties.departmentId);
  assert.deepEqual(document.components.schemas.UserCreateInput.required, ["name", "email", "password", "role"]);
  assert.deepEqual(document.components.schemas.UserUpdateInput.properties.status.enum, ["active", "disabled"]);
  assert.deepEqual(document.components.schemas.AiDocumentAnalysisInput.required, ["documentId"]);
  assert.deepEqual(document.components.schemas.AiRagSearchInput.required, ["query"]);
  assert.deepEqual(document.components.schemas.AiRagSearch.properties.mode.enum, ["keyword", "hybrid"]);
  assert.ok(document.components.schemas.AiRagSearchResult.properties.chunkId);
  assert.ok(document.components.schemas.AiRagSearchResult.properties.citationId);
  assert.deepEqual(document.components.schemas.AiRagSearchResult.properties.source.enum, ["keyword", "hybrid"]);
  assert.ok(document.components.schemas.EnvelopeAiRagSearch);
  assert.deepEqual(document.components.schemas.AiJob.properties.status.enum, ["queued", "running", "awaiting_review", "confirmed", "rejected", "failed", "retried"]);
  assert.equal(document.components.schemas.AiProviderUpdateInput.properties.apiKey.writeOnly, true);
});
