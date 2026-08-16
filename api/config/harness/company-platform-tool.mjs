import { defineTool } from "@deepseek-ai/dsh-tools";
import executionCapabilities from "../../src/modules/ai/executionCapabilities.js";
import platformOperations from "../../src/modules/ai/platformOperationRegistry.js";

export const name = "company-platform-tool";
// Draft compositions do not include the optional approval service. The plugin
// stays inert without a platform-assistant execution context, and checks the
// service only when a write tool is actually invoked.
export const inject = ["systemPrompt", "tools"];

const PLATFORM_ASSISTANT_CAPABILITY_ID = "platform-assistant";
const PLATFORM_ASSISTANT_CAPABILITY_VERSION = "1.0.0";
const PLATFORM_OPERATION_ROUTE = "/v1/platform-operation";

function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRuntimeConfig() {
  const token = String(process.env.DSH_EXECUTION_TOKEN || "").trim();
  const gatewayBaseUrl = String(process.env.DSH_EXECUTION_GATEWAY_URL || "").trim();
  const projectId = String(process.env.DSH_EXECUTION_PROJECT_ID || "").trim();
  const capabilityId = String(process.env.DSH_EXECUTION_CAPABILITY_ID || "").trim();
  const capabilityVersion = String(process.env.DSH_EXECUTION_CAPABILITY_VERSION || "").trim();
  const configured = [token, gatewayBaseUrl, projectId, capabilityId, capabilityVersion].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 5) throw toolError("AI_PLATFORM_TOOL_ENV_INVALID", "company-platform-tool: incomplete execution gateway environment");
  if (!executionCapabilities.findExecutionCapability(capabilityId, capabilityVersion)) {
    throw toolError("AI_PLATFORM_TOOL_ENV_INVALID", "company-platform-tool: unsupported company capability");
  }
  if (capabilityId !== PLATFORM_ASSISTANT_CAPABILITY_ID || capabilityVersion !== PLATFORM_ASSISTANT_CAPABILITY_VERSION) {
    return null;
  }
  let baseUrl;
  try {
    baseUrl = new URL(gatewayBaseUrl);
  } catch {
    throw toolError("AI_PLATFORM_TOOL_ENV_INVALID", "company-platform-tool: invalid execution gateway URL");
  }
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw toolError("AI_PLATFORM_TOOL_ENV_INVALID", "company-platform-tool: execution gateway must use an unauthenticated IPv4 loopback URL");
  }
  return { baseUrl, projectId, token };
}

async function postGateway(runtime, body, signal) {
  const response = await fetch(new URL(PLATFORM_OPERATION_ROUTE, runtime.baseUrl), {
    body: JSON.stringify(body),
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
    throw toolError("AI_PLATFORM_TOOL_GATEWAY_INVALID", "Platform operation gateway returned invalid JSON.");
  }
  if (!response.ok) {
    throw toolError(
      String(payload?.error?.code || "AI_PLATFORM_TOOL_GATEWAY_REJECTED"),
      String(payload?.error?.message || "Platform operation gateway rejected the request."),
    );
  }
  const result = payload?.data?.result;
  if (!isRecord(result)) throw toolError("AI_PLATFORM_TOOL_GATEWAY_INVALID", "Platform operation gateway returned an invalid result.");
  return result;
}

function output() {
  return {
    schema: { type: "object", additionalProperties: true },
    render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
  };
}

function operationParameter(domain) {
  return {
    type: "string",
    required: true,
    enum: domain.operations.map((operation) => operation.action),
    description: `The ${domain.label} operation action. Use company_platform_catalog for the action's request shape.`,
  };
}

const requestParameter = {
  type: "object",
  required: true,
  additionalProperties: true,
  description: "An object with only optional path, query, and body objects. Supply {} when this operation has no inputs.",
};

function catalogForDomain(domainId) {
  const domain = String(domainId || "").trim();
  if (!domain) {
    return {
      domains: platformOperations.listPlatformDomains().map((item) => ({
        id: item.id,
        label: item.label,
        operationCount: item.operations.length,
        tool: `company_${item.id.replace(/-/g, "_")}`,
      })),
    };
  }
  const selected = platformOperations.listPlatformDomains().find((item) => item.id === domain);
  if (!selected) throw toolError("AI_PLATFORM_TOOL_UNKNOWN_DOMAIN", "Unknown company platform tool domain.");
  return {
    domain: { id: selected.id, label: selected.label },
    operations: selected.operations.map((operation) => platformOperations.publicPlatformOperation(operation)),
  };
}

function localOperation(domain, args) {
  const operation = platformOperations.findPlatformOperation(args.operation, domain.id);
  if (!operation) throw toolError("AI_PLATFORM_TOOL_UNKNOWN_OPERATION", "Operation is not registered for this company tool.");
  if (!isRecord(args.request)) {
    throw toolError("AI_PLATFORM_TOOL_INVALID_INPUT", "request must be an object.");
  }
  return operation;
}

async function requestWriteApproval(ctx, operation, exec) {
  if (!operation.write) return;
  if (!exec.agent || !ctx.approval || typeof ctx.approval.request !== "function") {
    throw toolError("AI_PLATFORM_TOOL_APPROVAL_UNAVAILABLE", "A platform write requires an active assistant session.");
  }
  const outcome = await ctx.approval.request({
    agent: exec.agent,
    callId: exec.callId,
    reason: `${operation.method} ${operation.path}`,
    signal: exec.signal,
    toolName: `company_${operation.domain.replace(/-/g, "_")}`,
  });
  if (outcome !== "allowed-once") {
    throw toolError("AI_PLATFORM_TOOL_APPROVAL_REJECTED", "The platform write was not approved.");
  }
}

export function apply(ctx) {
  const runtime = readRuntimeConfig();
  if (!runtime) return;

  ctx.systemPrompt.section({
    name: "company:platform-tools",
    order: 12,
    text: "Company platform tools are available for this assistant session. Use company_platform_catalog to discover operations and then the matching company_<domain> tool. Every request uses only {path, query, body}; never invent fields. Tool calls run under the current platform user and the original API enforces its permissions and project scope. Write operations require the user to confirm the exact action before execution. The skill tool lists company delivery-methodology skills (checklists and analysis guides) with no executable content. This session has no browser, shell, filesystem, subagent, or code execution capability. Never expose internal tokens, gateway URLs, or execution details.",
  });

  ctx.tools.register(defineTool({
    name: "company_platform_catalog",
    description: "Discover the registered company platform operation domains and exact actions. Call without domain for the domain list, or with one domain for operation paths, methods, and exact path/query/body schemas derived from OpenAPI.",
    parameters: {
      domain: {
        type: "string",
        enum: platformOperations.listPlatformDomains().map((domain) => domain.id),
        description: "Optional business domain to inspect.",
      },
    },
    output: output(),
    async execute(args) {
      return catalogForDomain(args.domain);
    },
    isConcurrencySafe: () => false,
  }));

  for (const domain of platformOperations.listPlatformDomains()) {
    const name = `company_${domain.id.replace(/-/g, "_")}`;
    ctx.tools.register(defineTool({
      name,
      description: `Run an authorized company platform operation for ${domain.label}. The operation action must be one listed for this tool; use company_platform_catalog when the request shape is unknown.`,
      parameters: {
        operation: operationParameter(domain),
        request: requestParameter,
      },
      output: output(),
      async execute(args, exec) {
        const operation = localOperation(domain, args);
        await requestWriteApproval(ctx, operation, exec);
        return postGateway(runtime, { operation: operation.action, request: args.request }, exec.signal);
      },
      isConcurrencySafe: () => false,
    }));
  }
}
