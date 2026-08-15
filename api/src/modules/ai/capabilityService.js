const crypto = require("node:crypto");
const { capabilityError, publicManifest } = require("./capabilityRegistry");
const { NOOP_AGENT_EVENT_BUS } = require("./agentEventBus");
const { extractTokenUsage } = require("./tokenUsage");

function jsonSnapshot(json, value) {
  return json(value === undefined ? null : value);
}

function publicInvocation(row, parse) {
  if (!row) return null;
  return {
    invocationId: row.id,
    capability: {
      id: row.capability_id,
      version: row.capability_version,
    },
    status: row.status,
    projectId: row.project_id,
    assistant: parse(row.assistant_snapshot, {}),
    provider: parse(row.provider_snapshot, {}),
    result: parse(row.result_snapshot, null),
    errorCode: row.error_code || null,
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
  };
}

function publicCapability(manifest, control, assistant) {
  return {
    ...publicManifest(manifest),
    enabled: Boolean(control.enabled && manifest.status === "approved"),
    availability: assistant?.available === false ? "fallback_available" : "available",
  };
}

function redactTokenText(value, token) {
  const text = String(value || "");
  return token ? text.split(token).join("[redacted]") : text;
}

function redactExecutionToken(value, token) {
  if (typeof value === "string") return redactTokenText(value, token);
  if (Array.isArray(value)) return value.map((item) => redactExecutionToken(item, token));
  if (!value || typeof value !== "object") return value;
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (["token", "executiontoken", "authorization", "authorizationheader", "bearertoken"].includes(key.toLowerCase())) continue;
    redacted[key] = redactExecutionToken(item, token);
  }
  return redacted;
}

function errorDetails(error, token) {
  return {
    code: redactTokenText(error?.code || "AI_CAPABILITY_INVOCATION_FAILED", token).slice(0, 120),
    message: redactTokenText(error?.message || "AI capability invocation failed.", token).replace(/\s+/g, " ").slice(0, 240),
  };
}

function auditFailureDetails(error, token) {
  return {
    code: redactTokenText(error?.code || "AI_CAPABILITY_AUDIT_WRITE_FAILED", token).slice(0, 120),
    message: redactTokenText(error?.message || "AI capability audit write failed.", token).replace(/\s+/g, " ").slice(0, 240),
  };
}

function safeProviderSnapshot(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = (item, maxLength = 160) => typeof item === "string" ? item.trim().slice(0, maxLength) || null : null;
  return {
    configured: Boolean(source.configured),
    disableResponseStorage: Boolean(source.disableResponseStorage),
    enabled: Boolean(source.enabled),
    id: text(source.id || source.activeId, 128),
    model: text(source.model),
    provider: text(source.provider),
    wireApi: text(source.wireApi, 32),
  };
}

function completionAuditFailureEvent(now, error, token) {
  const detail = auditFailureDetails(error, token);
  return {
    at: now(),
    detail: { code: detail.code },
    type: "audit.completion_failed",
  };
}

