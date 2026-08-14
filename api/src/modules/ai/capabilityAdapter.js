const { buildSnapshotSummary } = require("./executionGateway");

function event(now, type, detail = {}) {
  return { at: now(), detail, type };
}

function boundedModelText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 4000) : null;
}

function projectSnapshotPrompt(projectId) {
  return [
    "This is a tightly scoped read-only company capability invocation.",
    `Use the project_snapshot tool exactly once with {"projectId":${JSON.stringify(projectId)}}.`,
    "Do not call any other tool, do not request any other project, and do not propose or perform writes.",
    "After the tool result, give a concise Chinese project status summary, key delivery risks, and next review points.",
  ].join("\n");
}

function createHarnessCapabilityAdapter({ callModel, executionGateway, now = () => new Date().toISOString() }) {
  if (!executionGateway || typeof executionGateway.execute !== "function" || typeof executionGateway.getCaptured !== "function" || typeof executionGateway.start !== "function") {
    throw new Error("AI capability execution gateway is required.");
  }

  async function invokeProjectSnapshot({ beginExecution, invocationId, manifest, input }) {
    if (typeof beginExecution !== "function") {
      const error = new Error("AI capability execution must be started by the control plane.");
      error.code = "AI_CAPABILITY_EXECUTION_NOT_STARTED";
      error.status = 500;
      throw error;
    }
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
        modelText = boundedModelText(await callModel(projectSnapshotPrompt(input.projectId), {
          execution: {
            capabilityId: manifest.id,
            capabilityVersion: manifest.version,
            gatewayBaseUrl: gatewayUrl,
            issueToken: beginExecution,
            projectId: input.projectId,
          },
          maxTokens: 1000,
          system: "You are the company-managed project snapshot adapter. Use only the declared read-only project_snapshot tool and never disclose execution internals.",
          temperature: 0.1,
          timeoutMs: 30_000,
        }));
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

  async function invoke(input) {
    if (input?.manifest?.id !== "project-snapshot") {
      const error = new Error("Unsupported company AI capability adapter.");
      error.code = "AI_CAPABILITY_ADAPTER_NOT_FOUND";
      error.status = 500;
      throw error;
    }
    return invokeProjectSnapshot(input);
  }

  return { invoke };
}

module.exports = {
  createHarnessCapabilityAdapter,
  projectSnapshotPrompt,
};
