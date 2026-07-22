const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(port, output) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // still starting
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
      JWT_SECRET: "requirement-defect-test-secret-16",
      SEED_DEMO_DATA: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
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
  return {
    response,
    body,
    headers: body.data?.token ? { Authorization: `Bearer ${body.data.token}` } : {},
  };
}

test("PDM cannot edit requirements outside project membership; archived project is blocked; defect handoff enforces target, version, and derived status", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-req-defect-"));
  const databaseFile = path.join(directory, "app.db");
  t.after(() => {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failures on Windows file locks */
    }
  });

  const api = await startApi(databaseFile);
  t.after(() => api.stop());

  const admin = await login(api.port, "admin@example.com", "Admin@123");
  assert.equal(admin.response.status, 200);
  const pdm = await login(api.port, "pdm@example.com", "Pdm@12345");
  assert.equal(pdm.response.status, 200);
  const developer = await login(api.port, "dev@example.com", "Dev@12345");
  assert.equal(developer.response.status, 200);
  const qa = await login(api.port, "qa@example.com", "Qa@12345");
  assert.equal(qa.response.status, 200);

  // --- Project A (PDM is NOT a member) with a requirement owned via admin create ---
  const foreignProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "PDM-不可见项目",
      owner: "项目经理",
      description: "PDM 无成员关系",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }),
  });
  assert.equal(foreignProject.response.status, 201);
  const foreignProjectId = foreignProject.body.data.id;

  const foreignRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "跨项目需求",
      projectId: foreignProjectId,
      owner: "产品经理",
      priority: "high",
    }),
  });
  assert.equal(foreignRequirement.response.status, 201);
  const foreignReqId = foreignRequirement.body.data.id;
  const foreignReqVersion = foreignRequirement.body.data.version;

  const pdmCrossProjectPatch = await request(api.port, `/api/requirements/${foreignReqId}`, {
    method: "PATCH",
    headers: { ...pdm.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "被绕过的编辑", version: foreignReqVersion }),
  });
  assert.equal(pdmCrossProjectPatch.response.status, 403);
  assert.equal(pdmCrossProjectPatch.body.errorCode, "PERMISSION_DENIED");

  // --- Project B: PDM is member, then archive and ensure write blocked ---
  const memberProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "PDM-可写后归档项目",
      owner: "项目经理",
      description: "先可写再归档",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }),
  });
  assert.equal(memberProject.response.status, 201);
  const memberProjectId = memberProject.body.data.id;
  const memberProjectVersion = memberProject.body.data.version;

  const addPdm = await request(api.port, `/api/projects/${memberProjectId}/members`, {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ userName: "产品经理", role: "pdm" }),
  });
  assert.equal(addPdm.response.status, 201);

  const memberRequirement = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...pdm.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "可编辑需求",
      projectId: memberProjectId,
      owner: "产品经理",
      priority: "medium",
    }),
  });
  assert.equal(memberRequirement.response.status, 201);
  const memberReqId = memberRequirement.body.data.id;
  let memberReqVersion = memberRequirement.body.data.version;

  const okPatch = await request(api.port, `/api/requirements/${memberReqId}`, {
    method: "PATCH",
    headers: { ...pdm.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "已更新标题", version: memberReqVersion }),
  });
  assert.equal(okPatch.response.status, 200);
  memberReqVersion = okPatch.body.data.version;

  const archiveProject = await request(api.port, `/api/projects/${memberProjectId}/status`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "archived", version: memberProjectVersion }),
  });
  assert.equal(archiveProject.response.status, 200, JSON.stringify(archiveProject.body));
  assert.equal(archiveProject.body.data.status, "archived");

  const archivedPatch = await request(api.port, `/api/requirements/${memberReqId}`, {
    method: "PATCH",
    headers: { ...pdm.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "归档后不应成功", version: memberReqVersion }),
  });
  assert.equal(archivedPatch.response.status, 403);
  assert.ok(
    archivedPatch.body.errorCode === "PERMISSION_DENIED" ||
      archivedPatch.body.errorCode === "PROJECT_ARCHIVED_OR_ACCESS_DENIED",
  );

  // --- Defect handoff constraints on a fresh writable project ---
  const handoffProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "缺陷交接项目",
      owner: "项目经理",
      description: "handoff gates",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }),
  });
  assert.equal(handoffProject.response.status, 201);
  const handoffProjectId = handoffProject.body.data.id;

  for (const member of [
    { userName: "开发工程师", role: "dev" },
    { userName: "测试工程师", role: "qa" },
  ]) {
    const added = await request(api.port, `/api/projects/${handoffProjectId}/members`, {
      method: "POST",
      headers: { ...admin.headers, "Content-Type": "application/json" },
      body: JSON.stringify(member),
    });
    assert.equal(added.response.status, 201);
  }

  const defect = await request(api.port, "/api/defects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "交接约束缺陷",
      projectId: handoffProjectId,
      severity: "medium",
      assignee: "测试工程师",
      assigneeRole: "qa",
    }),
  });
  assert.equal(defect.response.status, 201);
  const defectId = defect.body.data.id;
  let defectVersion = defect.body.data.version;
  assert.equal(defectVersion, 1);

  const freeStatus = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_dev",
      assignee: "开发工程师",
      version: defectVersion,
      status: "closed",
    }),
  });
  assert.equal(freeStatus.response.status, 400);
  assert.equal(freeStatus.body.errorCode, "VALIDATION_FAILED");

  const missingVersion = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "assign_to_dev", assignee: "开发工程师" }),
  });
  assert.equal(missingVersion.response.status, 400);
  assert.equal(missingVersion.body.errorCode, "VERSION_REQUIRED");

  const unknownAssignee = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_dev",
      assignee: "不存在的用户XYZ",
      version: defectVersion,
    }),
  });
  assert.equal(unknownAssignee.response.status, 400);
  assert.equal(unknownAssignee.body.errorCode, "VALIDATION_FAILED");

  // Active global user who is not a member of this project must be rejected.
  const outsiderHandoff = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_dev",
      assignee: "产品经理",
      version: defectVersion,
    }),
  });
  assert.equal(outsiderHandoff.response.status, 400);
  assert.equal(outsiderHandoff.body.errorCode, "VALIDATION_FAILED");

  // Admin/PM must not masquerade as the dev target without a project dev membership.
  const adminAsDev = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_dev",
      assignee: "系统管理员",
      version: defectVersion,
    }),
  });
  assert.equal(adminAsDev.response.status, 400);
  assert.equal(adminAsDev.body.errorCode, "VALIDATION_FAILED");

  const okHandoff = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...qa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_dev",
      assignee: "开发工程师",
      version: defectVersion,
    }),
  });
  assert.equal(okHandoff.response.status, 200);
  assert.equal(okHandoff.body.data.assignee, "开发工程师");
  assert.equal(okHandoff.body.data.assigneeRole, "dev");
  assert.equal(okHandoff.body.data.status, "in_fix");
  assert.equal(okHandoff.body.data.version, defectVersion + 1);
  defectVersion = okHandoff.body.data.version;

  const staleVersion = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_qa",
      assignee: "测试工程师",
      version: 1,
    }),
  });
  assert.equal(staleVersion.response.status, 409);
  assert.equal(staleVersion.body.errorCode, "VERSION_CONFLICT");

  const wrongDirection = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_dev",
      assignee: "开发工程师",
      version: defectVersion,
    }),
  });
  assert.equal(wrongDirection.response.status, 403);
  assert.equal(wrongDirection.body.errorCode, "PERMISSION_DENIED");

  const backToQa = await request(api.port, `/api/defects/${defectId}/handoff`, {
    method: "POST",
    headers: { ...developer.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assign_to_qa",
      assignee: "测试工程师",
      version: defectVersion,
    }),
  });
  assert.equal(backToQa.response.status, 200);
  assert.equal(backToQa.body.data.assignee, "测试工程师");
  assert.equal(backToQa.body.data.assigneeRole, "qa");
  assert.equal(backToQa.body.data.status, "resolved");

  // --- Requirement write schema HTTP regression (empty title, bad assignmentStatus, non-array AC, completion bounds) ---
  const schemaProject = await request(api.port, "/api/projects", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "需求校验项目",
      owner: "项目经理",
      description: "schema validation",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }),
  });
  assert.equal(schemaProject.response.status, 201);
  const schemaProjectId = schemaProject.body.data.id;

  const emptyTitleCreate = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "   ", projectId: schemaProjectId }),
  });
  assert.equal(emptyTitleCreate.response.status, 400);
  assert.equal(emptyTitleCreate.body.errorCode, "VALIDATION_FAILED");

  const createdReq = await request(api.port, "/api/requirements", {
    method: "POST",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "待校验需求",
      projectId: schemaProjectId,
      owner: "产品经理",
      acceptanceCriteria: ["准则1"],
    }),
  });
  assert.equal(createdReq.response.status, 201);
  const schemaReqId = createdReq.body.data.id;
  const schemaReqVersion = createdReq.body.data.version;

  const emptyTitlePatch = await request(api.port, `/api/requirements/${schemaReqId}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: schemaReqVersion, title: "  " }),
  });
  assert.equal(emptyTitlePatch.response.status, 400);
  assert.equal(emptyTitlePatch.body.errorCode, "VALIDATION_FAILED");

  const badAssignment = await request(api.port, `/api/requirements/${schemaReqId}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: schemaReqVersion, assignmentStatus: "in_progress" }),
  });
  assert.equal(badAssignment.response.status, 400);
  assert.equal(badAssignment.body.errorCode, "VALIDATION_FAILED");

  const badCriteria = await request(api.port, `/api/requirements/${schemaReqId}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: schemaReqVersion, acceptanceCriteria: "not-an-array" }),
  });
  assert.equal(badCriteria.response.status, 400);
  assert.equal(badCriteria.body.errorCode, "VALIDATION_FAILED");

  const badCompletion = await request(api.port, `/api/requirements/${schemaReqId}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ version: schemaReqVersion, completion: 150 }),
  });
  assert.equal(badCompletion.response.status, 400);
  assert.equal(badCompletion.body.errorCode, "VALIDATION_FAILED");

  const okSchemaPatch = await request(api.port, `/api/requirements/${schemaReqId}`, {
    method: "PATCH",
    headers: { ...admin.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: schemaReqVersion,
      title: "校验通过",
      assignmentStatus: "assigned",
      completion: 55,
      acceptanceCriteria: ["a", "b"],
    }),
  });
  assert.equal(okSchemaPatch.response.status, 200, JSON.stringify(okSchemaPatch.body));
  assert.equal(okSchemaPatch.body.data.title, "校验通过");
  assert.equal(okSchemaPatch.body.data.assignmentStatus, "assigned");
  assert.equal(okSchemaPatch.body.data.completion, 55);
});
