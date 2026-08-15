const { buildSnapshotSummary } = require("./executionGateway");
const { createCapabilityRegistry } = require("./capabilityRegistry");

// Multi-tool capability reasoning (read snapshot -> analyze -> create records
// when the invocation authorizes it) needs a longer budget than the shared
// 30s harness inference default. This adapter-only default can be tuned per
// deployment through AI_CAPABILITY_TIMEOUT_MS; the model client and harness
// runtime keep their own generic defaults untouched.
const DEFAULT_CAPABILITY_TIMEOUT_MS = 120_000;
let invalidTimeoutWarned = false;

function resolveCapabilityTimeoutMs(env = process.env, logger = console) {
  const raw = String(env.AI_CAPABILITY_TIMEOUT_MS || "").trim();
  if (!raw) return DEFAULT_CAPABILITY_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    // Warn once per process: every invocation would otherwise repeat the same
    // configuration complaint in the logs.
    if (!invalidTimeoutWarned) {
      invalidTimeoutWarned = true;
      logger?.warn?.(`AI_CAPABILITY_TIMEOUT_MS is invalid ("${raw}"); using the default ${DEFAULT_CAPABILITY_TIMEOUT_MS}ms.`);
    }
    return DEFAULT_CAPABILITY_TIMEOUT_MS;
  }
  return parsed;
}

function event(now, type, detail = {}) {
  return { at: now(), detail, type };
}

function boundedModelText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 4000) : null;
}

// Tool catalog for the invocation scope: approved manifests whose scopes
// overlap the invoked capability's scopes. This is guidance only — the
// control-plane kill switch, per-permission gates, scoped tokens, and project
// scope are all re-checked per call by the invocation service and the
// execution gateway, so advertising a tool never grants it.
function capabilityToolCatalogLines(manifest, registry) {
  return registry.list()
    .filter((candidate) => candidate.status === "approved")
    .filter((candidate) => candidate.scopes.some((scope) => manifest.scopes.includes(scope)))
    .map((candidate) => `- ${candidate.runtime.toolName}: ${candidate.description || candidate.id} (capability ${candidate.id})`);
}

function capabilityPrompt(manifest, input, toolCatalogLines) {
  return [
    "This is a tightly scoped company capability invocation.",
    `Invoked capability: ${manifest.id} (${manifest.version}); primary tool: ${manifest.runtime.toolName}.`,
    `Every company tool call must use the assigned project reference {"projectId":${JSON.stringify(input.projectId)}} and never use or infer any other project.`,
    "Available company tools in this invocation scope:",
    ...toolCatalogLines,
    "Work step by step: read the project snapshot first, analyze the delivery status, and only when this invocation explicitly authorizes creation use the declared write tools (requirement_create, task_create, reminder_create) to create records.",
    "Do not disclose execution internals such as tokens or gateway URLs, and do not invent tool results.",
    "After the tool results, give a concise Chinese project status summary, key delivery risks, and next review points.",
  ].join("\n");
}

