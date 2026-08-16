const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const { createAiJobsRouter, createRequirementLifecycle } = require("../src/modules/ai/routes");

function hasPermission(user, permission) {
  const permissions = user?.permissions || [];
  const namespace = permission.split(":")[0];
  return permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${namespace}:*`);
}

async function createHarness(permissions, { withRequirementDraft = true } = {}) {
  const requirements = new Map();
  const tasks = new Map();
  const statusHistory = [];
  const auditEvents = [];
  let id = 0;
  const nextId = async (prefix) => `${prefix}-${(id += 1)}`;
  const job = {
    job_id: "JOB-1",
    scene: "document_analysis",
    status: "awaiting_review",
    progress: 100,
    current_step: "review",
    source_type: "document",
    source_id: "DOC-1",
    result: JSON.stringify(withRequirementDraft ? {
      summary: "AI generated requirement",
      requirements: [{
        title: "AI requirement",
        priority: "high",
        acceptanceCriteria: ["It is reviewable"],
      }],
    } : { summary: "AI review contains no requirement draft" }),
    evidence: "[]",
    written_requirement_id: null,
    retry_count: 0,
    created_at: "2026-08-15T00:00:00.000Z",
  };

  const createRequirementWithInvariants = createRequirementLifecycle({
    json: JSON.stringify,
    mergeRequirementLinkedTask: async (requirementId, taskId) => {
      const requirement = requirements.get(requirementId);
      requirement.linked_tasks = JSON.stringify([taskId]);
    },
    nextId,
    repository: {
      createRequirement: async (requirement) => requirements.set(requirement.id, { ...requirement }),
    },
    statusHistory: {
      record: async (entry) => statusHistory.push(entry),
    },
    syncRequirementTask: async (requirement) => {
      const taskId = await nextId("TASK");
      tasks.set(taskId, {
        id: taskId,
        project_id: requirement.project_id,
        requirement_id: requirement.id,
        source_id: requirement.id,
        source_type: "requirement",
      });
      return taskId;
    },
    transaction: async (work) => await work(),
  });

  const repository = {
    findDocument: async (documentId) => documentId === "DOC-1"
      ? { id: "DOC-1", project_id: "PRJ-1", linked_requirements: "[]" }
      : null,
    findJob: async (jobId) => jobId === job.job_id ? job : null,
    findLiveProject: async (projectId) => projectId === "PRJ-1" ? { id: "PRJ-1" } : null,
    findRequirementProject: async () => null,
    listLiveProjectIds: async () => ["PRJ-1"],
    transition: async (current, status, patch) => {
      assert.equal(current.status, "awaiting_review");
      Object.assign(job, patch, { status });
      return job;
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "USR-1", name: "AI reviewer", permissions };
    next();
  });
  app.use(createAiJobsRouter({
    audit: async (...args) => auditEvents.push(args),
    canAccessProject: async () => true,
    canViewDocument: async () => true,
    canWriteProject: async () => true,
    createRequirementWithInvariants,
    dispatcher: { enqueue: () => {} },
    fail: (res, status, errorCode, message) => res.status(status).json({ errorCode, message }),
    hasPermission,
    json: JSON.stringify,
    mapDocument: (document) => document,
    nextId,
    now: () => "2026-08-15T00:00:00.000Z",
    ok: (data) => ({ data }),
    parse: JSON.parse,
    repository,
    requirementPriorities: ["low", "medium", "high"],
    requirePermission: (permission) => (req, res, next) => {
      if (hasPermission(req.user, permission)) return next();
      return res.status(403).json({ errorCode: "PERMISSION_DENIED" });
    },
    transaction: async (work) => await work(),
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    auditEvents,
    job,
    requirements,
    statusHistory,
    tasks,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
    async confirm() {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/ai/jobs/JOB-1/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { body: await response.json(), response };
    },
  };
}

test("AI job confirmation requires requirement permission before creating a requirement", async (t) => {
  const harness = await createHarness(["ai:*"]);
  t.after(() => harness.close());

  const result = await harness.confirm();
  assert.equal(result.response.status, 403);
  assert.equal(result.body.errorCode, "PERMISSION_DENIED");
  assert.equal(harness.requirements.size, 0);
  assert.equal(harness.job.status, "awaiting_review");
});

test("AI job confirmation without a requirement draft only requires AI permission", async (t) => {
  const harness = await createHarness(["ai:*"], { withRequirementDraft: false });
  t.after(() => harness.close());

  const result = await harness.confirm();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.status, "confirmed");
  assert.equal(harness.requirements.size, 0);
  assert.equal(harness.auditEvents.length, 1);
});

test("AI job confirmation creates requirements through the shared lifecycle", async (t) => {
  const harness = await createHarness(["ai:*", "requirement:*"]);
  t.after(() => harness.close());

  const result = await harness.confirm();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.status, "confirmed");
  assert.equal(harness.requirements.size, 1);

  const [requirement] = harness.requirements.values();
  assert.equal(result.body.data.writtenRequirementId, requirement.id);
  assert.equal(requirement.owner, "AI reviewer");
  assert.deepEqual(requirement.acceptance_criteria && JSON.parse(requirement.acceptance_criteria), ["It is reviewable"]);
  assert.deepEqual(harness.statusHistory, [{
    resourceType: "requirement",
    resourceId: requirement.id,
    projectId: "PRJ-1",
    toStatus: "draft",
    reason: "需求创建",
    actor: { id: "USR-1", name: "AI reviewer", permissions: ["ai:*", "requirement:*"] },
  }]);
  const [task] = harness.tasks.values();
  assert.equal(task.requirement_id, requirement.id);
  assert.deepEqual(JSON.parse(requirement.linked_tasks), [task.id]);
  assert.equal(harness.auditEvents.length, 1);
});
