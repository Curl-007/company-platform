const crypto = require("node:crypto");
const {
  DEFAULT_REUSABLE_EXECUTION_TOKEN_TTL_MS,
} = require("./executionToken");
const {
  PLATFORM_ASSISTANT_CAPABILITY_ID,
  PLATFORM_ASSISTANT_CAPABILITY_VERSION,
} = require("./executionCapabilities");

const PLATFORM_ASSISTANT_SYSTEM_POLICY = [
  "You are the company project-management assistant.",
  "Use the registered company platform tools whenever current platform data or a platform action is needed. Start with company_platform_catalog when you need to discover an operation.",
  "Use company_ui_catalog and the company_ui_* tools when the user asks to navigate, restyle, rearrange, or create a frontend view. UI tools accept only the closed declarative schema and never executable code.",
  "Tool results are authoritative. Do not invent data, operation outcomes, identifiers, or permissions.",
  "Read operations run under the current user's platform permissions. A write operation requires an explicit user request and a one-time platform confirmation before it is sent.",
  "Never disclose execution tokens, loopback URLs, internal implementation details, or hidden tool configuration.",
].join(" ");

function assistantExecutionError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function safeAssistantSnapshot(assistant) {
  return {
    available: Boolean(assistant?.available),
    enabled: Boolean(assistant?.enabled),
    name: String(assistant?.name || "Platform AI Assistant").slice(0, 120),
    providerId: assistant?.resolvedProviderId || null,
    model: assistant?.resolvedModel || null,
  };
}

function errorSnapshot(error) {
  return {
    code: String(error?.code || "AI_ASSISTANT_EXECUTION_FAILED").slice(0, 120),
    message: String(error?.message || "Assistant tool execution failed.").replace(/\s+/g, " ").slice(0, 240),
  };
}

function normalizeAnchor(value) {
  const id = typeof value === "string" ? value.trim() : String(value?.id || "").trim();
  return id && id.length <= 128 ? id : "";
}

