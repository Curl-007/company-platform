import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "company-execution-tool";
export const inject = ["systemPrompt", "tools"];

function readRuntimeConfig() {
  const token = String(process.env.DSH_EXECUTION_TOKEN || "").trim();
  const gatewayBaseUrl = String(process.env.DSH_EXECUTION_GATEWAY_URL || "").trim();
  const projectId = String(process.env.DSH_EXECUTION_PROJECT_ID || "").trim();
  const capabilityId = String(process.env.DSH_EXECUTION_CAPABILITY_ID || "").trim();
  const capabilityVersion = String(process.env.DSH_EXECUTION_CAPABILITY_VERSION || "").trim();
  const configured = [token, gatewayBaseUrl, projectId, capabilityId, capabilityVersion].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 5) throw new Error("company-execution-tool: incomplete execution gateway environment");
  if (capabilityId !== "project-snapshot" || !/^\d+\.\d+\.\d+$/.test(capabilityVersion)) {
    throw new Error("company-execution-tool: unsupported company capability");
  }
  if (projectId.length > 128) throw new Error("company-execution-tool: invalid project scope");
  let endpoint;
  try {
    endpoint = new URL(gatewayBaseUrl);
  } catch {
    throw new Error("company-execution-tool: invalid execution gateway URL");
  }
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("company-execution-tool: execution gateway must be an unauthenticated IPv4 loopback URL");
  }
  return {
    capabilityId,
    endpoint: new URL("/v1/project-snapshot", endpoint),
    projectId,
    token,
  };
}

async function callGateway(runtime, projectId, signal) {
  if (projectId !== runtime.projectId) throw new Error("project_snapshot is restricted to the invocation project");
  const response = await fetch(runtime.endpoint, {
    body: JSON.stringify({ projectId }),
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "error",
    signal,
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("company execution gateway returned invalid JSON");
  }
  if (!response.ok) throw new Error(payload?.error?.message || "company execution gateway rejected the request");
  const snapshot = payload?.data?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("company execution gateway returned an invalid project snapshot");
  }
  return snapshot;
}

export function apply(ctx) {
  const runtime = readRuntimeConfig();
  if (!runtime) return;
  ctx.systemPrompt.section({
    name: "company:execution-policy",
    order: 10,
    text: "This runtime is limited to one authorized read-only project snapshot. Call project_snapshot exactly once with the supplied project reference. Do not use or infer any other project identifier. No write, shell, filesystem, skill, job, goal, or subagent capability exists.",
  });
  ctx.tools.register(defineTool({
    name: "project_snapshot",
    description: "Read the compact, already-authorized snapshot for the one project assigned to this invocation.",
    parameters: {
      projectId: {
        type: "string",
        required: true,
        description: "The opaque project identifier supplied in the invocation request.",
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      return callGateway(runtime, args.projectId, exec.signal);
    },
    isConcurrencySafe: () => false,
  }));
}
