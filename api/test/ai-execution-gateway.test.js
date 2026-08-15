const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { hasPermission, publicUser } = require("../src/security/accessControl");
const { createCapabilityRegistry } = require("../src/modules/ai/capabilityRegistry");
const { createExecutionGateway } = require("../src/modules/ai/executionGateway");
const { createScopedExecutionTokenService } = require("../src/modules/ai/executionToken");
const { createAuditService } = require("../src/db/audit");
const { createSqliteAccess } = require("../src/db/access");
const { createSqliteRuntime } = require("../src/db/runtime");

function createFixture({ actorStatus = "active", allowProject = true, enabled = true, hasAiPermission = true } = {}) {
  const registry = createCapabilityRegistry();
  const tokenService = createScopedExecutionTokenService({ secret: "gateway-test-secret-at-least-16" });
  const gateway = createExecutionGateway({
    audit: async () => {},
    canAccessProject: async () => allowProject,
    controlStore: { get: async () => ({ enabled }) },
    hasPermission: () => hasAiPermission,
    insert: async () => {},
    json: (value) => JSON.stringify(value === undefined ? null : value),
    nextId: async (prefix) => `${prefix}-FIXTURE`,
    now: () => "2026-08-14T00:00:00.000Z",
    publicUser: (user) => ({ ...user, permissions: ["ai:*"] }),
    registry,
    row: async (sql, params) => {
      if (sql.includes("FROM users")) return { id: params.id, role: "pm", status: actorStatus };
      if (sql.includes("FROM projects")) {
        return params.projectId === "PRJ-1"
          ? {
            id: "PRJ-1",
            name: "Apollo",
            objective: "Deliver the scoped program.",
            status: "in_progress",
            health_score: 72,
            owner: "USR-1",
            progress: 45,
            start_date: "2026-08-01",
            end_date: "2026-09-01",
            updated_at: "2026-08-14T00:00:00.000Z",
          }
          : null;
      }
      if (sql.includes("COUNT(*)")) return { count: 2 };
      throw new Error(`Unexpected gateway query: ${sql}`);
    },
    rows: async (sql) => (sql.includes("FROM project_risks")
      ? [{ severity: "high", title: "Integration dependency", status: "open", owner_name: "USR-1" }]
      : []),
    tokenService,
  });
  const issue = (overrides = {}) => tokenService.issue({
    actorId: "USR-1",
    capabilityId: "project-snapshot",
    capabilityVersion: "1.0.0",
    invocationId: "AIC-1",
    projectId: "PRJ-1",
    ...overrides,
  });
  return { gateway, issue };
}

test("execution gateway binds the compact project snapshot to a one-use scoped token", async () => {
  const { gateway, issue } = createFixture();
  const token = issue().token;
  try {
    const captured = await gateway.execute({ input: { projectId: "PRJ-1" }, token });
    assert.equal(captured.snapshot.project.id, "PRJ-1");
    assert.equal(captured.snapshot.metrics.blockedTasks, 2);
    assert.deepEqual(captured.snapshot.risks, ["[high] Integration dependency"]);
    assert.equal(captured.claims.token, undefined);
    assert.equal(captured.claims.projectId, "PRJ-1");

    await assert.rejects(
      () => gateway.execute({ input: { projectId: "PRJ-1" }, token }),
      { code: "AI_CAPABILITY_TOKEN_REPLAYED", status: 409 },
    );
    await assert.rejects(
      () => gateway.execute({ input: { projectId: "PRJ-2" }, token: issue({ invocationId: "AIC-2" }).token }),
      { code: "AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", status: 403 },
    );
  } finally {
    await gateway.close();
  }
});

test("execution gateway rechecks kill switch, actor state, permission, and project access", async () => {
  const cases = [
    [{ enabled: false }, "AI_CAPABILITY_DISABLED", 503],
    [{ actorStatus: "disabled" }, "AI_CAPABILITY_ACTOR_UNAVAILABLE", 403],
    [{ hasAiPermission: false }, "PERMISSION_DENIED", 403],
    [{ allowProject: false }, "PERMISSION_DENIED", 403],
  ];
  for (const [options, code, status] of cases) {
    const { gateway, issue } = createFixture(options);
    try {
      await assert.rejects(
        () => gateway.execute({ input: { projectId: "PRJ-1" }, token: issue().token }),
        { code, status },
      );
    } finally {
      await gateway.close();
    }
  }
});

test("execution gateway exposes only its loopback project-snapshot HTTP endpoint", async () => {
  const { gateway, issue } = createFixture();
  const token = issue().token;
  const baseUrl = await gateway.start();
  try {
    const response = await fetch(`${baseUrl}/v1/project-snapshot`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.snapshot.project.id, "PRJ-1");
    assert.equal(payload.data.evidence.source, "runtime-tool");
    assert.equal(gateway.getCaptured("AIC-1").snapshot.project.id, "PRJ-1");
    assert.equal(gateway.getCaptured("AIC-1"), null);

    const replay = await fetch(`${baseUrl}/v1/project-snapshot`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: "PRJ-1" }),
    });
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error.code, "AI_CAPABILITY_TOKEN_REPLAYED");

    const forbidden = await fetch(`${baseUrl}/v1/anything-else`, { method: "POST" });
    assert.equal(forbidden.status, 404);
    assert.equal((await forbidden.json()).error.code, "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN");
  } finally {
    await gateway.close();
  }
});