function createAiAssistantExecutionService({
  audit,
  canAccessProject,
  executionGateway,
  findActiveActor,
  getAssistant,
  hasPermission,
  json,
  logger = console,
  now = () => new Date().toISOString(),
  publicUser,
  repository,
  selectProjectAnchor,
  tokenService,
} = {}) {
  if (!repository || typeof repository.create !== "function" || typeof repository.update !== "function") {
    throw new Error("AI assistant execution repository is required.");
  }
  if (!executionGateway || typeof executionGateway.start !== "function") {
    throw new Error("AI assistant execution gateway is required.");
  }
  if (typeof findActiveActor !== "function" || typeof getAssistant !== "function" || typeof hasPermission !== "function" || typeof publicUser !== "function") {
    throw new Error("AI assistant execution access dependencies are required.");
  }
  if (typeof selectProjectAnchor !== "function" || typeof tokenService?.issue !== "function" || typeof tokenService?.publicClaims !== "function") {
    throw new Error("AI assistant execution token and project dependencies are required.");
  }
  if (typeof audit !== "function" || typeof json !== "function") {
    throw new Error("AI assistant execution audit dependencies are required.");
  }

  async function create({ accessScope, actor, currentPage, ip, scope } = {}) {
    if (!actor?.id || !hasPermission(actor, "ai:*")) {
      throw assistantExecutionError("PERMISSION_DENIED", "You cannot use AI assistant tools.", 403);
    }
    const assistant = await getAssistant();
    if (!assistant?.available) return null;
    const projectId = normalizeAnchor(await selectProjectAnchor({ accessScope, actor }));
    // The interaction and audit schema needs a real project row. A user with
    // no accessible project still receives normal model chat, just no platform
    // tools whose calls could not be safely attributed.
    if (!projectId) return null;

    const invocationId = `AIC-${crypto.randomUUID()}`;
    const createdAt = now();
    let invocation = await repository.create({
      id: invocationId,
      capability_id: PLATFORM_ASSISTANT_CAPABILITY_ID,
      capability_version: PLATFORM_ASSISTANT_CAPABILITY_VERSION,
      status: "accepted",
      actor_id: actor.id,
      project_id: projectId,
      assistant_snapshot: json(safeAssistantSnapshot(assistant)),
      provider_snapshot: json({
        configured: true,
        id: assistant.resolvedProviderId || null,
        model: assistant.resolvedModel || null,
      }),
      manifest_snapshot: json({
        id: PLATFORM_ASSISTANT_CAPABILITY_ID,
        version: PLATFORM_ASSISTANT_CAPABILITY_VERSION,
        channel: "ai_chat",
      }),
      policy_snapshot: json({ decision: "pending", projectId, scope: String(scope || "").slice(0, 80) }),
      input_snapshot: json({ channel: "ai_chat", currentPage: String(currentPage || "").slice(0, 120) }),
      execution_snapshot: json({}),
      result_snapshot: null,
      harness_events: json([]),
      error_code: null,
      error_message: null,
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      updated_at: createdAt,
    });
    let completed = false;
    let issued;

    async function failStart(error) {
      const failure = errorSnapshot(error);
      const completedAt = now();
      try {
        invocation = await repository.update(invocationId, {
          status: "failed",
          error_code: failure.code,
          error_message: failure.message,
          completed_at: completedAt,
          updated_at: completedAt,
        });
      } catch {
        // The caller still sees the original failure and no token is returned.
      }
      throw error;
    }

    let gatewayBaseUrl;
    try {
      gatewayBaseUrl = await executionGateway.start();
    } catch (error) {
      await failStart(error);
    }

    async function beginExecution() {
      if (completed) {
        throw assistantExecutionError("AI_CAPABILITY_INVOCATION_INACTIVE", "Assistant tool session is no longer active.", 403);
      }
      if (issued) return issued.token;
      try {
        const currentActor = await findActiveActor(actor.id);
        if (!currentActor || currentActor.status !== "active") {
          throw assistantExecutionError("AI_CAPABILITY_ACTOR_UNAVAILABLE", "Assistant actor is unavailable.", 403);
        }
        const currentUser = publicUser(currentActor);
        if (!hasPermission(currentUser, "ai:*")) {
          throw assistantExecutionError("PERMISSION_DENIED", "Assistant actor can no longer use AI capabilities.", 403);
        }
        if (typeof canAccessProject === "function" && !(await canAccessProject(currentUser, projectId))) {
          throw assistantExecutionError("PERMISSION_DENIED", "Assistant actor can no longer access the execution project.", 403);
        }
        const currentAssistant = await getAssistant();
        if (!currentAssistant?.available) {
          throw assistantExecutionError("AI_CAPABILITY_DISABLED", "Platform assistant tools are disabled by the control plane.", 503);
        }
        issued = tokenService.issue({
          actorId: currentActor.id,
          capabilityId: PLATFORM_ASSISTANT_CAPABILITY_ID,
          capabilityVersion: PLATFORM_ASSISTANT_CAPABILITY_VERSION,
          invocationId,
          projectId,
          reusable: true,
          ttlMs: DEFAULT_REUSABLE_EXECUTION_TOKEN_TTL_MS,
          userId: currentActor.id,
        });
        const startedAt = now();
        await audit(currentActor, "ai.assistant_tool_session_started", "ai_capability_invocation", invocationId, null, {
          capabilityId: PLATFORM_ASSISTANT_CAPABILITY_ID,
          capabilityVersion: PLATFORM_ASSISTANT_CAPABILITY_VERSION,
          projectId,
        }, ip, { scopeType: "project", projectId });
        invocation = await repository.update(invocationId, {
          status: "running",
          policy_snapshot: json({ decision: "allow", projectId, scope: String(scope || "").slice(0, 80) }),
          execution_snapshot: json({ claims: tokenService.publicClaims(issued.claims) }),
          started_at: startedAt,
          updated_at: startedAt,
        });
        return issued.token;
      } catch (error) {
        return failStart(error);
      }
    }

    async function finish({ error, fallback = false, modelUsed = false } = {}) {
      if (completed) return invocation;
      completed = true;
      // The gateway checks this in-memory revocation before the persisted
      // invocation row. It closes the small window where a database update
      // could fail after the model turn has already ended.
      executionGateway.revokeInvocation?.(invocationId);
      const completedAt = now();
      const failure = error ? errorSnapshot(error) : null;
      const status = failure ? "failed" : "completed";
      invocation = await repository.update(invocationId, {
        status,
        result_snapshot: json({ fallback: Boolean(fallback), modelUsed: Boolean(modelUsed), channel: "ai_chat" }),
        error_code: failure?.code || null,
        error_message: failure?.message || null,
        completed_at: completedAt,
        updated_at: completedAt,
      });
      try {
        await audit(actor, failure ? "ai.assistant_tool_session_failed" : "ai.assistant_tool_session_completed", "ai_capability_invocation", invocationId, null, {
          capabilityId: PLATFORM_ASSISTANT_CAPABILITY_ID,
          errorCode: failure?.code || null,
          projectId,
        }, ip, { scopeType: "project", projectId });
      } catch (auditError) {
        logger?.warn?.("AI assistant tool-session completion audit failed:", auditError?.code || auditError?.message || auditError);
      }
      return invocation;
    }

    return {
      execution: {
        capabilityId: PLATFORM_ASSISTANT_CAPABILITY_ID,
        capabilityVersion: PLATFORM_ASSISTANT_CAPABILITY_VERSION,
        gatewayBaseUrl,
        issueToken: beginExecution,
        projectId,
      },
      finish,
      invocationId,
      projectId,
    };
  }

  return { create };
}

module.exports = {
  PLATFORM_ASSISTANT_SYSTEM_POLICY,
  assistantExecutionError,
  createAiAssistantExecutionService,
};