function createAiCapabilityService({
  adapter,
  agentEventBus = NOOP_AGENT_EVENT_BUS,
  audit,
  canAccessProject,
  controlStore,
  findProject,
  getAssistantSnapshot,
  getProviderSnapshot,
  hasPermission,
  json,
  logger = console,
  now,
  parse,
  registry,
  repository,
  tokenService,
  tokenUsage,
}) {
  if (!adapter || typeof adapter.invoke !== "function") throw new Error("AI capability adapter is required.");
  if (!repository || typeof repository.create !== "function" || typeof repository.update !== "function") throw new Error("AI capability repository is required.");
  if (!registry || typeof registry.get !== "function" || typeof registry.normalizeInvocationInput !== "function" || typeof registry.validateInvocationOutput !== "function") {
    throw new Error("AI capability registry must validate invocation input and output.");
  }

  async function ensureProject(projectId) {
    const project = await findProject(projectId);
    if (!project) throw capabilityError("RESOURCE_NOT_FOUND", "Project not found.", 404);
    return project;
  }

  async function accessDecision(user, manifest, input) {
    const control = await controlStore.get(manifest.id);
    if (manifest.status !== "approved") {
      throw capabilityError("AI_CAPABILITY_UNAPPROVED", "AI capability is not approved.", 503);
    }
    if (!control.enabled) {
      throw capabilityError("AI_CAPABILITY_DISABLED", "AI capability is disabled by the control plane.", 503);
    }
    if (!manifest.requiredPermissions.every((permission) => hasPermission(user, permission))) {
      throw capabilityError("PERMISSION_DENIED", "You cannot invoke this AI capability.", 403);
    }
    if (!(await canAccessProject(user, input.projectId))) {
      throw capabilityError("PERMISSION_DENIED", "You cannot access this project.", 403);
    }
    return {
      control,
      decision: "allow",
      projectId: input.projectId,
      requiredPermissions: [...manifest.requiredPermissions],
    };
  }

  async function snapshotDependencies() {
    const [assistant, provider] = await Promise.all([
      getAssistantSnapshot(),
      getProviderSnapshot(),
    ]);
    return { assistant, provider: safeProviderSnapshot(provider) };
  }

  async function listForUser(user) {
    const assistant = await getAssistantSnapshot();
    const controls = await controlStore.list();
    return controls
      .filter(({ manifest, control }) => manifest.status === "approved" && control.enabled)
      .filter(({ manifest }) => manifest.requiredPermissions.every((permission) => hasPermission(user, permission)))
      .map(({ manifest, control }) => publicCapability(manifest, control, assistant));
  }

  async function getAdmin(id) {
    const manifest = registry.get(id);
    if (!manifest) throw capabilityError("RESOURCE_NOT_FOUND", "AI capability not found.", 404);
    const control = await controlStore.get(manifest.id);
    return {
      ...publicCapability(manifest, control, await getAssistantSnapshot()),
      control: controlStore.publicControl(manifest, control),
    };
  }

  async function updateControl({ actor, id, input, ip }) {
    const updated = await controlStore.update(id, input, actor);
    const result = {
      ...publicCapability(updated.manifest, updated.after, await getAssistantSnapshot()),
      control: controlStore.publicControl(updated.manifest, updated.after),
    };
    try {
      await audit(
        actor,
        "admin.ai_capability_control_update",
        "ai_capability",
        updated.manifest.id,
        { ...updated.before, capabilityId: updated.manifest.id },
        { ...updated.after, capabilityId: updated.manifest.id },
        ip,
      );
    } catch (error) {
      // The control write already succeeded. Reporting it as a failed request
      // invites a retry with stale intent and can reverse a kill switch.
      logger?.warn?.("AI capability control audit write failed:", error?.code || error?.message || error);
    }
    return result;
  }

  async function invoke({ actor, capabilityId, input: rawInput, ip }) {
    const manifest = registry.get(capabilityId);
    if (!manifest) throw capabilityError("RESOURCE_NOT_FOUND", "AI capability not found.", 404);
    const input = registry.normalizeInvocationInput(manifest.id, rawInput);
    await ensureProject(input.projectId);
    const invocationId = `AIC-${crypto.randomUUID()}`;
    const createdAt = now();
    const { assistant, provider } = await snapshotDependencies();
    let policy = { decision: "pending", projectId: input.projectId };
    let executionToken = "";
    let invocation = await repository.create({
      id: invocationId,
      capability_id: manifest.id,
      capability_version: manifest.version,
      status: "accepted",
      actor_id: actor.id,
      project_id: input.projectId,
      assistant_snapshot: jsonSnapshot(json, assistant),
      provider_snapshot: jsonSnapshot(json, provider),
      manifest_snapshot: jsonSnapshot(json, publicManifest(manifest)),
      policy_snapshot: jsonSnapshot(json, policy),
      input_snapshot: jsonSnapshot(json, input),
      execution_snapshot: jsonSnapshot(json, {}),
      result_snapshot: null,
      harness_events: jsonSnapshot(json, []),
      error_code: null,
      error_message: null,
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      updated_at: createdAt,
    });

    try {
      // Fail fast before waiting for a runtime slot, then re-check at the
      // actual execution boundary below so a queued request cannot outlive a
      // permission or kill-switch change.
      policy = await accessDecision(actor, manifest, input);
      let executionStarted = false;
      let beginExecutionTask;
      const beginExecution = async () => {
        beginExecutionTask ||= (async () => {
          policy = await accessDecision(actor, manifest, input);
          const issued = tokenService.issue({
            actorId: actor.id,
            capabilityId: manifest.id,
            capabilityVersion: manifest.version,
            invocationId,
            projectId: input.projectId,
            // Push-target claim: the execution gateway resolves ui-control
            // directive recipients from the token, not from tool input.
            userId: actor.id,
          });
          executionToken = issued.token;
          const startedAt = now();
          invocation = await repository.update(invocationId, {
            status: "running",
            policy_snapshot: jsonSnapshot(json, policy),
            execution_snapshot: jsonSnapshot(json, { claims: tokenService.publicClaims(issued.claims) }),
            started_at: startedAt,
            updated_at: startedAt,
          });
          await audit(actor, "ai.capability_invocation_started", "ai_capability_invocation", invocationId, null, {
            capabilityId: manifest.id,
            capabilityVersion: manifest.version,
            policy,
            projectId: input.projectId,
          }, ip, { scopeType: "project", projectId: input.projectId });
          executionStarted = true;
          return issued.token;
        })();
        return beginExecutionTask;
      };

      // Live dsh session events stream through the injected in-process bus
      // (no-op when absent); a publishing failure must never fail the run.
      const publishAgentEvent = typeof agentEventBus?.publish === "function"
        ? (event) => {
            try {
              agentEventBus.publish({ event, invocationId, projectId: input.projectId, userId: actor.id });
            } catch {
              // Streaming is best-effort observability.
            }
          }
        : undefined;

      const completed = await adapter.invoke({
        beginExecution,
        input,
        invocationId,
        manifest,
        onEvent: publishAgentEvent,
      });
      if (!executionStarted) {
        throw capabilityError("AI_CAPABILITY_EXECUTION_NOT_STARTED", "AI capability adapter did not enter the scoped execution path.", 500);
      }
      const safeCompleted = redactExecutionToken(completed, executionToken);
      const result = registry.validateInvocationOutput(manifest.id, safeCompleted.result);
      const events = Array.isArray(safeCompleted.events) ? safeCompleted.events : [];
      const completedAt = now();
      invocation = await repository.update(invocationId, {
        status: "completed",
        execution_snapshot: jsonSnapshot(json, safeCompleted.execution),
        result_snapshot: jsonSnapshot(json, result),
        harness_events: jsonSnapshot(json, events),
        completed_at: completedAt,
        updated_at: completedAt,
      });
      try {
        await audit(actor, "ai.capability_invocation_completed", "ai_capability_invocation", invocationId, null, {
          capabilityId: manifest.id,
          capabilityVersion: manifest.version,
          generatedBy: result.generatedBy,
          modelFallback: result.modelFallback,
          projectId: input.projectId,
          runtimeEvents: events.map((item) => item.type),
        }, ip, { scopeType: "project", projectId: input.projectId });
      } catch (auditError) {
        const auditEvent = completionAuditFailureEvent(now, auditError, executionToken);
        const execution = safeCompleted.execution && typeof safeCompleted.execution === "object" && !Array.isArray(safeCompleted.execution)
          ? { ...safeCompleted.execution, audit: { completion: "failed", errorCode: auditEvent.detail.code } }
          : { audit: { completion: "failed", errorCode: auditEvent.detail.code } };
        try {
          invocation = await repository.update(invocationId, {
            execution_snapshot: jsonSnapshot(json, redactExecutionToken(execution, executionToken)),
            harness_events: jsonSnapshot(json, [...events, auditEvent]),
            updated_at: now(),
          });
        } catch {
          // Keep the completed record authoritative even when the compensation
          // evidence cannot be persisted after an audit outage.
        }
        logger?.warn?.("AI capability completion audit write failed:", auditEvent.detail.code);
      }
      if (tokenUsage && typeof tokenUsage.record === "function") {
        try {
          const usage = extractTokenUsage(events);
          await tokenUsage.record({
            id: `AITU-${crypto.randomUUID()}`,
            invocation_id: invocationId,
            job_id: null,
            capability_id: manifest.id,
            capability_version: manifest.version,
            project_id: input.projectId,
            actor_id: actor.id,
            model: provider.model || null,
            wire_api: provider.wireApi || null,
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            total_tokens: usage.totalTokens,
            created_at: completedAt,
          });
        } catch (usageError) {
          // Metering is observability: a failed usage write must never turn a
          // completed invocation into a failed request.
          logger?.warn?.("AI capability token usage write failed:", usageError?.code || usageError?.message || usageError);
        }
      }
      return publicInvocation(invocation, parse);
    } catch (error) {
      const failure = errorDetails(error, executionToken);
      const denied = (
        Number(error?.status) >= 400 && Number(error?.status) < 500
      ) || [
        "AI_CAPABILITY_DISABLED",
        "AI_CAPABILITY_UNAPPROVED",
      ].includes(failure.code);
      policy = { ...policy, decision: denied ? "deny" : "error", errorCode: failure.code };
      const completedAt = now();
      try {
        invocation = await repository.update(invocationId, {
          status: denied ? "denied" : "failed",
          policy_snapshot: jsonSnapshot(json, policy),
          error_code: failure.code,
          error_message: failure.message,
          completed_at: completedAt,
          updated_at: completedAt,
        });
        await audit(actor, denied ? "ai.capability_invocation_denied" : "ai.capability_invocation_failed", "ai_capability_invocation", invocationId, null, {
          capabilityId: manifest.id,
          errorCode: failure.code,
          policy,
          projectId: input.projectId,
        }, ip, { scopeType: "project", projectId: input.projectId });
      } catch {
        // Preserve the original policy/runtime failure. The initial invocation
        // record remains available whenever its insert succeeded.
      }
      throw error;
    }
  }

  return {
    getAdmin,
    invoke,
    listForUser,
    publicInvocation: (row) => publicInvocation(row, parse),
    updateControl,
  };
}

module.exports = {
  createAiCapabilityService,
  redactExecutionToken,
  publicCapability,
  publicInvocation,
};