// ---------------------------------------------------------------------------
// Domain capability dispatch: real in-memory repositories, real audit rows.
// ---------------------------------------------------------------------------

const DOMAIN_SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT,
    status TEXT DEFAULT 'active', permissions TEXT
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT, owner TEXT,
    status TEXT DEFAULT 'in_progress', deleted_at TEXT
  );
  CREATE TABLE requirements (
    id TEXT PRIMARY KEY, title TEXT, description TEXT DEFAULT '',
    status TEXT, priority TEXT, project_id TEXT, product_id TEXT,
    portfolio_id TEXT, parent_id TEXT, owner TEXT, assignee TEXT,
    assignee_role TEXT, assignment_status TEXT DEFAULT 'unassigned',
    completion INTEGER DEFAULT 0, linked_tasks TEXT DEFAULT '[]',
    acceptance_criteria TEXT DEFAULT '[]', version INTEGER DEFAULT 1,
    deleted_at TEXT
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, status TEXT, status_text TEXT,
    project_id TEXT, owner TEXT, description TEXT DEFAULT '',
    due_date TEXT, requirement_id TEXT, progress INTEGER DEFAULT 0,
    blocker TEXT, type TEXT, parent_id TEXT, wbs_code TEXT,
    kanban_column TEXT, sort_order INTEGER DEFAULT 0,
    estimated_hours REAL DEFAULT 0, actual_hours REAL DEFAULT 0,
    remaining_hours REAL DEFAULT 0, version INTEGER DEFAULT 1,
    sprint_id TEXT, assignee_id TEXT, assignee_role TEXT,
    dependency_ids TEXT DEFAULT '[]', build_id TEXT,
    source_type TEXT, source_id TEXT
  );
  CREATE TABLE defects (
    id TEXT PRIMARY KEY, title TEXT, severity TEXT, status TEXT,
    project_id TEXT, requirement_id TEXT, assignee TEXT,
    assignee_role TEXT, reporter TEXT, description TEXT DEFAULT '',
    version INTEGER DEFAULT 1
  );
  CREATE TABLE ai_reminders (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    message TEXT NOT NULL, remind_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    invocation_id TEXT, created_at TEXT NOT NULL, sent_at TEXT
  );
  CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT,
    resource_type TEXT, resource_id TEXT, before_json TEXT,
    after_json TEXT, ip TEXT, scope_type TEXT DEFAULT 'global',
    project_id TEXT, subject_user_id TEXT, created_at TEXT
  );
