const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { WebSocket } = require("ws");

const apiRoot = path.resolve(__dirname, "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, output) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become healthy. Output:\n${output()}`);
}

async function startApi(databaseFile) {
  const port = await getFreePort();
  let stdout = "";
  let stderr = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_FILE: databaseFile,
      JWT_SECRET: "phase1-test-secret-at-least-16-characters",
      SEED_DEMO_DATA: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForHealth(port, () => `${stdout}\n${stderr}`);
  return {
    port,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    },
  };
}

async function request(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const body = await response.json();
  return { response, body };
}

async function login(port, email, password) {
  const { response, body } = await request(port, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { response, body, headers: body.data?.token ? { Authorization: `Bearer ${body.data.token}` } : {} };
}

async function waitForAiJobStatus(port, id, headers, status) {
  const deadline = Date.now() + 5_000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await request(port, `/api/ai/jobs/${id}`, { headers });
    if (latest.response.ok && latest.body.data?.status === status) return latest;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`AI job ${id} did not reach ${status}; last response: ${JSON.stringify(latest?.body)}`);
}

function connectCollaborationSocket(port, documentId, token, { useQueryToken = false } = {}) {
  return new Promise((resolve, reject) => {
    const base = `ws://127.0.0.1:${port}/ws/collab?documentId=${encodeURIComponent(documentId)}`;
    const socket = useQueryToken
      ? new WebSocket(`${base}&token=${encodeURIComponent(token)}`)
      : new WebSocket(base, ["pm.jwt", token]);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextSocketMessage(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message.")), 2_000);
    socket.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

test("seed accounts remain disabled after restart, work logs keep authenticated ownership, and capabilities match project mutation authorization", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-phase1-"));
  const databaseFile = path.join(directory, "app.db");
  let api = await startApi(databaseFile);
  const migrationDb = new DatabaseSync(databaseFile);
  const calendarMigration = migrationDb.prepare("SELECT id, checksum FROM schema_migrations WHERE id = '20260713_01_work_calendar'").get();
  const versionMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_02_project_version'").get();
  const idempotencyMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_03_idempotency_keys'").get();
  const requirementVersionMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_04_requirement_version'").get();
  const taskVersionMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_05_task_version'").get();
  const allocationOverrideMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_06_allocation_override_approval'").get();
  const timeEntryWorkNatureMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_07_time_entry_work_nature'").get();
  const softDeleteMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_08_project_requirement_soft_delete'").get();
  const projectObjectiveMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_09_project_objective'").get();
  const documentCollabRevisionMigration = migrationDb.prepare("SELECT id FROM schema_migrations WHERE id = '20260713_10_document_collab_revision'").get();
  migrationDb.close();
  assert.equal(calendarMigration.id, "20260713_01_work_calendar");
  assert.equal(typeof calendarMigration.checksum, "string");
  assert.equal(versionMigration.id, "20260713_02_project_version");
  assert.equal(idempotencyMigration.id, "20260713_03_idempotency_keys");
  assert.equal(requirementVersionMigration.id, "20260713_04_requirement_version");
  assert.equal(taskVersionMigration.id, "20260713_05_task_version");
  assert.equal(allocationOverrideMigration.id, "20260713_06_allocation_override_approval");
  assert.equal(timeEntryWorkNatureMigration.id, "20260713_07_time_entry_work_nature");
  assert.equal(softDeleteMigration.id, "20260713_08_project_requirement_soft_delete");
  assert.equal(projectObjectiveMigration.id, "20260713_09_project_objective");
  assert.equal(documentCollabRevisionMigration.id, "20260713_10_document_collab_revision");
  t.after(async () => {
    await api.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const developer = await login(api.port, "dev@example.com", "Dev@12345");
  assert.equal(developer.response.status, 200);

  const capabilities = await request(api.port, "/api/auth/capabilities", { headers: developer.headers });
  assert.equal(capabilities.response.status, 200);
  assert.equal(capabilities.body.data.operations.includes("projects:update"), false);

  const metaEnums = await request(api.port, "/api/meta/enums", { headers: developer.headers });
  assert.equal(metaEnums.response.status, 200);
  assert.equal(metaEnums.body.data.source, "api/src/domain/enums.js");
  assert.deepEqual(metaEnums.body.data.enums.taskTypes, ["epic", "story", "task", "bug", "milestone", "work_package"]);
  assert.deepEqual(metaEnums.body.data.enums.userRoles, ["admin", "pm", "pdm", "dev", "qa"]);
  assert.deepEqual(metaEnums.body.data.enums.aiJobStatuses, ["queued", "running", "awaiting_review", "confirmed", "rejected", "failed", "retried"]);

  const workflowTemplates = await request(api.port, "/api/flow/templates", { headers: developer.headers });
  assert.equal(workflowTemplates.response.status, 200);
  assert.equal(workflowTemplates.body.data.source, "api/src/workflow/templates.js");
  assert.equal(workflowTemplates.body.data.templates[0].id, "fixed-project-delivery-v1");
  assert.deepEqual(workflowTemplates.body.data.templates[0].stages.map((stage) => stage.id), ["initiation", "requirement", "design", "development", "testing", "acceptance", "release"]);
  assert.equal(workflowTemplates.body.data.templates[0].guardrails.some((item) => item.includes("不包含请假")), true);

  const profilePrivilegeAttempt = await request(api.port, "/api/auth/me", {
    method: "PATCH",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", permissions: ["*"], status: "active" }),
  });
  assert.equal(profilePrivilegeAttempt.response.status, 200);
  assert.equal(profilePrivilegeAttempt.body.data.role, "dev");
  assert.equal(profilePrivilegeAttempt.body.data.permissions.includes("*"), false);

  const projectUpdate = await request(api.port, "/api/projects/PRJ-NOT-FOUND", {
    method: "PATCH",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "should not update" }),
  });
  assert.equal(projectUpdate.response.status, 403);
  assert.equal(projectUpdate.body.errorCode, "PERMISSION_DENIED");

  const workLogIdempotencyKey = "work-log-create-retry-001";
  const workLogPayload = {
    author: "系统管理员",
    content: "完成 API 回归验证",
    logDate: "2026-07-13",
  };
  const createLog = await request(api.port, "/api/work-logs", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": workLogIdempotencyKey },
    body: JSON.stringify(workLogPayload),
  });
  assert.equal(createLog.response.status, 201);
  const repeatedCreateLog = await request(api.port, "/api/work-logs", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": workLogIdempotencyKey },
    body: JSON.stringify(workLogPayload),
  });
  assert.equal(repeatedCreateLog.response.status, 201);
  assert.equal(repeatedCreateLog.body.data.id, createLog.body.data.id);

  const personalLogs = await request(api.port, "/api/work-logs", { headers: developer.headers });
  assert.equal(personalLogs.response.status, 200);
  assert.equal(personalLogs.body.data.length, 1);
  assert.equal(personalLogs.body.data[0].author, "开发工程师");
  assert.equal(personalLogs.body.data[0].authorId, "USR-DEV");

  const admin = await login(api.port, "admin@example.com", "Admin@123");
  assert.equal(admin.response.status, 200);
  const projectManager = await login(api.port, "pm@example.com", "Pm@12345");
  assert.equal(projectManager.response.status, 200);
  const qa = await login(api.port, "qa@example.com", "Qa@12345");
  assert.equal(qa.response.status, 200);

  const invalidUserStatus = await request(api.port, "/api/users", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Invalid status account", email: "invalid-status@example.com", password: "Valid@12345", role: "dev", status: "pending" }),
  });
  assert.equal(invalidUserStatus.response.status, 400);
  assert.equal(invalidUserStatus.body.errorCode, "VALIDATION_FAILED");

  const project = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "状态机验证项目",
      owner: "项目经理",
      description: "验证核心项目流程和权限边界",
      startDate: "2026-07-13",
      endDate: "2026-07-31",
    }),
  });
  assert.equal(project.response.status, 201);

  const hiddenProjectFlow = await request(api.port, `/api/projects/${project.body.data.id}/flow`, { headers: developer.headers });
  assert.equal(hiddenProjectFlow.response.status, 403);
  assert.equal(hiddenProjectFlow.body.errorCode, "PERMISSION_DENIED");
  const visibleProjectFlow = await request(api.port, `/api/projects/${project.body.data.id}/flow`, { headers: projectManager.headers });
  assert.equal(visibleProjectFlow.response.status, 200);
  const developerFlowOverview = await request(api.port, "/api/flow/overview", { headers: developer.headers });
  assert.equal(developerFlowOverview.response.status, 200);
  assert.deepEqual(developerFlowOverview.body.data, []);

  const idempotencyKey = "project-create-retry-001";
  const idempotentProjectPayload = { name: "幂等创建项目", owner: "项目经理", objective: "验证项目目标字段可幂等写入" };
  const idempotentProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(idempotentProjectPayload),
  });
  assert.equal(idempotentProject.response.status, 201);
  const repeatedIdempotentProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(idempotentProjectPayload),
  });
  assert.equal(repeatedIdempotentProject.response.status, 201);
  assert.equal(repeatedIdempotentProject.body.data.id, idempotentProject.body.data.id);
  assert.equal(repeatedIdempotentProject.body.data.objective, "验证项目目标字段可幂等写入");
  const mismatchedIdempotencyKey = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ name: "不允许复用为不同项目", owner: "项目经理" }),
  });
  assert.equal(mismatchedIdempotencyKey.response.status, 409);
  assert.equal(mismatchedIdempotencyKey.body.errorCode, "IDEMPOTENCY_KEY_REUSED");

  const invalidProjectTransition = await request(api.port, `/api/projects/${project.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done", version: project.body.data.version }),
  });
  assert.equal(invalidProjectTransition.response.status, 409);
  assert.equal(invalidProjectTransition.body.errorCode, "STATE_TRANSITION_NOT_ALLOWED");

  const activationWithoutMembers = await request(api.port, `/api/projects/${project.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", version: project.body.data.version }),
  });
  assert.equal(activationWithoutMembers.response.status, 409);
  assert.equal(activationWithoutMembers.body.errorCode, "PROJECT_ACTIVATION_GATE_BLOCKED");

  const addDeveloperToProject = await request(api.port, `/api/projects/${project.body.data.id}/members`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ userName: "开发工程师", role: "dev" }),
  });
  assert.equal(addDeveloperToProject.response.status, 201);
  const projectMembers = await request(api.port, `/api/projects/${project.body.data.id}/members`, { headers: admin.headers });
  assert.equal(projectMembers.response.status, 200);
  assert.equal(projectMembers.body.data[0].userId, "USR-DEV");
  assert.equal(addDeveloperToProject.body.data.userId, "USR-DEV");

  const projectMilestone = await request(api.port, `/api/projects/${project.body.data.id}/milestones`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "首个可验收版本", status: "planned", date: "2026-07-24" }),
  });
  assert.equal(projectMilestone.response.status, 201);
  assert.equal(projectMilestone.body.data.milestones[0].name, "首个可验收版本");

  const activationWithoutCapacity = await request(api.port, `/api/projects/${project.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", version: project.body.data.version }),
  });
  assert.equal(activationWithoutCapacity.response.status, 409);
  assert.equal(activationWithoutCapacity.body.errorCode, "PROJECT_ACTIVATION_GATE_BLOCKED");
  assert.equal(activationWithoutCapacity.body.details.missing.includes("capacityAllocations"), true);

  const projectCapacityPlan = await request(api.port, "/api/capacity/plans/USR-DEV", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ periodStart: "2026-07-13", periodEnd: "2026-07-31", useCalendar: false, workingDays: 15, dailyHours: 8 }),
  });
  assert.equal(projectCapacityPlan.response.status, 200);
  const pendingProjectAllocation = await request(api.port, "/api/capacity/allocations", {
    method: "PUT",
    headers: { ...projectManager.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      userId: "USR-DEV",
      periodStart: "2026-07-13",
      periodEnd: "2026-07-31",
      allocationPercent: 120,
      overloadReason: "Critical delivery window requires a time-boxed exception with independent approval.",
    }),
  });
  assert.equal(pendingProjectAllocation.response.status, 200);
  assert.equal(pendingProjectAllocation.body.data.approvalStatus, "pending");
  const activationWithPendingCapacity = await request(api.port, `/api/projects/${project.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", version: project.body.data.version }),
  });
  assert.equal(activationWithPendingCapacity.response.status, 409);
  assert.equal(activationWithPendingCapacity.body.details.missing.includes("capacityApprovals"), true);
  const approvedProjectAllocation = await request(api.port, `/api/capacity/allocations/${pendingProjectAllocation.body.data.id}/approval`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(approvedProjectAllocation.response.status, 200);
  assert.equal(approvedProjectAllocation.body.data.approvalStatus, "approved");

  const activateProject = await request(api.port, `/api/projects/${project.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", objective: "将交付周期缩短到可预测范围", version: project.body.data.version }),
  });
  assert.equal(activateProject.response.status, 200);
  assert.equal(activateProject.body.data.version, project.body.data.version + 1);
  assert.equal(activateProject.body.data.objective, "将交付周期缩短到可预测范围");
  const projectEdit = await request(api.port, `/api/projects/${project.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: activateProject.body.data.version, description: "项目范围已由版本化更新确认。" }),
  });
  assert.equal(projectEdit.response.status, 200);
  assert.equal(projectEdit.body.data.description, "项目范围已由版本化更新确认。");
  assert.equal(projectEdit.body.data.version, activateProject.body.data.version + 1);
  const staleProjectEdit = await request(api.port, `/api/projects/${project.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: activateProject.body.data.version, name: "不应覆盖新版本" }),
  });
  assert.equal(staleProjectEdit.response.status, 409);
  assert.equal(staleProjectEdit.body.errorCode, "VERSION_CONFLICT");
  assert.equal(staleProjectEdit.body.details.currentVersion, projectEdit.body.data.version);
  const catalogProduct = await request(api.port, "/api/products", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "项目可见产品", owner: "产品经理" }),
  });
  assert.equal(catalogProduct.response.status, 201);
  const projectProductLink = await request(api.port, `/api/projects/${project.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: projectEdit.body.data.version, productId: catalogProduct.body.data.id }),
  });
  assert.equal(projectProductLink.response.status, 200);
  const developerProducts = await request(api.port, "/api/products", { headers: developer.headers });
  assert.equal(developerProducts.response.status, 200);
  assert.deepEqual(developerProducts.body.data.map((item) => item.id), [catalogProduct.body.data.id]);
  const forbiddenQaProducts = await request(api.port, "/api/products", { headers: qa.headers });
  assert.equal(forbiddenQaProducts.response.status, 403);
  assert.equal(forbiddenQaProducts.body.errorCode, "PERMISSION_DENIED");
  const projectHistory = await request(api.port, `/api/projects/${project.body.data.id}/status-history`, { headers: admin.headers });
  assert.equal(projectHistory.response.status, 200);
  assert.equal(projectHistory.body.data[0].fromStatus, "planning");
  assert.equal(projectHistory.body.data[0].toStatus, "active");
  assert.equal(projectHistory.body.data[0].actorId, "USR-ADMIN");

  const projectRisk = await request(api.port, `/api/projects/${project.body.data.id}/risks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "关键依赖未确认", severity: "high", ownerId: "USR-DEV", ownerName: "开发工程师", mitigationPlan: "每周跟踪依赖方交付" }),
  });
  assert.equal(projectRisk.response.status, 201);
  const projectRisks = await request(api.port, `/api/projects/${project.body.data.id}/risks`, { headers: admin.headers });
  assert.equal(projectRisks.response.status, 200);
  assert.equal(projectRisks.body.data[0].severity, "high");
  const closeRisk = await request(api.port, `/api/projects/${project.body.data.id}/risks/${projectRisk.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  });
  assert.equal(closeRisk.response.status, 200);
  const projectDecision = await request(api.port, `/api/projects/${project.body.data.id}/decisions`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "采用分阶段发布", context: "降低上线风险", decision: "先灰度后全量", status: "approved" }),
  });
  assert.equal(projectDecision.response.status, 201);
  const projectDecisions = await request(api.port, `/api/projects/${project.body.data.id}/decisions`, { headers: admin.headers });
  assert.equal(projectDecisions.response.status, 200);
  assert.equal(projectDecisions.body.data[0].status, "approved");

  const highRiskGateProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "高风险责任人门禁项目",
      owner: "项目经理",
      description: "验证项目激活前高风险必须有明确责任人。",
      startDate: "2026-07-13",
      endDate: "2026-07-31",
    }),
  });
  assert.equal(highRiskGateProject.response.status, 201);
  const highRiskGateMember = await request(api.port, `/api/projects/${highRiskGateProject.body.data.id}/members`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ userName: "开发工程师", role: "dev" }),
  });
  assert.equal(highRiskGateMember.response.status, 201);
  const unownedHighRisk = await request(api.port, `/api/projects/${highRiskGateProject.body.data.id}/risks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "未指定责任人的严重风险", severity: "high" }),
  });
  assert.equal(unownedHighRisk.response.status, 201);
  const highRiskGateActivation = await request(api.port, `/api/projects/${highRiskGateProject.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", version: highRiskGateProject.body.data.version }),
  });
  assert.equal(highRiskGateActivation.response.status, 409);
  assert.equal(highRiskGateActivation.body.errorCode, "PROJECT_ACTIVATION_GATE_BLOCKED");
  assert.equal(highRiskGateActivation.body.details.missing.includes("milestoneOrSprint"), true);
  assert.equal(highRiskGateActivation.body.details.missing.includes("riskOwners"), true);

  const restrictedProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "受限项目", owner: "项目经理" }),
  });
  assert.equal(restrictedProject.response.status, 201);
  const visibleProgram = await request(api.port, "/api/programs", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Visible delivery program", owner: "PM", objective: "Trace accessible project work", projectIds: [project.body.data.id] }),
  });
  assert.equal(visibleProgram.response.status, 201);
  const restrictedProgram = await request(api.port, "/api/programs", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Restricted delivery program", owner: "PM", objective: "Trace restricted project work", projectIds: [restrictedProject.body.data.id] }),
  });
  assert.equal(restrictedProgram.response.status, 201);

  const developerProjects = await request(api.port, "/api/projects", { headers: developer.headers });
  assert.equal(developerProjects.response.status, 200);
  assert.equal(developerProjects.body.data.some((item) => item.id === project.body.data.id), true);
  assert.equal(developerProjects.body.data.some((item) => item.id === restrictedProject.body.data.id), false);
  const developerPrograms = await request(api.port, "/api/programs", { headers: developer.headers });
  assert.equal(developerPrograms.response.status, 200);
  assert.equal(developerPrograms.body.data.every((program) => !program.projectIds.includes(restrictedProject.body.data.id)), true);
  const developerVisibleProgram = await request(api.port, `/api/programs/${visibleProgram.body.data.id}`, { headers: developer.headers });
  assert.equal(developerVisibleProgram.response.status, 200);
  assert.deepEqual(developerVisibleProgram.body.data.projectIds, [project.body.data.id]);
  const developerVisibleProgramProjects = await request(api.port, `/api/programs/${visibleProgram.body.data.id}/projects`, { headers: developer.headers });
  assert.equal(developerVisibleProgramProjects.response.status, 200);
  assert.deepEqual(developerVisibleProgramProjects.body.data.map((item) => item.id), [project.body.data.id]);
  const developerHiddenProgram = await request(api.port, `/api/programs/${restrictedProgram.body.data.id}`, { headers: developer.headers });
  assert.equal(developerHiddenProgram.response.status, 403);
  const developerHiddenProgramProjects = await request(api.port, `/api/programs/${restrictedProgram.body.data.id}/projects`, { headers: developer.headers });
  assert.equal(developerHiddenProgramProjects.response.status, 403);

  const visibleProject = await request(api.port, `/api/projects/${project.body.data.id}`, { headers: developer.headers });
  assert.equal(visibleProject.response.status, 200);
  const hiddenProject = await request(api.port, `/api/projects/${restrictedProject.body.data.id}`, { headers: developer.headers });
  assert.equal(hiddenProject.response.status, 403);
  const hiddenProjectHistory = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/status-history`, { headers: developer.headers });
  assert.equal(hiddenProjectHistory.response.status, 403);
  const hiddenProjectRisks = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/risks`, { headers: developer.headers });
  assert.equal(hiddenProjectRisks.response.status, 403);
  const hiddenProjectDecisions = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/decisions`, { headers: developer.headers });
  assert.equal(hiddenProjectDecisions.response.status, 403);

  const requirementPayload = { title: "状态机验证需求", projectId: project.body.data.id, owner: "产品经理", productId: catalogProduct.body.data.id };
  const requirementIdempotencyKey = "requirement-create-retry-001";
  const requirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": requirementIdempotencyKey },
    body: JSON.stringify(requirementPayload),
  });
  assert.equal(requirement.response.status, 201);
  assert.equal(requirement.body.data.version, 1);
  const repeatedRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": requirementIdempotencyKey },
    body: JSON.stringify(requirementPayload),
  });
  assert.equal(repeatedRequirement.response.status, 201);
  assert.equal(repeatedRequirement.body.data.id, requirement.body.data.id);
  const productRequirements = await request(api.port, `/api/products/${catalogProduct.body.data.id}/requirements`, { headers: developer.headers });
  assert.equal(productRequirements.response.status, 200);
  assert.deepEqual(productRequirements.body.data.map((item) => item.id), [requirement.body.data.id]);
  assert.equal(productRequirements.body.data[0].productId, catalogProduct.body.data.id);
  const forbiddenProductRequirements = await request(api.port, `/api/products/${catalogProduct.body.data.id}/requirements`, { headers: qa.headers });
  assert.equal(forbiddenProductRequirements.response.status, 403);
  assert.equal(forbiddenProductRequirements.body.errorCode, "PERMISSION_DENIED");
  const requirementHistory = await request(api.port, `/api/requirements/${requirement.body.data.id}/status-history`, { headers: developer.headers });
  assert.equal(requirementHistory.response.status, 200);
  assert.equal(requirementHistory.body.data[0].fromStatus, null);
  assert.equal(requirementHistory.body.data[0].toStatus, "draft");

  const restrictedRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "受限需求", projectId: restrictedProject.body.data.id, owner: "产品经理" }),
  });
  assert.equal(restrictedRequirement.response.status, 201);

  const developerRequirements = await request(api.port, "/api/requirements", { headers: developer.headers });
  assert.equal(developerRequirements.response.status, 200);
  assert.deepEqual(developerRequirements.body.data.map((item) => item.id), [requirement.body.data.id]);
  const hiddenRequirement = await request(api.port, `/api/requirements/${restrictedRequirement.body.data.id}`, { headers: developer.headers });
  assert.equal(hiddenRequirement.response.status, 403);

  const protectedRequirementDelete = await request(api.port, `/api/requirements/${requirement.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(protectedRequirementDelete.response.status, 409);
  assert.equal(protectedRequirementDelete.body.errorCode, "REQUIREMENT_HAS_DEPENDENCIES");

  const invalidRequirementTransition = await request(api.port, `/api/requirements/${requirement.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "accepted", version: requirement.body.data.version }),
  });
  assert.equal(invalidRequirementTransition.response.status, 409);
  const updatedRequirement = await request(api.port, `/api/requirements/${requirement.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: requirement.body.data.version, title: "版本化需求更新" }),
  });
  assert.equal(updatedRequirement.response.status, 200);
  assert.equal(updatedRequirement.body.data.version, 2);
  const requirementStatusUpdate = await request(api.port, `/api/requirements/${requirement.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: updatedRequirement.body.data.version, status: "reviewing" }),
  });
  assert.equal(requirementStatusUpdate.response.status, 200);
  assert.equal(requirementStatusUpdate.body.data.version, 3);
  const requirementFollowupUpdate = await request(api.port, `/api/requirements/${requirement.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: requirementStatusUpdate.body.data.version, description: "状态变更后继续保存其他字段。" }),
  });
  assert.equal(requirementFollowupUpdate.response.status, 200);
  assert.equal(requirementFollowupUpdate.body.data.version, 4);
  const staleRequirementUpdate = await request(api.port, `/api/requirements/${requirement.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: requirement.body.data.version, title: "过期版本不得覆盖" }),
  });
  assert.equal(staleRequirementUpdate.response.status, 409);
  assert.equal(staleRequirementUpdate.body.errorCode, "VERSION_CONFLICT");
  assert.equal(invalidRequirementTransition.body.errorCode, "STATE_TRANSITION_NOT_ALLOWED");
  const crossProjectParentRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "不得跨项目关联父需求", projectId: restrictedProject.body.data.id, parentId: requirement.body.data.id }),
  });
  assert.equal(crossProjectParentRequirement.response.status, 400);
  assert.equal(crossProjectParentRequirement.body.errorCode, "VALIDATION_FAILED");
  const nestedRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "需求树子节点", projectId: project.body.data.id, parentId: requirement.body.data.id }),
  });
  assert.equal(nestedRequirement.response.status, 201);
  const crossProjectParentUpdate = await request(api.port, `/api/requirements/${requirement.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: requirementFollowupUpdate.body.data.version, parentId: restrictedRequirement.body.data.id }),
  });
  assert.equal(crossProjectParentUpdate.response.status, 400);
  assert.equal(crossProjectParentUpdate.body.errorCode, "VALIDATION_FAILED");
  const cyclicRequirementParent = await request(api.port, `/api/requirements/${requirement.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: requirementFollowupUpdate.body.data.version, parentId: nestedRequirement.body.data.id }),
  });
  assert.equal(cyclicRequirementParent.response.status, 400);
  assert.equal(cyclicRequirementParent.body.errorCode, "VALIDATION_FAILED");

  const taskPayload = { title: "状态机验证任务" };
  const taskIdempotencyKey = "task-create-retry-001";
  const invalidTaskTypeCreate = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "拒绝未知任务类型", type: "random_type" }),
  });
  assert.equal(invalidTaskTypeCreate.response.status, 400);
  assert.equal(invalidTaskTypeCreate.body.errorCode, "VALIDATION_FAILED");
  const task = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": taskIdempotencyKey },
    body: JSON.stringify(taskPayload),
  });
  assert.equal(task.response.status, 201);
  assert.equal(task.body.data.version, 1);
  const repeatedTask = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": taskIdempotencyKey },
    body: JSON.stringify(taskPayload),
  });
  assert.equal(repeatedTask.response.status, 201);
  assert.equal(repeatedTask.body.data.id, task.body.data.id);

  const unrelatedTaskLog = await request(api.port, "/api/work-logs", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": "task-evidence-unrelated-log-001" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      content: "完成项目例会纪要整理，未提及具体任务证据。",
      logDate: "2026-07-14",
    }),
  });
  assert.equal(unrelatedTaskLog.response.status, 201);
  const taskEvidenceLog = await request(api.port, "/api/work-logs", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": "task-evidence-log-001" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      content: `完成 ${task.body.data.id} ${task.body.data.title} 的接口联调证据整理，等待验收。`,
      logDate: "2026-07-14",
    }),
  });
  assert.equal(taskEvidenceLog.response.status, 201);
  const taskWorkLogs = await request(api.port, `/api/tasks/${task.body.data.id}/work-logs`, { headers: developer.headers });
  assert.equal(taskWorkLogs.response.status, 200);
  assert.equal(taskWorkLogs.body.data.length, 1);
  assert.equal(taskWorkLogs.body.data[0].id, taskEvidenceLog.body.data.id);
  assert.deepEqual(taskWorkLogs.body.data[0].match.matchedBy, ["taskId", "taskTitle"]);
  assert.equal(Object.prototype.hasOwnProperty.call(taskWorkLogs.body.data[0], "performanceScore"), false);

  const invalidTaskTransition = await request(api.port, `/api/tasks/${task.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done", version: task.body.data.version }),
  });
  assert.equal(invalidTaskTransition.response.status, 409);
  assert.equal(invalidTaskTransition.body.errorCode, "STATE_TRANSITION_NOT_ALLOWED");

  const startTask = await request(api.port, `/api/tasks/${task.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_progress", version: task.body.data.version }),
  });
  assert.equal(startTask.response.status, 200);
  assert.equal(startTask.body.data.version, 2);
  const taskDetailUpdate = await request(api.port, `/api/tasks/${task.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: startTask.body.data.version, title: "版本化任务更新" }),
  });
  assert.equal(taskDetailUpdate.response.status, 200);
  assert.equal(taskDetailUpdate.body.data.version, 3);
  const invalidTaskTypeUpdate = await request(api.port, `/api/tasks/${task.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: taskDetailUpdate.body.data.version, type: "random_type" }),
  });
  assert.equal(invalidTaskTypeUpdate.response.status, 400);
  assert.equal(invalidTaskTypeUpdate.body.errorCode, "VALIDATION_FAILED");
  const staleTaskUpdate = await request(api.port, `/api/tasks/${task.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: startTask.body.data.version, title: "过期版本不得覆盖" }),
  });
  assert.equal(staleTaskUpdate.response.status, 409);
  assert.equal(staleTaskUpdate.body.errorCode, "VERSION_CONFLICT");
  const kanbanTaskMove = await request(api.port, `/api/tasks/${task.body.data.id}/kanban-position`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: taskDetailUpdate.body.data.version, kanbanColumn: "code_review" }),
  });
  assert.equal(kanbanTaskMove.response.status, 200);
  assert.equal(kanbanTaskMove.body.data.version, 4);
  const taskHistory = await request(api.port, `/api/tasks/${task.body.data.id}/status-history`, { headers: developer.headers });
  assert.equal(taskHistory.response.status, 200);
  const taskStartHistory = taskHistory.body.data.find((item) => item.fromStatus === "todo" && item.toStatus === "in_progress");
  assert.ok(taskStartHistory);

  const restrictedTask = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "受限任务" }),
  });
  assert.equal(restrictedTask.response.status, 201);
  const crossProjectRequirementTask = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "不得跨项目关联需求", requirementId: requirement.body.data.id }),
  });
  assert.equal(crossProjectRequirementTask.response.status, 400);
  assert.equal(crossProjectRequirementTask.body.errorCode, "VALIDATION_FAILED");
  const crossProjectParentTask = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "不得跨项目关联父任务", parentId: restrictedTask.body.data.id }),
  });
  assert.equal(crossProjectParentTask.response.status, 400);
  assert.equal(crossProjectParentTask.body.errorCode, "VALIDATION_FAILED");

  const developerTasks = await request(api.port, "/api/tasks", { headers: developer.headers });
  assert.equal(developerTasks.response.status, 200);
  assert.equal(developerTasks.body.data.every((item) => item.projectId === project.body.data.id), true);
  const developerProjectTasks = await request(api.port, `/api/projects/${project.body.data.id}/tasks`, { headers: developer.headers });
  assert.equal(developerProjectTasks.response.status, 200);
  const developerProjectTaskIds = developerProjectTasks.body.data.map((item) => item.id);
  assert.equal(developerProjectTaskIds.includes(task.body.data.id), true);
  assert.equal(developerProjectTaskIds.includes(restrictedTask.body.data.id), false);
  const hiddenProjectTasks = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/tasks`, { headers: developer.headers });
  assert.equal(hiddenProjectTasks.response.status, 403);
  assert.equal(hiddenProjectTasks.body.errorCode, "PERMISSION_DENIED");
  const hiddenTask = await request(api.port, `/api/tasks/${restrictedTask.body.data.id}`, { headers: developer.headers });
  assert.equal(hiddenTask.response.status, 403);

  const testCase = await request(api.port, "/api/test-cases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "可见测试用例", projectId: project.body.data.id, requirementId: requirement.body.data.id }),
  });
  assert.equal(testCase.response.status, 201);
  const restrictedTestCase = await request(api.port, "/api/test-cases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "受限测试用例", projectId: restrictedProject.body.data.id }),
  });
  assert.equal(restrictedTestCase.response.status, 201);
  const developerTestCases = await request(api.port, "/api/test-cases", { headers: developer.headers });
  assert.equal(developerTestCases.response.status, 200);
  assert.equal(developerTestCases.body.data.every((item) => item.projectId === project.body.data.id), true);
  const hiddenTestRuns = await request(api.port, `/api/test-cases/${restrictedTestCase.body.data.id}/runs`, { headers: developer.headers });
  assert.equal(hiddenTestRuns.response.status, 403);
  const developerTestPlans = await request(api.port, "/api/test-plans", { headers: developer.headers });
  assert.equal(developerTestPlans.response.status, 200);
  const developerTestPlanProjectIds = developerTestPlans.body.data.map((item) => item.projectId);
  assert.equal(developerTestPlanProjectIds.includes(project.body.data.id), true);
  assert.equal(developerTestPlanProjectIds.includes(restrictedProject.body.data.id), false);
  const currentProjectTestPlan = developerTestPlans.body.data.find((item) => item.projectId === project.body.data.id);
  assert.equal(currentProjectTestPlan.testCaseCount, 1);
  assert.equal(currentProjectTestPlan.coveredRequirementCount, 1);
  const hiddenTestPlan = await request(api.port, `/api/test-plans?projectId=${restrictedProject.body.data.id}`, { headers: developer.headers });
  assert.equal(hiddenTestPlan.response.status, 403);
  assert.equal(hiddenTestPlan.body.errorCode, "PERMISSION_DENIED");

  const defect = await request(api.port, "/api/defects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "可见缺陷", projectId: project.body.data.id, reporter: "伪造报告人" }),
  });
  assert.equal(defect.response.status, 201);
  assert.equal(defect.body.data.reporter, "系统管理员");
  const crossProjectDefect = await request(api.port, "/api/defects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "不得跨项目关联需求", projectId: restrictedProject.body.data.id, requirementId: requirement.body.data.id }),
  });
  assert.equal(crossProjectDefect.response.status, 400);
  assert.equal(crossProjectDefect.body.errorCode, "VALIDATION_FAILED");
  const crossProjectDefectUpdate = await request(api.port, `/api/defects/${defect.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ requirementId: restrictedRequirement.body.data.id }),
  });
  assert.equal(crossProjectDefectUpdate.response.status, 400);
  assert.equal(crossProjectDefectUpdate.body.errorCode, "VALIDATION_FAILED");
  const restrictedDefect = await request(api.port, "/api/defects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "受限缺陷", projectId: restrictedProject.body.data.id }),
  });
  assert.equal(restrictedDefect.response.status, 201);
  const developerDefects = await request(api.port, "/api/defects", { headers: developer.headers });
  assert.equal(developerDefects.response.status, 200);
  assert.deepEqual(developerDefects.body.data.map((item) => item.id), [defect.body.data.id]);
  const hiddenDefectUpdate = await request(api.port, `/api/defects/${restrictedDefect.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert.equal(hiddenDefectUpdate.response.status, 403);

  const document = await request(api.port, "/api/documents", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "可见项目文档",
      type: "design",
      owner: "开发工程师",
      ownerRole: "dev",
      projectId: project.body.data.id,
      fileName: "visible.md",
    }),
  });
  assert.equal(document.response.status, 201);
  const restrictedDocument = await request(api.port, "/api/documents", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "受限项目文档",
      type: "design",
      owner: "开发工程师",
      ownerRole: "dev",
      projectId: restrictedProject.body.data.id,
      fileName: "restricted.md",
    }),
  });
  assert.equal(restrictedDocument.response.status, 201);
  const aiScopeDb = new DatabaseSync(databaseFile);
  aiScopeDb.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(JSON.stringify(["project:read", "build:*", "document:*", "audit:read", "ai:*"]), "USR-DEV");
  aiScopeDb.close();
  const hiddenAiBusinessAdvice = await request(api.port, "/api/ai/business-advice", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ targetType: "requirement", targetId: restrictedRequirement.body.data.id }),
  });
  assert.equal(hiddenAiBusinessAdvice.response.status, 403);
  assert.equal(hiddenAiBusinessAdvice.body.errorCode, "PERMISSION_DENIED");
  const hiddenAiDocumentAnalysis = await request(api.port, "/api/ai/documents/analyze", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: restrictedDocument.body.data.id, analysisGoals: [] }),
  });
  assert.equal(hiddenAiDocumentAnalysis.response.status, 403);
  assert.equal(hiddenAiDocumentAnalysis.body.errorCode, "PERMISSION_DENIED");
  const developerDocuments = await request(api.port, "/api/documents", { headers: developer.headers });
  assert.equal(developerDocuments.response.status, 200);
  assert.deepEqual(developerDocuments.body.data.map((item) => item.id), [document.body.data.id]);
  const hiddenDocument = await request(api.port, `/api/documents/${restrictedDocument.body.data.id}`, { headers: developer.headers });
  assert.equal(hiddenDocument.response.status, 403);

  const collaboration = await connectCollaborationSocket(api.port, document.body.data.id, developer.body.data.token);
  t.after(() => collaboration.close());
  const snapshot = await nextSocketMessage(collaboration);
  assert.equal(snapshot.type, "snapshot");
  assert.equal(snapshot.revision, 0);
  collaboration.send(JSON.stringify({ type: "update", content: "协作更新内容", baseRevision: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const updatedDocument = await request(api.port, `/api/documents/${document.body.data.id}`, { headers: developer.headers });
  assert.equal(updatedDocument.response.status, 200);
  assert.equal(updatedDocument.body.data.content, "协作更新内容");
  assert.equal(updatedDocument.body.data.collabRevision, 1);
  const ragSearch = await request(api.port, "/api/ai/rag/search", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: updatedDocument.body.data.content, projectId: project.body.data.id }),
  });
  assert.equal(ragSearch.response.status, 200);
  assert.ok(["keyword", "hybrid"].includes(ragSearch.body.data.mode));
  assert.deepEqual(ragSearch.body.data.results.map((item) => item.documentId), [document.body.data.id]);
  assert.ok(["keyword", "hybrid"].includes(ragSearch.body.data.results[0].source));
  assert.match(ragSearch.body.data.results[0].chunkId, /^DCH-/);
  assert.match(ragSearch.body.data.results[0].citationId, /^RAGC-/);
  const ragDb = new DatabaseSync(databaseFile);
  const indexedChunk = ragDb.prepare("SELECT * FROM document_chunk WHERE id = ?").get(ragSearch.body.data.results[0].chunkId);
  assert.equal(indexedChunk.document_id, document.body.data.id);
  assert.equal(indexedChunk.project_id, project.body.data.id);
  assert.ok(indexedChunk.embedding_vector);
  const citation = ragDb.prepare("SELECT * FROM rag_citation WHERE id = ?").get(ragSearch.body.data.results[0].citationId);
  assert.equal(citation.document_id, document.body.data.id);
  assert.equal(citation.chunk_id, indexedChunk.id);
  ragDb.close();
  const ragSearchAudit = await request(api.port, "/api/audit-logs?action=ai.rag_search&resourceType=ai", { headers: admin.headers });
  assert.equal(ragSearchAudit.response.status, 200);
  assert.equal(ragSearchAudit.body.data.some((entry) => entry.action === "ai.rag_search"), true);
  const hiddenRagProjectSearch = await request(api.port, "/api/ai/rag/search", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "restricted", projectId: restrictedProject.body.data.id }),
  });
  assert.equal(hiddenRagProjectSearch.response.status, 403);
  assert.equal(hiddenRagProjectSearch.body.errorCode, "PERMISSION_DENIED");
  const hiddenRagDocumentSearch = await request(api.port, "/api/ai/rag/search", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "restricted", documentIds: [restrictedDocument.body.data.id] }),
  });
  assert.equal(hiddenRagDocumentSearch.response.status, 403);
  assert.equal(hiddenRagDocumentSearch.body.errorCode, "PERMISSION_DENIED");
  collaboration.send(JSON.stringify({ type: "update", content: "过期写入", baseRevision: 0 }));
  const conflict = await nextSocketMessage(collaboration);
  assert.equal(conflict.type, "conflict");
  assert.equal(conflict.revision, 1);

  const analysisJob = await request(api.port, "/api/ai/documents/analyze", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: document.body.data.id, analysisGoals: ["requirements"] }),
  });
  assert.equal(analysisJob.response.status, 202);
  assert.equal(analysisJob.body.data.status, "queued");
  await waitForAiJobStatus(api.port, analysisJob.body.data.jobId, admin.headers, "awaiting_review");
  const rejectedAnalysis = await request(api.port, `/api/ai/jobs/${analysisJob.body.data.jobId}/reject`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "需要重新抽取" }),
  });
  assert.equal(rejectedAnalysis.response.status, 200);
  assert.equal(rejectedAnalysis.body.data.status, "rejected");
  const retriedAnalysis = await request(api.port, `/api/ai/jobs/${analysisJob.body.data.jobId}/retry`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(retriedAnalysis.response.status, 200);
  assert.equal(retriedAnalysis.body.data.status, "queued");
  assert.equal(retriedAnalysis.body.data.retryCount, 1);
  const retryAudit = await request(api.port, `/api/audit-logs?action=ai.job_retry&resourceType=ai_job&keyword=${encodeURIComponent(analysisJob.body.data.jobId)}`, {
    headers: admin.headers,
  });
  assert.equal(retryAudit.response.status, 200);
  assert.equal(retryAudit.body.data.length, 1);
  assert.equal(retryAudit.body.data[0].action, "ai.job_retry");
  assert.equal(retryAudit.body.data[0].resourceId, analysisJob.body.data.jobId);
  assert.equal(retryAudit.body.data[0].after.retryCount, 1);
  await waitForAiJobStatus(api.port, analysisJob.body.data.jobId, admin.headers, "awaiting_review");
  const confirmedAnalysis = await request(api.port, `/api/ai/jobs/${analysisJob.body.data.jobId}/confirm`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.body.data.id }),
  });
  assert.equal(confirmedAnalysis.response.status, 200);
  assert.equal(confirmedAnalysis.body.data.status, "confirmed");
  const invalidAnalysisRetry = await request(api.port, `/api/ai/jobs/${analysisJob.body.data.jobId}/retry`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(invalidAnalysisRetry.response.status, 400);
  assert.equal(invalidAnalysisRetry.body.errorCode, "STATE_NOT_ALLOWED");

  const capacityPlan = await request(api.port, "/api/capacity/plans/USR-DEV", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
      workingDays: 5,
      dailyHours: 8,
      meetingHours: 4,
      notes: "包含例会",
    }),
  });
  assert.equal(capacityPlan.response.status, 200);
  assert.equal(capacityPlan.body.data.effectiveHours, 36);
  const capacityPlanAuditDb = new DatabaseSync(databaseFile);
  const capacityPlanAudit = capacityPlanAuditDb.prepare("SELECT action, actor_id FROM audit_logs WHERE resource_type = 'capacity_plan' AND resource_id = ? ORDER BY created_at DESC LIMIT 1").get(capacityPlan.body.data.id);
  capacityPlanAuditDb.close();
  assert.equal(capacityPlanAudit.action, "capacity.plan_upsert");
  assert.equal(capacityPlanAudit.actor_id, "USR-ADMIN");

  const allocation = await request(api.port, "/api/capacity/allocations", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      userId: "USR-DEV",
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
      allocationPercent: 75,
    }),
  });
  assert.equal(allocation.response.status, 200);
  assert.equal(allocation.body.data.plannedHours, 27);

  const nonMemberAllocation = await request(api.port, "/api/capacity/allocations", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      userId: "USR-QA",
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
      allocationPercent: 20,
    }),
  });
  assert.equal(nonMemberAllocation.response.status, 400);
  assert.equal(nonMemberAllocation.body.errorCode, "USER_NOT_PROJECT_MEMBER");

  const timeEntryPayload = {
    projectId: project.body.data.id,
    workDate: "2026-07-14",
    hours: 4.5,
    category: "delivery",
    workNature: "unplanned",
    note: "验证实际工时记录",
  };
  const timeEntryIdempotencyKey = "time-entry-create-retry-001";
  const timeEntry = await request(api.port, "/api/time-entries", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": timeEntryIdempotencyKey },
    body: JSON.stringify(timeEntryPayload),
  });
  assert.equal(timeEntry.response.status, 201);
  assert.equal(timeEntry.body.data.userId, "USR-DEV");
  assert.equal(timeEntry.body.data.workNature, "unplanned");
  const repeatedTimeEntry = await request(api.port, "/api/time-entries", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": timeEntryIdempotencyKey },
    body: JSON.stringify(timeEntryPayload),
  });
  assert.equal(repeatedTimeEntry.response.status, 201);
  assert.equal(repeatedTimeEntry.body.data.id, timeEntry.body.data.id);
  const personalTimeEntries = await request(api.port, "/api/time-entries?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: developer.headers });
  assert.equal(personalTimeEntries.response.status, 200);
  assert.equal(personalTimeEntries.body.data.length, 1);
  const updatedTimeEntry = await request(api.port, `/api/time-entries/${timeEntry.body.data.id}`, {
    method: "PATCH",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ note: "updated actual time entry" }),
  });
  assert.equal(updatedTimeEntry.response.status, 200);
  assert.equal(updatedTimeEntry.body.data.note, "updated actual time entry");
  const foreignTimeEntryUpdate = await request(api.port, `/api/time-entries/${timeEntry.body.data.id}`, {
    method: "PATCH",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ note: "不能修改他人工时" }),
  });
  assert.equal(foreignTimeEntryUpdate.response.status, 404);
  const disposableTimeEntry = await request(api.port, "/api/time-entries", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json", "Idempotency-Key": "time-entry-delete-001" },
    body: JSON.stringify({ ...timeEntryPayload, hours: 0.5, note: "disposable actual time entry" }),
  });
  assert.equal(disposableTimeEntry.response.status, 201);
  const deletedTimeEntry = await request(api.port, `/api/time-entries/${disposableTimeEntry.body.data.id}`, {
    method: "DELETE",
    headers: developer.headers,
  });
  assert.equal(deletedTimeEntry.response.status, 200);
  const timeEntryAuditDb = new DatabaseSync(databaseFile);
  const primaryTimeEntryAudits = timeEntryAuditDb.prepare("SELECT action FROM audit_logs WHERE resource_type = 'time_entry' AND resource_id = ? ORDER BY created_at").all(timeEntry.body.data.id);
  assert.deepEqual(primaryTimeEntryAudits.map((item) => item.action).sort(), ["time_entry.create", "time_entry.update"]);
  const deletedTimeEntryAudits = timeEntryAuditDb.prepare("SELECT action FROM audit_logs WHERE resource_type = 'time_entry' AND resource_id = ?").all(disposableTimeEntry.body.data.id);
  assert.deepEqual(deletedTimeEntryAudits.map((item) => item.action).sort(), ["time_entry.create", "time_entry.delete"]);
  timeEntryAuditDb.close();
  const inaccessibleTimeEntry = await request(api.port, "/api/time-entries", {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: restrictedProject.body.data.id, workDate: "2026-07-14", hours: 1, category: "delivery" }),
  });
  assert.equal(inaccessibleTimeEntry.response.status, 403);

  const capacityOverview = await request(api.port, "/api/capacity/overview?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: admin.headers });
  assert.equal(capacityOverview.response.status, 200);
  const forbiddenCapacityOverview = await request(api.port, "/api/capacity/overview?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: developer.headers });
  assert.equal(forbiddenCapacityOverview.response.status, 403);
  const personalCapacity = await request(api.port, "/api/capacity/me?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: developer.headers });
  assert.equal(personalCapacity.response.status, 200);
  assert.equal(personalCapacity.body.data.userId, "USR-DEV");
  const developerCapacity = capacityOverview.body.data.members.find((item) => item.userId === "USR-DEV");
  assert.equal(developerCapacity.effectiveHours, 36);
  assert.equal(developerCapacity.plannedHours, 27);
  assert.equal(developerCapacity.actualHours, 4.5);
  assert.equal(developerCapacity.unplannedActualHours, 4.5);
  assert.equal(developerCapacity.classifiedActualHours, 4.5);
  assert.equal(developerCapacity.unplannedRatio, 1);
  assert.equal(developerCapacity.risk.code, "balanced");
  const ownCapacity = await request(api.port, "/api/capacity/me?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: developer.headers });
  assert.equal(ownCapacity.response.status, 200);
  assert.equal(ownCapacity.body.data.userId, "USR-DEV");

  const inaccessibleCalendar = await request(api.port, "/api/capacity/calendar?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: developer.headers });
  assert.equal(inaccessibleCalendar.response.status, 403);
  const workCalendar = await request(api.port, "/api/capacity/calendar?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: admin.headers });
  assert.equal(workCalendar.response.status, 200);
  assert.equal(workCalendar.body.data.workingDays, 5);
  const calendarHoliday = await request(api.port, "/api/capacity/calendar/exceptions", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-07-16", isWorkingDay: false, name: "容量日历假期" }),
  });
  assert.equal(calendarHoliday.response.status, 201);
  const calendarAdjustedOverview = await request(api.port, "/api/capacity/overview?periodStart=2026-07-13&periodEnd=2026-07-19", { headers: admin.headers });
  const calendarAdjustedDeveloper = calendarAdjustedOverview.body.data.members.find((item) => item.userId === "USR-DEV");
  assert.equal(calendarAdjustedOverview.body.data.calendar.workingDays, 4);
  assert.equal(calendarAdjustedDeveloper.plan.useCalendar, true);
  assert.equal(calendarAdjustedDeveloper.effectiveHours, 28);
  assert.equal(calendarAdjustedDeveloper.plannedHours, 21);
  const manualCapacityPlan = await request(api.port, "/api/capacity/plans/USR-DEV", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ periodStart: "2026-07-13", periodEnd: "2026-07-19", useCalendar: false, workingDays: 5 }),
  });
  assert.equal(manualCapacityPlan.response.status, 200);
  assert.equal(manualCapacityPlan.body.data.workingDays, 5);
  assert.equal(manualCapacityPlan.body.data.useCalendar, false);
  const removeCalendarHoliday = await request(api.port, `/api/capacity/calendar/exceptions/${calendarHoliday.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(removeCalendarHoliday.response.status, 200);
  const defaultWorkloadThresholds = await request(api.port, "/api/capacity/settings/workload-thresholds", { headers: projectManager.headers });
  assert.equal(defaultWorkloadThresholds.response.status, 200);
  assert.deepEqual(defaultWorkloadThresholds.body.data, { balancedMin: 0.7, attentionMin: 0.9, overloadedAbove: 1.1 });
  const invalidWorkloadThresholds = await request(api.port, "/api/capacity/settings/workload-thresholds", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ balancedMin: 0.9, attentionMin: 0.7, overloadedAbove: 1.1 }),
  });
  assert.equal(invalidWorkloadThresholds.response.status, 400);
  const updatedWorkloadThresholds = await request(api.port, "/api/capacity/settings/workload-thresholds", {
    method: "PUT",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ balancedMin: 0.6, attentionMin: 0.8, overloadedAbove: 1 }),
  });
  assert.equal(updatedWorkloadThresholds.response.status, 200);
  assert.deepEqual(updatedWorkloadThresholds.body.data, { balancedMin: 0.6, attentionMin: 0.8, overloadedAbove: 1 });

  const unreasonedOverallocation = await request(api.port, "/api/capacity/allocations", {
    method: "PUT",
    headers: { ...projectManager.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      userId: "USR-DEV",
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
      allocationPercent: 120,
    }),
  });
  assert.equal(unreasonedOverallocation.response.status, 400);
  assert.equal(unreasonedOverallocation.body.errorCode, "ALLOCATION_OVERRIDE_REASON_REQUIRED");
  const pendingOverallocation = await request(api.port, "/api/capacity/allocations", {
    method: "PUT",
    headers: { ...projectManager.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      userId: "USR-DEV",
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
      allocationPercent: 120,
      overloadReason: "发布窗口收窄，需要短期集中投入并在下周回调。",
    }),
  });
  assert.equal(pendingOverallocation.response.status, 200);
  assert.equal(pendingOverallocation.body.data.approvalStatus, "pending");
  const approvedOverallocation = await request(api.port, `/api/capacity/allocations/${pendingOverallocation.body.data.id}/approval`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(approvedOverallocation.response.status, 200);
  assert.equal(approvedOverallocation.body.data.approvalStatus, "approved");
  assert.equal(approvedOverallocation.body.data.approvedBy, "USR-ADMIN");

  const visibleBuild = await request(api.port, "/api/builds", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.body.data.id, name: "可见构建", version: "1.0.0" }),
  });
  assert.equal(visibleBuild.response.status, 201);
  const crossProjectRequirementBuild = await request(api.port, "/api/builds", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      name: "不得跨项目关联需求的构建",
      linkedStories: [restrictedRequirement.body.data.id],
    }),
  });
  assert.equal(crossProjectRequirementBuild.response.status, 400);
  assert.equal(crossProjectRequirementBuild.body.errorCode, "VALIDATION_FAILED");
  const crossProjectDefectBuild = await request(api.port, "/api/builds", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.body.data.id,
      name: "不得跨项目关联缺陷的构建",
      linkedBugs: [restrictedDefect.body.data.id],
    }),
  });
  assert.equal(crossProjectDefectBuild.response.status, 400);
  assert.equal(crossProjectDefectBuild.body.errorCode, "VALIDATION_FAILED");
  const crossProjectBuildUpdate = await request(api.port, `/api/builds/${visibleBuild.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ linkedStories: [restrictedRequirement.body.data.id] }),
  });
  assert.equal(crossProjectBuildUpdate.response.status, 400);
  assert.equal(crossProjectBuildUpdate.body.errorCode, "VALIDATION_FAILED");
  const crossProjectReleaseLinks = await request(api.port, "/api/releases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "不得跨项目关联需求的发布",
      buildId: visibleBuild.body.data.id,
      linkedStories: [restrictedRequirement.body.data.id],
    }),
  });
  assert.equal(crossProjectReleaseLinks.response.status, 400);
  assert.equal(crossProjectReleaseLinks.body.errorCode, "VALIDATION_FAILED");
  const restrictedBuild = await request(api.port, "/api/builds", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: restrictedProject.body.data.id, name: "受限构建", version: "1.0.0" }),
  });
  assert.equal(restrictedBuild.response.status, 201);
  const developerBuilds = await request(api.port, "/api/builds", { headers: developer.headers });
  assert.equal(developerBuilds.response.status, 200);
  assert.deepEqual(developerBuilds.body.data.map((item) => item.id), [visibleBuild.body.data.id]);
  const hiddenBuildUpdate = await request(api.port, `/api/builds/${restrictedBuild.body.data.id}`, {
    method: "PATCH",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "不能编辑不属于项目的构建" }),
  });
  assert.equal(hiddenBuildUpdate.response.status, 403);

  const restrictedRelease = await request(api.port, "/api/releases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "受限发布", version: "1.0.0", buildId: restrictedBuild.body.data.id }),
  });
  assert.equal(restrictedRelease.response.status, 201);
  const invalidReleaseTypeUpdate = await request(api.port, `/api/releases/${restrictedRelease.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ releaseType: "unsupported" }),
  });
  assert.equal(invalidReleaseTypeUpdate.response.status, 400);
  assert.equal(invalidReleaseTypeUpdate.body.errorCode, "VALIDATION_FAILED");
  const developerReleases = await request(api.port, "/api/releases", { headers: developer.headers });
  assert.equal(developerReleases.response.status, 200);
  assert.equal(developerReleases.body.data.some((item) => item.id === restrictedRelease.body.data.id), false);
  const hiddenReleaseApprovals = await request(api.port, `/api/releases/${restrictedRelease.body.data.id}/approvals`, { headers: developer.headers });
  assert.equal(hiddenReleaseApprovals.response.status, 403);
  const personalDashboard = await request(api.port, "/api/dashboard/personal", { headers: developer.headers });
  assert.equal(personalDashboard.response.status, 200);
  assert.equal(personalDashboard.body.data.focusTasks.every((item) => item.projectId === project.body.data.id), true);
  assert.equal(personalDashboard.body.data.requirementProgress.every((item) => item.projectId === project.body.data.id), true);
  assert.equal(personalDashboard.body.data.myBuilds.every((item) => item.projectId === project.body.data.id), true);

  const archiveRestrictedProject = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "archived", statusReason: "项目已完成归档", version: restrictedProject.body.data.version }),
  });
  assert.equal(archiveRestrictedProject.response.status, 200);
  const archivedProjectRead = await request(api.port, `/api/projects/${restrictedProject.body.data.id}`, { headers: admin.headers });
  assert.equal(archivedProjectRead.response.status, 200);
  const archivedTaskCreate = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "归档后不能创建任务" }),
  });
  assert.equal(archivedTaskCreate.response.status, 403);
  assert.equal(archivedTaskCreate.body.errorCode, "PERMISSION_DENIED");
  const archivedTestCaseCreate = await request(api.port, "/api/test-cases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "归档后不能创建测试", projectId: restrictedProject.body.data.id }),
  });
  assert.equal(archivedTestCaseCreate.response.status, 403);
  assert.equal(archivedTestCaseCreate.body.errorCode, "PROJECT_ARCHIVED_OR_ACCESS_DENIED");
  const archivedBuildUpdate = await request(api.port, `/api/builds/${restrictedBuild.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "归档后不能编辑构建" }),
  });
  assert.equal(archivedBuildUpdate.response.status, 403);
  assert.equal(archivedBuildUpdate.body.errorCode, "PROJECT_ARCHIVED_OR_ACCESS_DENIED");
  const archivedRiskCreate = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/risks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "归档后不能新增风险", severity: "medium" }),
  });
  assert.equal(archivedRiskCreate.response.status, 403);
  assert.equal(archivedRiskCreate.body.errorCode, "PROJECT_ARCHIVED_OR_ACCESS_DENIED");
  const archivedDecisionCreate = await request(api.port, `/api/projects/${restrictedProject.body.data.id}/decisions`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "归档后不能新增决策", status: "proposed" }),
  });
  assert.equal(archivedDecisionCreate.response.status, 403);
  assert.equal(archivedDecisionCreate.body.errorCode, "PROJECT_ARCHIVED_OR_ACCESS_DENIED");

  const sprintPayload = { name: "受保护迭代" };
  const sprintIdempotencyKey = "sprint-create-retry-001";
  const sprint = await request(api.port, `/api/projects/${project.body.data.id}/sprints`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": sprintIdempotencyKey },
    body: JSON.stringify(sprintPayload),
  });
  assert.equal(sprint.response.status, 201);
  const repeatedSprint = await request(api.port, `/api/projects/${project.body.data.id}/sprints`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": sprintIdempotencyKey },
    body: JSON.stringify(sprintPayload),
  });
  assert.equal(repeatedSprint.response.status, 201);
  assert.equal(repeatedSprint.body.data.id, sprint.body.data.id);
  const sprintHistory = await request(api.port, `/api/sprints/${sprint.body.data.id}/status-history`, { headers: developer.headers });
  assert.equal(sprintHistory.response.status, 200);
  assert.equal(sprintHistory.body.data[0].toStatus, "planned");
  const addTaskToSprint = await request(api.port, `/api/sprints/${sprint.body.data.id}/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: task.body.data.id }),
  });
  assert.equal(addTaskToSprint.response.status, 200);
  const protectedSprintDelete = await request(api.port, `/api/sprints/${sprint.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(protectedSprintDelete.response.status, 409);
  assert.equal(protectedSprintDelete.body.errorCode, "SPRINT_HAS_TASKS");

  const startSprintWithoutDates = await request(api.port, `/api/sprints/${sprint.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });
  assert.equal(startSprintWithoutDates.response.status, 409);
  assert.equal(startSprintWithoutDates.body.errorCode, "SPRINT_ACTIVATION_GATE_BLOCKED");

  const startSprint = await request(api.port, `/api/sprints/${sprint.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", startDate: "2026-07-13", endDate: "2026-07-19" }),
  });
  assert.equal(startSprint.response.status, 200);
  const sprintCommitment = await request(api.port, `/api/sprints/${sprint.body.data.id}/commitment`, { headers: developer.headers });
  assert.equal(sprintCommitment.response.status, 200);
  assert.equal(sprintCommitment.body.data.taskCount, 1);
  assert.deepEqual(sprintCommitment.body.data.taskIds, [task.body.data.id]);

  const scopeTask = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "迭代启动后新增的范围任务", estimatedHours: 5 }),
  });
  assert.equal(scopeTask.response.status, 201);
  const scopeChangeWithoutReason = await request(api.port, `/api/sprints/${sprint.body.data.id}/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: scopeTask.body.data.id }),
  });
  assert.equal(scopeChangeWithoutReason.response.status, 400);
  assert.equal(scopeChangeWithoutReason.body.errorCode, "SCOPE_CHANGE_REASON_REQUIRED");
  const scopeChangeWithReason = await request(api.port, `/api/sprints/${sprint.body.data.id}/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: scopeTask.body.data.id, scopeChangeReason: "处理发布前新增的兼容性风险" }),
  });
  assert.equal(scopeChangeWithReason.response.status, 200);
  const scopeChanges = await request(api.port, `/api/sprints/${sprint.body.data.id}/scope-changes`, { headers: developer.headers });
  assert.equal(scopeChanges.response.status, 200);
  assert.equal(scopeChanges.body.data[0].changeType, "add");
  assert.equal(scopeChanges.body.data[0].taskId, scopeTask.body.data.id);
  assert.equal(scopeChanges.body.data[0].reason, "处理发布前新增的兼容性风险");

  const predecessor = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Dependency predecessor" }),
  });
  assert.equal(predecessor.response.status, 201);
  const dependent = await request(api.port, `/api/projects/${project.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Dependency dependent", dependencyIds: [predecessor.body.data.id] }),
  });
  assert.equal(dependent.response.status, 201);
  const cyclicDependency = await request(api.port, `/api/tasks/${predecessor.body.data.id}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: predecessor.body.data.version, dependencyIds: [dependent.body.data.id] }),
  });
  assert.equal(cyclicDependency.response.status, 400);
  assert.equal(cyclicDependency.body.errorCode, "TASK_DEPENDENCY_INVALID");
  let dependentVersion = dependent.body.data.version;
  for (const status of ["in_progress", "code_review", "testing", "acceptance"]) {
    const advance = await request(api.port, `/api/tasks/${dependent.body.data.id}/status`, {
      method: "PATCH",
      headers: { ...admin.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status, version: dependentVersion }),
    });
    assert.equal(advance.response.status, 200);
    dependentVersion = advance.body.data.version;
  }
  const blockedDependentCompletion = await request(api.port, `/api/tasks/${dependent.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done", version: dependentVersion }),
  });
  assert.equal(blockedDependentCompletion.response.status, 409);
  assert.equal(blockedDependentCompletion.body.errorCode, "TASK_DEPENDENCIES_UNRESOLVED");
  const blockedPredecessorDelete = await request(api.port, `/api/tasks/${predecessor.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(blockedPredecessorDelete.response.status, 409);
  assert.equal(blockedPredecessorDelete.body.errorCode, "TASK_HAS_DEPENDENTS");
  let predecessorVersion = predecessor.body.data.version;
  for (const status of ["in_progress", "code_review", "testing", "acceptance", "done"]) {
    const advance = await request(api.port, `/api/tasks/${predecessor.body.data.id}/status`, {
      method: "PATCH",
      headers: { ...admin.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status, version: predecessorVersion }),
    });
    assert.equal(advance.response.status, 200);
    predecessorVersion = advance.body.data.version;
  }
  const completedDependent = await request(api.port, `/api/tasks/${dependent.body.data.id}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done", version: dependentVersion }),
  });
  assert.equal(completedDependent.response.status, 200);

  const protectedProjectDelete = await request(api.port, `/api/projects/${project.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(protectedProjectDelete.response.status, 409);
  assert.equal(protectedProjectDelete.body.errorCode, "PROJECT_HAS_DEPENDENCIES");
  assert.equal(protectedProjectDelete.body.details.dependencies.members, 1);
  assert.equal(protectedProjectDelete.body.details.dependencies.allocations, 2);

  const softDeletedProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "软删除验证项目", owner: "项目经理" }),
  });
  assert.equal(softDeletedProject.response.status, 201);
  const softDeleteProjectResponse = await request(api.port, `/api/projects/${softDeletedProject.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(softDeleteProjectResponse.response.status, 200);
  const hiddenSoftDeletedProject = await request(api.port, `/api/projects/${softDeletedProject.body.data.id}`, { headers: admin.headers });
  assert.equal(hiddenSoftDeletedProject.response.status, 404);
  const hiddenSoftDeletedProjectFlow = await request(api.port, `/api/projects/${softDeletedProject.body.data.id}/flow`, { headers: admin.headers });
  assert.equal(hiddenSoftDeletedProjectFlow.response.status, 404);
  const softDeleteDb = new DatabaseSync(databaseFile);
  const softDeletedProjectRow = softDeleteDb.prepare("SELECT deleted_at FROM projects WHERE id = ?").get(softDeletedProject.body.data.id);
  softDeleteDb.close();
  assert.equal(typeof softDeletedProjectRow.deleted_at, "string");

  const softDeleteRequirementProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "需求软删除验证项目", owner: "项目经理" }),
  });
  assert.equal(softDeleteRequirementProject.response.status, 201);
  const softDeletedRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "需求软删除验证", projectId: softDeleteRequirementProject.body.data.id, owner: "项目经理" }),
  });
  assert.equal(softDeletedRequirement.response.status, 201);
  const generatedTaskId = softDeletedRequirement.body.data.linkedTasks[0];
  const deleteGeneratedTask = await request(api.port, `/api/tasks/${generatedTaskId}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(deleteGeneratedTask.response.status, 200);
  const softDeleteRequirementResponse = await request(api.port, `/api/requirements/${softDeletedRequirement.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(softDeleteRequirementResponse.response.status, 200);
  const hiddenSoftDeletedRequirement = await request(api.port, `/api/requirements/${softDeletedRequirement.body.data.id}`, { headers: admin.headers });
  assert.equal(hiddenSoftDeletedRequirement.response.status, 404);
  const taskForSoftDeletedRequirement = await request(api.port, `/api/projects/${softDeleteRequirementProject.body.data.id}/wbs/tasks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "不得关联已删除需求", requirementId: softDeletedRequirement.body.data.id }),
  });
  assert.equal(taskForSoftDeletedRequirement.response.status, 404);
  const testCaseForSoftDeletedRequirement = await request(api.port, "/api/test-cases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Cannot reference a deleted requirement",
      requirementId: softDeletedRequirement.body.data.id,
    }),
  });
  assert.equal(testCaseForSoftDeletedRequirement.response.status, 404);
  assert.equal(testCaseForSoftDeletedRequirement.body.errorCode, "RESOURCE_NOT_FOUND");
  const softDeleteRequirementDb = new DatabaseSync(databaseFile);
  const softDeletedRequirementRow = softDeleteRequirementDb.prepare("SELECT deleted_at FROM requirements WHERE id = ?").get(softDeletedRequirement.body.data.id);
  softDeleteRequirementDb.close();
  assert.equal(typeof softDeletedRequirementRow.deleted_at, "string");
  const deleteSoftDeleteRequirementProject = await request(api.port, `/api/projects/${softDeleteRequirementProject.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(deleteSoftDeleteRequirementProject.response.status, 200);

  const deletedAllocation = await request(api.port, `/api/capacity/allocations/${allocation.body.data.id}`, {
    method: "DELETE",
    headers: admin.headers,
  });
  assert.equal(deletedAllocation.response.status, 200);
  assert.deepEqual(deletedAllocation.body.data, { deleted: true, id: allocation.body.data.id });
  const allocationAuditDb = new DatabaseSync(databaseFile);
  const allocationDeleteAudit = allocationAuditDb.prepare("SELECT action FROM audit_logs WHERE resource_type = 'project_allocation' AND resource_id = ? ORDER BY created_at DESC LIMIT 1").get(allocation.body.data.id);
  allocationAuditDb.close();
  assert.equal(allocationDeleteAudit.action, "capacity.allocation_delete");

  const release = await request(api.port, "/api/releases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": "release-create-retry-001" },
    body: JSON.stringify({ name: "职责分离验证发布", version: "1.0.0" }),
  });
  assert.equal(release.response.status, 201);
  assert.equal(release.body.data.creatorId, "USR-ADMIN");
  const repeatedRelease = await request(api.port, "/api/releases", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json", "Idempotency-Key": "release-create-retry-001" },
    body: JSON.stringify({ name: release.body.data.name, version: release.body.data.version }),
  });
  assert.equal(repeatedRelease.response.status, 201);
  assert.equal(repeatedRelease.body.data.id, release.body.data.id);
  const firstExternalDecision = await request(api.port, `/api/releases/${release.body.data.id}/approvals`, {
    method: "POST",
    headers: { ...projectManager.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "reject", comment: "需要补充上线验证证据" }),
  });
  assert.equal(firstExternalDecision.response.status, 201);
  const duplicateExternalDecision = await request(api.port, `/api/releases/${release.body.data.id}/approvals`, {
    method: "POST",
    headers: { ...projectManager.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "reject", comment: "重复提交应被拒绝" }),
  });
  assert.equal(duplicateExternalDecision.response.status, 409);
  assert.equal(duplicateExternalDecision.body.errorCode, "RELEASE_APPROVAL_ALREADY_RECORDED");
  const approverContentChange = await request(api.port, `/api/releases/${release.body.data.id}`, {
    method: "PATCH",
    headers: { ...projectManager.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ releaseNotes: "An approver cannot change the content after deciding." }),
  });
  assert.equal(approverContentChange.response.status, 403);
  assert.equal(approverContentChange.body.errorCode, "RELEASE_APPROVER_CONTENT_CHANGE_FORBIDDEN");
  const selfApproval = await request(api.port, `/api/releases/${release.body.data.id}/approvals`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(selfApproval.response.status, 403);
  assert.equal(selfApproval.body.errorCode, "SELF_APPROVAL_FORBIDDEN");
  const draftRollback = await request(api.port, `/api/releases/${release.body.data.id}/rollbacks`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "草稿不能办理回滚" }),
  });
  assert.equal(draftRollback.response.status, 409);
  assert.equal(draftRollback.body.errorCode, "STATE_TRANSITION_NOT_ALLOWED");

  const aiProviderUpdate = await request(api.port, "/api/admin/ai-provider", {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Encrypted integration provider",
      provider: "openai-compatible",
      baseUrl: "https://api.example.test/v1",
      model: "test-model",
      apiKey: "sk-integration-secret-key",
    }),
  });
  assert.equal(aiProviderUpdate.response.status, 200);
  assert.equal(aiProviderUpdate.body.data.apiKeySource, "database");
  assert.notEqual(aiProviderUpdate.body.data.apiKeyMasked, "sk-integration-secret-key");
  const verifySecretsDb = new DatabaseSync(databaseFile);
  const storedProviders = verifySecretsDb.prepare("SELECT value FROM app_settings WHERE key = 'ai_providers'").get();
  const storedLegacyProvider = verifySecretsDb.prepare("SELECT value FROM app_settings WHERE key = 'ai_provider'").get();
  verifySecretsDb.close();
  assert.equal(storedProviders.value.includes("sk-integration-secret-key"), false);
  assert.equal(storedLegacyProvider.value.includes("sk-integration-secret-key"), false);
  assert.equal(storedProviders.value.includes("apiKeyEncrypted"), true);

  const disableDeveloper = await request(api.port, "/api/users/USR-DEV", {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "disabled" }),
  });
  assert.equal(disableDeveloper.response.status, 200);

  await api.stop();
  api = await startApi(databaseFile);
  const disabledDeveloper = await login(api.port, "dev@example.com", "Dev@12345");
  assert.equal(disabledDeveloper.response.status, 403);
  assert.equal(disabledDeveloper.body.errorCode, "ACCOUNT_DISABLED");
});