function createHarnessCapabilityAdapter({
  callModel,
  env = process.env,
  executionGateway,
  logger = console,
  now = () => new Date().toISOString(),
  registry = createCapabilityRegistry(),
} = {}) {
  if (!executionGateway || typeof executionGateway.execute !== "function" || typeof executionGateway.getCaptured !== "function" || typeof executionGateway.start !== "function") {
    throw new Error("AI capability execution gateway is required.");
  }
  const timeoutMs = resolveCapabilityTimeoutMs(env, logger);

  function requireControlPlaneIssuer(beginExecution) {
    if (typeof beginExecution !== "function") {
      const error = new Error("AI capability execution must be started by the control plane.");
      error.code = "AI_CAPABILITY_EXECUTION_NOT_STARTED";
      error.status = 500;
      throw error;
    }
  }

  async function invokeProjectSnapshot({ beginExecution, invocationId, manifest, input, onEvent }) {
    requireControlPlaneIssuer(beginExecution);
    const events = [event(now, "harness.capability.started", {
      capabilityId: manifest.id,
      capabilityVersion: manifest.version,
      projectId: input.projectId,
    })];
    let modelText = null;
    let modelFallback = false;
    let gatewayUrl = null;
    try {
      gatewayUrl = await executionGateway.start();
      if (typeof callModel === "function") {
        const modelOptions = {
          execution: {
            capabilityId: manifest.id,
            capabilityVersion: manifest.version,
            gatewayBaseUrl: gatewayUrl,
            issueToken: beginExecution,
            projectId: input.projectId,
          },
          maxTokens: 1000,
          system: "You are the company-managed project snapshot adapter. Use only the declared company tools within the assigned project scope and never disclose execution internals.",
          temperature: 0.1,
          timeoutMs,
        };
        if (typeof onEvent === "function") modelOptions.onEvent = onEvent;
        modelText = boundedModelText(await callModel(capabilityPrompt(manifest, input, capabilityToolCatalogLines(manifest, registry)), modelOptions));
      }
      if (!modelText) modelFallback = true;
    } catch {
      // A provider/runtime failure does not loosen the read-only capability
      // boundary. The adapter still obtains the authorized snapshot locally.
      modelFallback = true;
      events.push(event(now, "harness.capability.model-fallback", { capabilityId: manifest.id }));
    }

    let captured = executionGateway.getCaptured(invocationId);
    const runtimeToolCaptured = Boolean(captured);
    if (!captured) {
      // This fallback receives a token only at the point it performs the
      // scoped gateway call. It never reuses a token that waited in the
      // shared Harness queue.
      captured = await executionGateway.execute({ input, source: "adapter-fallback", token: await beginExecution() });
      events.push(event(now, "execution-gateway.adapter-fallback", { projectId: input.projectId }));
      if (modelText) {
        events.push(event(now, "harness.capability.model-output-discarded", {
          capabilityId: manifest.id,
          reason: "runtime_tool_not_captured",
        }));
      }
    } else {
      events.push(event(now, "execution-gateway.runtime-tool", { projectId: input.projectId }));
    }
    // A model response is evidence-backed only when this invocation's
    // company runtime actually captured the declared tool call.
    const useModelSummary = runtimeToolCaptured && Boolean(modelText);
    const summary = useModelSummary ? modelText : buildSnapshotSummary(captured.snapshot);
    modelFallback = !useModelSummary;
    events.push(event(now, "harness.capability.completed", {
      capabilityId: manifest.id,
      generatedBy: useModelSummary ? "harness" : "platform_snapshot",
      projectId: input.projectId,
    }));
    return {
      execution: {
        claims: captured.claims,
        gateway: captured.evidence,
        gatewayBaseUrl: gatewayUrl,
      },
      events,
      result: {
        ...captured.snapshot,
        generatedBy: useModelSummary ? "harness" : "platform_snapshot",
        modelFallback,
        summary,
      },
    };
  }

  // Manifest-driven generic dispatch (BE-1 gap ①): every registry-approved
  // domain capability follows the same shape as the snapshot path — prompt from
  // the manifest, model via the shared runtime with the control-plane token
  // issuer, tool-call capture as evidence, local adjudicated fallback. The
  // invocation result is exactly the gateway's adjudicated domain result: the
  // registry's output schemas are closed objects, so adapter-computed fields
  // (summary/generatedBy/modelFallback) are only added where the manifest
  // schema itself declares them (project-snapshot today). No new contract is
  // introduced; the harness finalResponse stays observable through events.
  async function invokeDomainCapability({ beginExecution, invocationId, manifest, input, onEvent }) {
    requireControlPlaneIssuer(beginExecution);
    if (typeof executionGateway.executeDomain !== "function") {
      throw new Error("AI capability execution gateway is required.");
    }
    const events = [event(now, "harness.capability.started", {
      capabilityId: manifest.id,
      capabilityVersion: manifest.version,
      projectId: input.projectId,
    })];
    let modelText = null;
    let gatewayUrl = null;
    try {
      gatewayUrl = await executionGateway.start();
      if (typeof callModel === "function") {
        const modelOptions = {
          execution: {
            capabilityId: manifest.id,
            capabilityVersion: manifest.version,
            gatewayBaseUrl: gatewayUrl,
            issueToken: beginExecution,
            projectId: input.projectId,
          },
          maxTokens: 1000,
          system: "You are the company-managed capability adapter. Use only the declared company tools within the assigned project scope and never disclose execution internals.",
          temperature: 0.1,
          timeoutMs,
        };
        if (typeof onEvent === "function") modelOptions.onEvent = onEvent;
        modelText = boundedModelText(await callModel(capabilityPrompt(manifest, input, capabilityToolCatalogLines(manifest, registry)), modelOptions));
      }
    } catch {
      // A provider/runtime failure does not loosen the capability boundary:
      // the adapter still returns the adjudicated gateway result locally.
      modelText = null;
      events.push(event(now, "harness.capability.model-fallback", { capabilityId: manifest.id }));
    }

    let captured = executionGateway.getCaptured(invocationId);
    const runtimeToolCaptured = Boolean(captured);
    if (!captured) {
      // Same token discipline as the snapshot fallback: minted only now, never
      // reused from a queued Harness run.
      captured = await executionGateway.executeDomain({
        input: {
          capabilityId: manifest.id,
          capabilityVersion: manifest.version,
          ...input,
        },
        source: "adapter-fallback",
        token: await beginExecution(),
      });
      events.push(event(now, "execution-gateway.adapter-fallback", { projectId: input.projectId }));
      if (modelText) {
        events.push(event(now, "harness.capability.model-output-discarded", {
          capabilityId: manifest.id,
          reason: "runtime_tool_not_captured",
        }));
      }
    } else {
      events.push(event(now, "execution-gateway.runtime-tool", { projectId: input.projectId }));
    }
    const result = { ...captured.result };
    const outputProperties = manifest.outputSchema?.properties || {};
    if (outputProperties.generatedBy || outputProperties.modelFallback || outputProperties.summary) {
      // Only reachable for manifests that opt into the snapshot-style
      // reporting fields; the built-in domain schemas are closed without them.
      const useModelSummary = runtimeToolCaptured && Boolean(modelText);
      if (outputProperties.generatedBy) result.generatedBy = useModelSummary ? "harness" : "platform_gateway";
      if (outputProperties.modelFallback) result.modelFallback = !useModelSummary;
      if (outputProperties.summary && useModelSummary) result.summary = modelText;
    }
    events.push(event(now, "harness.capability.completed", {
      capabilityId: manifest.id,
      generatedBy: runtimeToolCaptured && modelText ? "harness" : "platform_gateway",
      projectId: input.projectId,
    }));
    return {
      execution: {
        claims: captured.claims,
        gateway: captured.evidence,
        gatewayBaseUrl: gatewayUrl,
      },
      events,
      result,
    };
  }

  async function invoke(input) {
    const manifest = input?.manifest;
    if (manifest?.id === "project-snapshot") {
      return invokeProjectSnapshot(input);
    }
    // Any other registry-approved manifest dispatches generically; unknown
    // manifests keep the explicit adapter error (the control plane never
    // reaches this point for them, but the adapter stays defensive).
    if (manifest && registry.get(manifest.id)) {
      return invokeDomainCapability(input);
    }
    const error = new Error("Unsupported company AI capability adapter.");
    error.code = "AI_CAPABILITY_ADAPTER_NOT_FOUND";
    error.status = 500;
    throw error;
  }

  return { invoke };
}

module.exports = {
  DEFAULT_CAPABILITY_TIMEOUT_MS,
  capabilityPrompt,
  capabilityToolCatalogLines,
  createHarnessCapabilityAdapter,
  resolveCapabilityTimeoutMs,
};