`;

function createDomainFixture({ actorPermissions = ["*"], allowProject = true, allowWrite = true, useTransaction = true, failingAudit = false, uiDirectiveSink, browserControl } = {}) {
  const runtime = createSqliteRuntime({ DatabaseSync, databaseFile: ":memory:" });
  runtime.exec(DOMAIN_SCHEMA);
  const access = createSqliteAccess(runtime);
  const json = (value, fallback = null) => (value === undefined ? fallback : JSON.stringify(value));
  const now = () => "2026-08-14T00:00:00.000Z";
  const { audit: realAudit } = createAuditService({ row: access.row, insert: access.insert, json, now });
  const audit = failingAudit ? async () => { throw new Error("audit store down"); } : realAudit;
  let idCounter = 0;
  const nextId = async (prefix) => `${prefix}-DOM-${(idCounter += 1)}`;
  const tokenService = createScopedExecutionTokenService({ secret: "gateway-domain-test-secret-16" });
  const gateway = createExecutionGateway({
    audit,
    browserControl,
    canAccessProject: async (_user, projectId) => allowProject && projectId === "PRJ-1",
    canWriteProject: async (_user, projectId) => allowWrite && projectId === "PRJ-1",
    controlStore: { get: async () => ({ enabled: true }) },
    hasPermission,
    insert: access.insert,
    json,
    nextId,
    now,
    publicUser,
    registry: createCapabilityRegistry(),
    row: access.row,
    rows: access.rows,
    tokenService,
    transaction: useTransaction ? access.transaction : undefined,
    uiDirectiveSink,
  });
  const issue = (overrides = {}) => tokenService.issue({
    actorId: "USR-PM",
    capabilityId: "requirements-list",
    capabilityVersion: "1.0.0",
    invocationId: `AIC-${(idCounter += 1)}`,
    projectId: "PRJ-1",
    ...overrides,
  });
  const seed = {
    user: (permissions = actorPermissions) => access.insert("users", {
      id: "USR-PM", name: "Gateway Tester", email: "gateway@example.com",
      role: "admin", status: "active", permissions: json(permissions),
    }),
    project: (id = "PRJ-1", status = "in_progress") => access.insert("projects", {
      id, name: `Project ${id}`, owner: "USR-PM", status, deleted_at: null,
    }),
    requirement: (id, projectId = "PRJ-1", overrides = {}) => access.insert("requirements", {
      id, title: `Requirement ${id}`, description: `Description of ${id}`,
      status: "draft", priority: "medium", project_id: projectId,
      product_id: null, portfolio_id: null, parent_id: null, owner: "Product Office",
      assignee: null, assignee_role: null, assignment_status: "unassigned",
      completion: 0, linked_tasks: "[]", acceptance_criteria: "[]",
      version: 1, deleted_at: null, ...overrides,
    }),
    task: (id, projectId = "PRJ-1", overrides = {}) => access.insert("tasks", {
      id, title: `Task ${id}`, status: "todo", status_text: "To Do",
      project_id: projectId, owner: "Unassigned", description: "",
      due_date: "2026-08-20", requirement_id: null, progress: 0,
      blocker: null, type: "task", parent_id: null, wbs_code: "1",
      kanban_column: "todo", sort_order: 1, estimated_hours: 8,
      actual_hours: 0, remaining_hours: 8, version: 1, sprint_id: null,
      assignee_id: null, assignee_role: null, dependency_ids: "[]",
      build_id: null, source_type: null, source_id: null, ...overrides,
    }),
    defect: (id, projectId = "PRJ-1", overrides = {}) => access.insert("defects", {
      id, title: `Defect ${id}`, severity: "high", status: "open",
      project_id: projectId, requirement_id: null, assignee: "QA Lead",
      assignee_role: null, reporter: "Tester", description: "",
      version: 1, ...overrides,
    }),
    reminder: (id, projectId = "PRJ-1", overrides = {}) => access.insert("ai_reminders", {
      id, project_id: projectId, actor_id: "USR-PM", message: `Reminder ${id}`,
      remind_at: "2026-08-15T00:00:00.000Z", status: "pending", invocation_id: null,
      created_at: "2026-08-14T00:00:00.000Z", sent_at: null, ...overrides,
    }),
  };
  const auditRows = () => access.rows("SELECT action, resource_type, resource_id, project_id, scope_type FROM audit_logs ORDER BY rowid");
  const close = () => {
    try {
      runtime.connection?.close?.();
    } catch {
      // The in-memory database is process-local; close failures are harmless.
    }
  };
  return { access, close, gateway, issue, seed, auditRows };
}

test("execution gateway lists project requirements through the scoped token", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  await seed.project("PRJ-2");
  await seed.requirement("REQ-1");
  await seed.requirement("REQ-2", "PRJ-1", { priority: "high", assignee: "Dev One", completion: 40 });
  await seed.requirement("REQ-OTHER", "PRJ-2");
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      token: issue().token,
    });
    assert.equal(captured.result.count, 2);
    assert.deepEqual(captured.result.requirements.map((item) => item.id), ["REQ-1", "REQ-2"]);
    assert.equal(captured.result.requirements[1].priority, "high");
    assert.equal(captured.result.requirements[1].assignee, "Dev One");
    assert.equal(captured.result.requirements[0].description, undefined);
    assert.equal(captured.evidence.event, "execution-gateway.requirements-list");
    assert.equal(captured.evidence.mode, "read");
    assert.equal(captured.evidence.projectId, "PRJ-1");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway returns one sanitized requirement with truncated description", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  const longDescription = "x".repeat(5000);
  await seed.user();
  await seed.project();
  await seed.project("PRJ-2");
  await seed.requirement("REQ-1", "PRJ-1", { description: longDescription });
  await seed.requirement("REQ-OTHER", "PRJ-2");
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "requirement-get", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-1" },
      token: issue({ capabilityId: "requirement-get" }).token,
    });
    assert.equal(captured.result.requirement.id, "REQ-1");
    assert.equal(captured.result.requirement.description.length, 2048);
    assert.equal(captured.result.requirement.priority, "medium");

    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-get", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-OTHER" },
        token: issue({ capabilityId: "requirement-get" }).token,
      }),
      { code: "RESOURCE_NOT_FOUND", status: 404 },
    );
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-get", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-MISSING" },
        token: issue({ capabilityId: "requirement-get" }).token,
      }),
      { code: "RESOURCE_NOT_FOUND", status: 404 },
    );
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway lists project tasks and defects as compact summaries", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  await seed.task("TASK-1");
  await seed.task("TASK-2", "PRJ-1", { estimated_hours: 16, remaining_hours: 12, due_date: null });
  await seed.defect("BUG-1");
  await seed.defect("BUG-2", "PRJ-1", { severity: "critical", status: "verified", reporter: null });
  try {
    const tasks = await gateway.executeDomain({
      input: { capabilityId: "tasks-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      token: issue({ capabilityId: "tasks-list" }).token,
    });
    assert.equal(tasks.result.count, 2);
    assert.equal(tasks.result.tasks[1].estimatedHours, 16);
    assert.equal(tasks.result.tasks[1].dueDate, null);
    assert.equal(tasks.result.tasks[0].status, "todo");

    const defects = await gateway.executeDomain({
      input: { capabilityId: "defects-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      token: issue({ capabilityId: "defects-list" }).token,
    });
    assert.equal(defects.result.count, 2);
    assert.equal(defects.result.defects[1].severity, "critical");
    assert.equal(defects.result.defects[0].assignee, "QA Lead");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway creates a requirement, records the write audit, and rejects bad input", async () => {
  const { access, gateway, issue, seed, auditRows } = createDomainFixture();
  await seed.user(["ai:*", "requirement:*"]);
  await seed.project();
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", title: "AI drafted requirement", description: "Created through the scoped execution gateway.", priority: "high" },
      token: issue({ capabilityId: "requirement-create" }).token,
    });
    const created = captured.result.requirement;
    assert.equal(created.title, "AI drafted requirement");
    assert.equal(created.status, "draft");
    assert.equal(created.priority, "high");
    const stored = await access.row("SELECT * FROM requirements WHERE id = @id", { id: created.id });
    assert.equal(stored.project_id, "PRJ-1");
    assert.equal(stored.owner, "Product Office");
    assert.deepEqual(JSON.parse(stored.acceptance_criteria), []);
    const audits = await auditRows();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "ai.capability_execution_write");
    assert.equal(audits[0].resource_type, "requirement");
    assert.equal(audits[0].resource_id, created.id);
    assert.equal(audits[0].project_id, "PRJ-1");
    assert.equal(audits[0].scope_type, "project");

    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token: issue({ capabilityId: "requirement-create" }).token,
      }),
      { code: "VALIDATION_FAILED", status: 400 },
    );
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", title: "x".repeat(201) },
        token: issue({ capabilityId: "requirement-create" }).token,
      }),
      { code: "VALIDATION_FAILED", status: 400 },
    );
    // Validation failures are audited as rejections and create nothing.
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM requirements")).count, 1);
    assert.ok((await auditRows()).some((entry) => entry.action === "ai.capability_execution_denied"));
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway creates a task linked to a same-project requirement", async () => {
  const { access, gateway, issue, seed, auditRows } = createDomainFixture();
  await seed.user();
  await seed.project();
  await seed.project("PRJ-2");
  await seed.requirement("REQ-1");
  await seed.requirement("REQ-OTHER", "PRJ-2");
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "task-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-1", title: "AI drafted task", estimatedHours: 12 },
      token: issue({ capabilityId: "task-create" }).token,
    });
    const created = captured.result.task;
    assert.equal(created.title, "AI drafted task");
    assert.equal(created.status, "todo");
    assert.equal(created.estimatedHours, 12);
    const stored = await access.row("SELECT * FROM tasks WHERE id = @id", { id: created.id });
    assert.equal(stored.requirement_id, "REQ-1");
    assert.equal(stored.project_id, "PRJ-1");
    assert.equal(stored.owner, "Gateway Tester");
    assert.equal((await auditRows())[0].resource_type, "task");

    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "task-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-OTHER", title: "Cross-project task" },
        token: issue({ capabilityId: "task-create" }).token,
      }),
      { code: "VALIDATION_FAILED", status: 400 },
    );
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "task-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-MISSING", title: "Orphan task" },
        token: issue({ capabilityId: "task-create" }).token,
      }),
      { code: "RESOURCE_NOT_FOUND", status: 404 },
    );
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM tasks")).count, 1);
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects domain executions without the registry permission and audits the denial", async () => {
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({ actorPermissions: ["ai:*", "requirement:read"] });
  await seed.user();
  await seed.project();
  await seed.requirement("REQ-1");
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", title: "Denied requirement" },
        token: issue({ capabilityId: "requirement-create" }).token,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "defects-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token: issue({ capabilityId: "defects-list" }).token,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM requirements")).count, 1);
    const audits = await auditRows();
    assert.equal(audits.length, 2);
    assert.ok(audits.every((entry) => entry.action === "ai.capability_execution_denied"));
    assert.ok(audits.every((entry) => entry.project_id === "PRJ-1"));
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway lets project managers list defects through the project namespace", async () => {
  // defects-list is declared project:read so PM (project:* + ai:*) can read
  // project defects; the qa defect:* grant never reached this check because
  // qa holds no ai:* baseline, so no reachable access was removed.
  const { access, gateway, issue, seed } = createDomainFixture({
    actorPermissions: ["project:*", "requirement:*", "document:*", "ai:*", "audit:read", "source:read"],
  });
  await seed.user();
  await seed.project();
  await seed.defect("BUG-1");
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "defects-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      token: issue({ capabilityId: "defects-list" }).token,
    });
    assert.equal(captured.result.count, 1);
    assert.equal(captured.result.defects[0].id, "BUG-1");
    assert.equal(captured.evidence.event, "execution-gateway.defects-list");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects actors without ai:* for domain capabilities", async () => {
  const { access, gateway, issue, seed } = createDomainFixture({ actorPermissions: ["requirement:*"] });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token: issue().token,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects out-of-scope projects for domain capabilities", async () => {
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({ allowProject: false });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token: issue().token,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
    assert.equal((await auditRows())[0].action, "ai.capability_execution_denied");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects write capabilities when the project is not writable", async () => {
  const { access, gateway, issue, seed } = createDomainFixture({ allowWrite: false });
  await seed.user();
  await seed.project();
  await seed.requirement("REQ-1");
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "task-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", requirementId: "REQ-1", title: "Archived project task" },
        token: issue({ capabilityId: "task-create" }).token,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", title: "Archived project requirement" },
        token: issue({ capabilityId: "requirement-create" }).token,
      }),
      { code: "PERMISSION_DENIED", status: 403 },
    );
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM tasks")).count, 0);
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway lists pending future reminders through a sanitized projection", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  await seed.project("PRJ-2");
  await seed.reminder("REM-1", "PRJ-1", { remind_at: "2026-08-15T00:00:00.000Z" });
  await seed.reminder("REM-2", "PRJ-1", { remind_at: "2026-08-16T00:00:00.000Z", invocation_id: "AIC-OLD" });
  await seed.reminder("REM-DUE", "PRJ-1", { remind_at: "2026-08-13T23:59:00.000Z" });
  await seed.reminder("REM-SENT", "PRJ-1", { remind_at: "2026-08-20T00:00:00.000Z", status: "sent", sent_at: "2026-08-14T00:00:00.000Z" });
  await seed.reminder("REM-OTHER", "PRJ-2");
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "reminders-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      token: issue({ capabilityId: "reminders-list" }).token,
    });
    assert.equal(captured.result.projectId, "PRJ-1");
    assert.equal(captured.result.count, 2);
    assert.deepEqual(captured.result.reminders.map((item) => item.id), ["REM-1", "REM-2"]);
    assert.equal(captured.result.reminders[0].message, "Reminder REM-1");
    assert.equal(captured.result.reminders[1].invocationId, "AIC-OLD");
    // The read projection never leaks the owning actor id or audit internals.
    assert.deepEqual(Object.keys(captured.result.reminders[0]).sort(), ["createdAt", "id", "invocationId", "message", "remindAt", "status"]);
    assert.equal(captured.evidence.mode, "read");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway creates an audited reminder and rejects invalid remind windows", async () => {
  const { access, gateway, issue, seed, auditRows } = createDomainFixture();
  await seed.user(["ai:*", "project:read"]);
  await seed.project();
  try {
    const remindAt = new Date(Date.parse("2026-08-14T00:00:00.000Z") + 60 * 60 * 1000).toISOString();
    const captured = await gateway.executeDomain({
      input: {
        capabilityId: "reminder-create",
        capabilityVersion: "1.0.0",
        projectId: "PRJ-1",
        message: "Check the release checklist",
        remindAt: "2026-08-14T01:00:00.000Z",
      },
      token: issue({ capabilityId: "reminder-create", invocationId: "AIC-REM" }).token,
    });
    const created = captured.result.reminder;
    assert.equal(created.message, "Check the release checklist");
    assert.equal(created.status, "pending");
    assert.equal(created.remindAt, remindAt);
    assert.equal(created.invocationId, "AIC-REM");
    const stored = await access.row("SELECT * FROM ai_reminders WHERE id = @id", { id: created.id });
    assert.equal(stored.project_id, "PRJ-1");
    assert.equal(stored.actor_id, "USR-PM");
    assert.equal(stored.status, "pending");
    assert.equal(stored.sent_at, null);
    const audits = await auditRows();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "ai.capability_execution_write");
    assert.equal(audits[0].resource_type, "ai_reminder");
    assert.equal(audits[0].resource_id, created.id);
    assert.equal(audits[0].project_id, "PRJ-1");
    assert.equal(audits[0].scope_type, "project");

    // Past / too-close times, over-180-day horizons, bad ISO, and over-long
    // messages are 400 validation failures that leave nothing behind.
    const rejects = [
      [{ remindAt: "2026-08-13T00:00:00.000Z" }, "past"],
      [{ remindAt: "2026-08-14T00:00:59.000Z" }, "under 60s lead"],
      [{ remindAt: new Date(Date.parse("2026-08-14T00:00:00.000Z") + 181 * 24 * 60 * 60 * 1000).toISOString() }, "over 180 days"],
      [{ remindAt: "tomorrow" }, "not ISO"],
      [{ remindAt: "2026-08-14T01:00:00.000Z", message: "x".repeat(501) }, "message too long"],
      [{ remindAt: "2026-08-14T01:00:00.000Z", message: "   " }, "blank message"],
    ];
    for (const [override] of rejects) {
      await assert.rejects(
        () => gateway.executeDomain({
          input: {
            capabilityId: "reminder-create",
            capabilityVersion: "1.0.0",
            projectId: "PRJ-1",
            message: "Check the release checklist",
            ...override,
          },
          token: issue({ capabilityId: "reminder-create" }).token,
        }),
        { code: "VALIDATION_FAILED", status: 400 },
      );
    }
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM ai_reminders")).count, 1);
    const afterRejections = await auditRows();
    assert.equal(afterRejections.length, 1 + rejects.length);
    assert.ok(afterRejections.slice(1).every((entry) => entry.action === "ai.capability_execution_denied"));
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects unregistered capabilities and version mismatches", async () => {  const { access, gateway, issue, seed, auditRows } = createDomainFixture();
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirements-export", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token: issue().token,
      }),
      { code: "AI_EXECUTION_CAPABILITY_UNKNOWN", status: 400 },
    );
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirements-list", capabilityVersion: "9.9.9", projectId: "PRJ-1" },
        token: issue().token,
      }),
      { code: "AI_EXECUTION_CAPABILITY_UNKNOWN", status: 400 },
    );
    const audits = await auditRows();
    assert.equal(audits.length, 2);
    assert.ok(audits.every((entry) => entry.action === "ai.capability_execution_denied"));
    assert.equal(audits[0].scope_type, "project");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway refuses tokens scoped to a different capability and replays", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  const snapshotToken = issue({ capabilityId: "project-snapshot" }).token;
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token: snapshotToken,
      }),
      { code: "AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", status: 403 },
    );
    const token = issue().token;
    await gateway.executeDomain({
      input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      token,
    });
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
        token,
      }),
      { code: "AI_CAPABILITY_TOKEN_REPLAYED", status: 409 },
    );
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rolls the domain write back when the audit trail fails", async () => {
  const { access, gateway, issue, seed } = createDomainFixture({ failingAudit: true });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", title: "Unaudited requirement" },
        token: issue({ capabilityId: "requirement-create" }).token,
      }),
      { code: "AI_CAPABILITY_AUDIT_WRITE_FAILED", status: 502 },
    );
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM requirements")).count, 0);
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rolls back without a transaction helper using audit-before-create ordering", async () => {
  const { access, gateway, issue, seed } = createDomainFixture({ failingAudit: true, useTransaction: false });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "requirement-create", capabilityVersion: "1.0.0", projectId: "PRJ-1", title: "Unaudited requirement" },
        token: issue({ capabilityId: "requirement-create" }).token,
      }),
      { code: "AI_CAPABILITY_AUDIT_WRITE_FAILED", status: 502 },
    );
    assert.equal((await access.row("SELECT COUNT(*) AS count FROM requirements")).count, 0);
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway serves domain executions over its loopback HTTP route only", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  await seed.requirement("REQ-1");
  const token = issue().token;
  const baseUrl = await gateway.start();
  try {
    const response = await fetch(`${baseUrl}/v1/execution`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.result.count, 1);
    assert.equal(payload.data.evidence.capabilityId, "requirements-list");

    const unknown = await fetch(`${baseUrl}/v1/execution`, {
      method: "POST",
      headers: { authorization: `Bearer ${issue().token}`, "content-type": "application/json" },
      body: JSON.stringify({ capabilityId: "requirements-export", capabilityVersion: "1.0.0", projectId: "PRJ-1" }),
    });
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error.code, "AI_EXECUTION_CAPABILITY_UNKNOWN");

    const query = await fetch(`${baseUrl}/v1/execution?capabilityId=requirements-list`, { method: "POST" });
    assert.equal(query.status, 404);
    assert.equal((await query.json()).error.code, "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN");
    const put = await fetch(`${baseUrl}/v1/execution`, {
      method: "PUT",
      headers: { authorization: `Bearer ${issue().token}`, "content-type": "application/json" },
      body: JSON.stringify({ capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" }),
    });
    assert.equal(put.status, 404);
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

// ---------------------------------------------------------------------------
// ui-control: non-project write capability for dsh -> frontend directives
// ---------------------------------------------------------------------------

test("execution gateway dispatches ui-control without a project scope and audits the write", async () => {
  const sinks = [];
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({
    uiDirectiveSink: (userId, directive) => {
      sinks.push({ directive, userId });
      return 2;
    },
  });
  await seed.user();
  await seed.project();
  try {
    const captured = await gateway.executeDomain({
      input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "theme", mode: "dark" } },
      token: issue({ capabilityId: "ui-control", invocationId: "AIC-UI", userId: "USR-PM" }).token,
    });
    assert.deepEqual(captured.result, { delivered: 2, ok: true });
    assert.equal(captured.evidence.event, "execution-gateway.ui-control");
    assert.equal(captured.evidence.mode, "write");
    assert.deepEqual(sinks, [{ directive: { kind: "theme", mode: "dark" }, userId: "USR-PM" }]);
    const audits = await auditRows();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "ai.tool.ui_control");
    assert.equal(audits[0].resource_type, "ai_ui_directive");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects out-of-whitelist ui-control directives and audits the denial", async () => {
  const sinks = [];
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({
    uiDirectiveSink: (userId, directive) => {
      sinks.push({ directive, userId });
      return 1;
    },
  });
  await seed.user();
  await seed.project();
  try {
    for (const directive of [
      { kind: "shell", command: "rm -rf" },
      { kind: "fontSize", value: 99 },
      { kind: "navigate", page: "" },
      "theme",
      undefined,
    ]) {
      await assert.rejects(
        () => gateway.executeDomain({
          input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive },
          token: issue({ capabilityId: "ui-control", userId: "USR-PM" }).token,
        }),
        { code: "AI_UI_DIRECTIVE_INVALID", status: 400 },
      );
    }
    assert.deepEqual(sinks, [], "rejected directives never reach the sink");
    const audits = await auditRows();
    assert.equal(audits.length, 5);
    assert.ok(audits.every((entry) => entry.action === "ai.capability_execution_denied"));
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway binds ui-control to its scoped token like every other capability", async () => {
  const { access, gateway, issue, seed } = createDomainFixture({ uiDirectiveSink: () => 1 });
  await seed.user();
  await seed.project();
  try {
    // A requirements-list token cannot execute ui-control.
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "theme", mode: "light" } },
        token: issue().token,
      }),
      { code: "AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", status: 403 },
    );
    // Actors without ai:* are rejected before dispatch.
    const limited = createDomainFixture({ actorPermissions: ["requirement:read"], uiDirectiveSink: () => 1 });
    await limited.seed.user();
    await limited.seed.project();
    try {
      await assert.rejects(
        () => limited.gateway.executeDomain({
          input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "theme", mode: "light" } },
          token: limited.issue({ capabilityId: "ui-control", userId: "USR-PM" }).token,
        }),
        { code: "PERMISSION_DENIED", status: 403 },
      );
    } finally {
      await limited.gateway.close();
      limited.access.runtime?.close?.();
    }
    // Tokens are one-use here too.
    const token = issue({ capabilityId: "ui-control", userId: "USR-PM" }).token;
    await gateway.executeDomain({
      input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "openAiSidebar", open: true } },
      token,
    });
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "openAiSidebar", open: false } },
        token,
      }),
      { code: "AI_CAPABILITY_TOKEN_REPLAYED", status: 409 },
    );
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway audits ui-control even when the token carries no push target", async () => {
  const sinks = [];
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({
    uiDirectiveSink: (userId, directive) => {
      sinks.push({ directive, userId });
      return 1;
    },
  });
  await seed.user();
  await seed.project();
  try {
    // Direct REST calls without an invocation context may use legacy tokens
    // that predate the userId claim: the audit is still written and the
    // execution succeeds with delivered 0.
    const captured = await gateway.executeDomain({
      input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "reduceMotion", value: true } },
      token: issue({ capabilityId: "ui-control" }).token,
    });
    assert.deepEqual(captured.result, { delivered: 0, ok: true });
    assert.deepEqual(sinks, []);
    const audits = await auditRows();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "ai.tool.ui_control");

    // A missing sink behaves the same way: audit + ok with delivered 0.
    const sinkless = createDomainFixture();
    await sinkless.seed.user();
    await sinkless.seed.project();
    try {
      const sinklessResult = await sinkless.gateway.executeDomain({
        input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "density", value: "compact" } },
        token: sinkless.issue({ capabilityId: "ui-control", userId: "USR-PM" }).token,
      });
      assert.deepEqual(sinklessResult.result, { delivered: 0, ok: true });
    } finally {
      await sinkless.gateway.close();
      sinkless.access.runtime?.close?.();
    }
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway refuses to push a ui-control directive when its audit write fails", async () => {
  const sinks = [];
  const { access, gateway, issue, seed } = createDomainFixture({
    failingAudit: true,
    uiDirectiveSink: (userId, directive) => {
      sinks.push({ directive, userId });
      return 1;
    },
  });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "ui-control", capabilityVersion: "1.0.0", directive: { kind: "accentColor", value: "#1a2b3c" } },
        token: issue({ capabilityId: "ui-control", userId: "USR-PM" }).token,
      }),
      { code: "AI_CAPABILITY_AUDIT_WRITE_FAILED", status: 502 },
    );
    assert.deepEqual(sinks, [], "audit-before-push: no directive is delivered without the audit record");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway captures successful runtime-tool domain executions for the adapter", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  await seed.requirement("REQ-1");
  try {
    await gateway.executeDomain({
      input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      source: "runtime-tool",
      token: issue().token,
    });
    const captured = gateway.getCaptured("AIC-1");
    assert.equal(captured.result.count, 1);
    assert.equal(captured.evidence.source, "runtime-tool");
    assert.equal(captured.claims.projectId, "PRJ-1");
    assert.equal(gateway.getCaptured("AIC-1"), null, "capture is one-shot");

    // Adapter-fallback executions (the local path) are not captured.
    await gateway.executeDomain({
      input: { capabilityId: "requirements-list", capabilityVersion: "1.0.0", projectId: "PRJ-1" },
      source: "adapter-fallback",
      token: issue().token,
    });
    assert.equal(gateway.getCaptured("AIC-2"), null);
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway dispatches browser-control without project gates and audits first", async () => {
  const executed = [];
  const browserControl = {
    normalizeAction: (input) => ({ action: String(input.action || "").trim(), url: String(input.url || "").trim() }),
    sweepSessions: () => {},
    executeAction: async (normalized, { sessionKey, invocationId }) => {
      executed.push({ normalized, sessionKey, invocationId });
      return { ok: true, action: normalized.action, url: "https://example.com/", title: "Example", text: "hello", screenshotKey: invocationId };
    },
  };
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({ browserControl });
  await seed.user();
  await seed.project();
  try {
    // projectScoped:false — the token's projectId may differ from the only
    // accessible project and the write still executes (no project writability
    // gate, no canAccessProject gate).
    const captured = await gateway.executeDomain({
      input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "open", url: "https://example.com/" },
      token: issue({ capabilityId: "browser-control", projectId: "PRJ-OTHER" }).token,
    });
    assert.equal(captured.result.ok, true);
    assert.equal(captured.result.title, "Example");
    assert.equal(captured.evidence.mode, "write");
    assert.deepEqual(executed, [{
      normalized: { action: "open", url: "https://example.com/" },
      sessionKey: "USR-PM:PRJ-OTHER",
      invocationId: "AIC-1",
    }]);
    const audits = await auditRows();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "ai.tool.browser_control");
    assert.equal(audits[0].resource_type, "ai_browser_action");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway aborts browser-control when the audit fails", async () => {
  const executed = [];
  const browserControl = {
    normalizeAction: (input) => ({ action: String(input.action || "").trim() }),
    sweepSessions: () => {},
    executeAction: async (normalized, opts) => {
      executed.push({ normalized, opts });
      return { ok: true, action: normalized.action };
    },
  };
  const { access, gateway, issue, seed } = createDomainFixture({ browserControl, failingAudit: true });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "screenshot" },
        token: issue({ capabilityId: "browser-control" }).token,
      }),
      { code: "AI_CAPABILITY_AUDIT_WRITE_FAILED", status: 502 },
    );
    assert.deepEqual(executed, [], "the browser is never touched when the audit fails");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway rejects unknown browser actions and audits the denial", async () => {
  const executed = [];
  const browserControl = {
    normalizeAction: () => {
      const error = new Error("Unsupported browser action: rm.");
      error.code = "AI_BROWSER_ACTION_UNKNOWN";
      error.status = 400;
      throw error;
    },
    sweepSessions: () => {},
    executeAction: async () => { executed.push(1); return { ok: true }; },
  };
  const { access, gateway, issue, seed, auditRows } = createDomainFixture({ browserControl });
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "rm" },
        token: issue({ capabilityId: "browser-control" }).token,
      }),
      { code: "AI_BROWSER_ACTION_UNKNOWN", status: 400 },
    );
    assert.deepEqual(executed, []);
    const audits = await auditRows();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "ai.capability_execution_denied");
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway binds browser-control to its scoped token and one-use semantics", async () => {
  const browserControl = {
    normalizeAction: (input) => ({ action: String(input.action || "").trim() }),
    sweepSessions: () => {},
    executeAction: async () => ({ ok: true, action: "text" }),
  };
  const { access, gateway, issue, seed } = createDomainFixture({ browserControl });
  await seed.user();
  await seed.project();
  try {
    // A requirements-list token cannot execute browser-control.
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "text" },
        token: issue().token,
      }),
      { code: "AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", status: 403 },
    );
    // One-use: the second execution with the same token is a replay.
    const token = issue({ capabilityId: "browser-control" }).token;
    await gateway.executeDomain({
      input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "text" },
      token,
    });
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "text" },
        token,
      }),
      { code: "AI_CAPABILITY_TOKEN_REPLAYED", status: 409 },
    );
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});

test("execution gateway reports browser-control unavailable when no service is injected", async () => {
  const { access, gateway, issue, seed } = createDomainFixture();
  await seed.user();
  await seed.project();
  try {
    await assert.rejects(
      () => gateway.executeDomain({
        input: { capabilityId: "browser-control", capabilityVersion: "1.0.0", action: "text" },
        token: issue({ capabilityId: "browser-control" }).token,
      }),
      { code: "AI_BROWSER_DISABLED", status: 503 },
    );
  } finally {
    await gateway.close();
    access.runtime?.close?.();
  }
});
