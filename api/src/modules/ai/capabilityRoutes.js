const express = require("express");
const path = require("node:path");
const { readCompositionSummary, readSdkVersion } = require("./harnessComposition");
const { DEFAULT_MAX_RUNS_PER_RUNTIME } = require("./harnessRuntime");
const { extractTokenUsage } = require("./tokenUsage");
const { assertUiDirective } = require("./uiDirectives");

const DEFAULT_INVOCATION_LIMIT = 20;
const MAX_INVOCATION_LIMIT = 100;

function usageBoundary(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function invocationLimit(value) {
  const text = String(value ?? "").trim();
  if (!text) return DEFAULT_INVOCATION_LIMIT;
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_INVOCATION_LIMIT);
}

function invocationSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    capabilityId: row.capability_id,
    capabilityVersion: row.capability_version,
    status: row.status,
    projectId: row.project_id,
    actorId: row.actor_id,
    errorCode: row.error_code || null,
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
  };
}

function parseSnapshotColumn(value, fallback) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseSnapshotArray(value) {
  const parsed = parseSnapshotColumn(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

// The shared harness runtime is owned by the model client and created lazily,
// so the status payload reports idle defaults until the first inference run.
function harnessRuntimeStatus(modelClient) {
  const status = typeof modelClient?.status === "function" ? modelClient.status() : {};
  const runtime = status?.runtime && typeof status.runtime === "object" ? status.runtime : {};
  const proxy = runtime.proxy && typeof runtime.proxy === "object" ? runtime.proxy : {};
  const maxRunsPerRuntime = Number(runtime.maxRunsPerRuntime);
  const totalCalls = Number(runtime.totalCalls);
  const totalRuns = Number(runtime.totalRuns);
  return {
    active: Boolean(runtime.active),
    activeCalls: Number(runtime.activeCalls) || 0,
    closed: Boolean(runtime.closed),
    idleTtlMs: Number(runtime.idleTtlMs) || 0,
    // 0 = resident runtime (no call-count recycling); positive = bounded recycle.
    maxRunsPerRuntime: Number.isSafeInteger(maxRunsPerRuntime) && maxRunsPerRuntime >= 0
      ? maxRunsPerRuntime
      : DEFAULT_MAX_RUNS_PER_RUNTIME,
    queued: Number(runtime.queued) || 0,
    totalCalls: Number.isSafeInteger(totalCalls) && totalCalls >= 0 ? totalCalls : 0,
    totalRuns: Number.isSafeInteger(totalRuns) && totalRuns >= 0 ? totalRuns : 0,
    proxy: {
      started: Boolean(proxy.started),
      activeRoutes: Number(proxy.activeRoutes) || 0,
    },
  };
}

function createAiCapabilitiesRouter({
  audit,
  beginIdempotentRequest = async () => ({
    abort: async () => {},
    commit: async () => {},
  }),
  browserScreenshotDir,
  canAccessProject,
  fail,
  fsImpl = require("node:fs"),
  hasPermission,
  modelClient,
  ok,
  pushUiDirective,
  repository,
  requirePermission,
  resolveAccessScope,
  service,
  tokenUsage,
}) {
  const router = express.Router();

  router.get("/ai/harness/status", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const composition = readCompositionSummary();
      res.json(ok({
        composition: {
          id: composition.id,
          sdkVersion: readSdkVersion(),
          plugins: composition.plugins,
        },
        runtime: harnessRuntimeStatus(modelClient),
        tokenUsageService: Boolean(tokenUsage && typeof tokenUsage.record === "function" && typeof tokenUsage.summarize === "function"),
      }));
    } catch (error) { next(error); }
  });

  router.get("/ai/capabilities", requirePermission("ai:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.listForUser(req.user)));
    } catch (error) { next(error); }
  });

  router.get("/ai/usage/summary", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const projectId = String(req.query.projectId || "").trim();
      const capabilityId = String(req.query.capabilityId || "").trim();
      const from = usageBoundary(req.query.from);
      if (from === null) return fail(res, 400, "VALIDATION_FAILED", "Query parameter 'from' must be an ISO 8601 timestamp.");
      const to = usageBoundary(req.query.to);
      if (to === null) return fail(res, 400, "VALIDATION_FAILED", "Query parameter 'to' must be an ISO 8601 timestamp.");
      const groupBy = String(req.query.groupBy || "").trim() || "capability";
      if (groupBy !== "capability" && groupBy !== "day") {
        return fail(res, 400, "VALIDATION_FAILED", "Query parameter 'groupBy' must be 'capability' or 'day'.");
      }
      if (projectId && !(await canAccessProject(req.user, projectId))) {
        return fail(res, 403, "PERMISSION_DENIED", "You cannot access this project's AI usage.");
      }
      res.json(ok(await tokenUsage.summarize({ capabilityId, from, groupBy, projectId, to })));
    } catch (error) { next(error); }
  });

  router.get("/ai/capabilities/invocations", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const limit = invocationLimit(req.query.limit);
      if (limit === null) {
        return fail(res, 400, "VALIDATION_FAILED", "Query parameter 'limit' must be a positive integer.");
      }
      if (!repository || typeof repository.list !== "function") {
        return fail(res, 500, "AI_CAPABILITY_REPOSITORY_UNAVAILABLE", "AI capability invocation queries are unavailable.");
      }
      const projectId = String(req.query.projectId || "").trim();
      const status = String(req.query.status || "").trim();
      let projectIds;
      if (projectId) {
        if (!(await canAccessProject(req.user, projectId))) {
          return fail(res, 403, "PERMISSION_DENIED", "You cannot access this project's AI capability invocations.");
        }
      } else if (typeof resolveAccessScope === "function") {
        const accessScope = await resolveAccessScope(req.user);
        if (accessScope?.all !== true) {
          projectIds = Array.isArray(accessScope?.projectIds) ? accessScope.projectIds.map(String) : [];
          if (!projectIds.length) return res.json(ok({ items: [], total: 0 }));
        }
      }
      const listed = await repository.list({
        limit,
        projectId: projectId || null,
        projectIds: projectIds || null,
        status: status || null,
      });
      res.json(ok({ items: listed.items.map(invocationSummary), total: listed.total }));
    } catch (error) { next(error); }
  });

  router.get("/ai/capabilities/invocations/:id", requirePermission("ai:*"), async (req, res, next) => {
    try {
      if (!repository || typeof repository.find !== "function") {
        return fail(res, 500, "AI_CAPABILITY_REPOSITORY_UNAVAILABLE", "AI capability invocation queries are unavailable.");
      }
      const record = await repository.find(String(req.params.id || ""));
      if (!record) return fail(res, 404, "RESOURCE_NOT_FOUND", "AI capability invocation not found.");
      if (!(await canAccessProject(req.user, record.project_id))) {
        return fail(res, 403, "PERMISSION_DENIED", "You cannot access this AI capability invocation.");
      }
      // Snapshots that carry execution tokens or bulky configuration detail
      // (execution/assistant/provider/policy/input/manifest) stay internal;
      // persisted harness events were already token-redacted on completion.
      const events = parseSnapshotArray(record.harness_events);
      const usage = extractTokenUsage(events);
      res.json(ok({
        ...invocationSummary(record),
        events,
        tokenUsage: usage,
        result: parseSnapshotColumn(record.result_snapshot, null),
      }));
    } catch (error) { next(error); }
  });

  // Browser control screenshot artifact (ai:*): scoped to the invocation's
  // control-plane project, 404 when the invocation or the file is missing.
  // A screenshot captures whatever the browsing actor opened, so within a
  // shared project only the invoking actor (or an admin) may fetch it.
  router.get("/ai/browser/screenshots/:invocationId", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const invocation = await repository.find(String(req.params.invocationId || "").trim());
      if (!invocation || !invocation.project_id) {
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Browser screenshot not found.");
      }
      if (!(await canAccessProject(req.user, invocation.project_id))) {
        return fail(res, 403, "PERMISSION_DENIED", "You cannot access this browser screenshot.");
      }
      const actorIsAdmin = typeof hasPermission === "function"
        ? hasPermission(req.user, "admin:*")
        : req.user?.role === "admin";
      if (invocation.actor_id !== req.user?.id && !actorIsAdmin) {
        return fail(res, 403, "PERMISSION_DENIED", "You cannot access this browser screenshot.");
      }
      const filePath = browserScreenshotDir
        ? path.join(browserScreenshotDir, `${String(req.params.invocationId).trim()}.png`)
        : null;
      if (!filePath || !fsImpl.existsSync(filePath)) {
        return fail(res, 404, "RESOURCE_NOT_FOUND", "Browser screenshot not found.");
      }
      res.type("png").sendFile(filePath);
    } catch (error) { next(error); }
  });

  router.post("/ai/capabilities/:id/invocations", requirePermission("ai:*"), async (req, res, next) => {
    let idempotency = null;
    try {
      idempotency = await beginIdempotentRequest(req, res, "ai.capability.invoke");
      if (!idempotency) return;
      const invocation = await service.invoke({
        actor: req.user,
        capabilityId: req.params.id,
        input: req.body || {},
        ip: req.ip,
      });
      const response = ok(invocation);
      await idempotency.commit(200, response);
      res.json(response);
    } catch (error) {
      await idempotency?.abort?.();
      next(error);
    }
  });

  // UI directive test-fire (ai:* REST): validates the directive against the
  // shared whitelist, fans it out to the caller's own connected ui subscribers
  // (the same agent.ui messages the realtime channel delivers), and reports the
  // delivered connection count. Zero connected clients is still a success —
  // directives are best-effort by design.
  router.post("/ai/ui-directives", requirePermission("ai:*"), async (req, res, next) => {
    try {
      const directive = assertUiDirective(req.body?.directive);
      const delivered = typeof pushUiDirective === "function" ? pushUiDirective(req.user?.id, directive) : 0;
      if (typeof audit === "function") {
        await audit(req.user, "ai.ui_directive.emit", "ai_ui_directive", null, null, { delivered, kind: directive.kind }, req.ip);
      }
      res.json(ok({ delivered }));
    } catch (error) { next(error); }
  });

  router.get("/admin/ai-capabilities/:id", requirePermission("admin:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.getAdmin(req.params.id)));
    } catch (error) { next(error); }
  });

  router.patch("/admin/ai-capabilities/:id", requirePermission("admin:*"), async (req, res, next) => {
    try {
      res.json(ok(await service.updateControl({
        actor: req.user,
        id: req.params.id,
        input: req.body || {},
        ip: req.ip,
      })));
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAiCapabilitiesRouter };
