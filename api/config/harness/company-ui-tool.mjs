import { defineTool } from "@deepseek-ai/dsh-tools";
import executionCapabilities from "../../src/modules/ai/executionCapabilities.js";
import platformOperations from "../../src/modules/ai/platformOperationRegistry.js";
import uiDirectives from "../../src/modules/ai/uiDirectives.js";
import uiSurfaces from "../../src/modules/ai/uiSurfaceRegistry.js";

export const name = "company-ui-tool";
export const inject = ["systemPrompt", "tools"];

const CAPABILITY_ID = "platform-assistant";
const CAPABILITY_VERSION = "1.0.0";
const EXECUTION_ROUTE = "/v1/execution";

function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readRuntimeConfig() {
  const token = String(process.env.DSH_EXECUTION_TOKEN || "").trim();
  const gatewayBaseUrl = String(process.env.DSH_EXECUTION_GATEWAY_URL || "").trim();
  const projectId = String(process.env.DSH_EXECUTION_PROJECT_ID || "").trim();
  const capabilityId = String(process.env.DSH_EXECUTION_CAPABILITY_ID || "").trim();
  const capabilityVersion = String(process.env.DSH_EXECUTION_CAPABILITY_VERSION || "").trim();
  const configured = [token, gatewayBaseUrl, projectId, capabilityId, capabilityVersion].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 5) throw toolError("AI_UI_TOOL_ENV_INVALID", "company-ui-tool: incomplete execution gateway environment");
  if (!executionCapabilities.findExecutionCapability(capabilityId, capabilityVersion)) {
    throw toolError("AI_UI_TOOL_ENV_INVALID", "company-ui-tool: unsupported company capability");
  }
  if (capabilityId !== CAPABILITY_ID || capabilityVersion !== CAPABILITY_VERSION) return null;
  let baseUrl;
  try {
    baseUrl = new URL(gatewayBaseUrl);
  } catch {
    throw toolError("AI_UI_TOOL_ENV_INVALID", "company-ui-tool: invalid execution gateway URL");
  }
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw toolError("AI_UI_TOOL_ENV_INVALID", "company-ui-tool: execution gateway must use an unauthenticated IPv4 loopback URL");
  }
  return { baseUrl, token };
}

function jsonOutput() {
  return {
    schema: { type: "object", additionalProperties: true },
    render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
  };
}

const requiredString = (description) => ({ type: "string", required: true, description });
const requiredObject = (description) => ({ type: "object", required: true, additionalProperties: true, description });
const requiredStringArray = (description) => ({
  type: "array",
  required: true,
  items: { type: "string" },
  description,
});

async function emit(runtime, candidate, signal) {
  const directive = uiDirectives.assertUiDirective(candidate);
  const response = await fetch(new URL(EXECUTION_ROUTE, runtime.baseUrl), {
    body: JSON.stringify({
      capabilityId: CAPABILITY_ID,
      capabilityVersion: CAPABILITY_VERSION,
      directive,
    }),
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
    throw toolError("AI_UI_TOOL_GATEWAY_INVALID", "UI execution gateway returned invalid JSON.");
  }
  if (!response.ok) {
    throw toolError(
      String(payload?.error?.code || "AI_UI_TOOL_GATEWAY_REJECTED"),
      String(payload?.error?.message || "UI execution gateway rejected the request."),
    );
  }
  const result = payload?.data?.result;
  if (!result || typeof result !== "object" || Array.isArray(result) || result.ok !== true) {
    throw toolError("AI_UI_TOOL_GATEWAY_INVALID", "UI execution gateway returned an invalid result.");
  }
  return result;
}

function register(ctx, definition) {
  ctx.tools.register(defineTool({
    ...definition,
    output: jsonOutput(),
    isConcurrencySafe: () => false,
  }));
}

export function apply(ctx) {
  const runtime = readRuntimeConfig();
  if (!runtime) return;

  ctx.systemPrompt.section({
    name: "company:ui-tools",
    order: 13,
    text: "The company UI plugin manages the current user's frontend through a closed declarative schema. Start with company_ui_catalog. Existing pages, reversible layout/style changes, and declarative views are supported. Never request or generate HTML, JavaScript, CSS source, arbitrary URLs, selectors, or executable code. Use company platform tools to read or change business data; UI tools only present and arrange it.",
  });

  register(ctx, {
    name: "company_ui_catalog",
    description: "List every registered frontend page/detail surface, supported declarative block type, UI operation, safety boundary, and the business API domains available through company_platform_catalog.",
    parameters: {},
    async execute() {
      return {
        ...uiSurfaces.publicUiCatalog(),
        platformDomains: platformOperations.listPlatformDomains().map((domain) => ({
          id: domain.id,
          operationCount: domain.operations.length,
          tool: `company_${domain.id.replace(/-/g, "_")}`,
        })),
      };
    },
  });

  register(ctx, {
    name: "company_ui_control",
    description: "Apply one existing whitelisted UI directive (theme, fontSize, fontFamily, density, accentColor, contentPadding, reduceMotion, navigate, or openAiSidebar). navigate may include a bounded platform entity id in focus to open an existing detail route; arbitrary URLs remain forbidden.",
    parameters: { directive: requiredObject("An exact whitelisted UI directive from company_ui_catalog.") },
    async execute(args, exec) {
      return emit(runtime, args.directive, exec.signal);
    },
  });

  register(ctx, {
    name: "company_ui_layout",
    description: "Set the order of registered blocks on a frontend detail surface. The order is persisted by the current user's browser and is also editable by drag and drop.",
    parameters: {
      surface: requiredString("The registered detail surface id, for example projects.detail."),
      order: requiredStringArray("Unique registered block ids in the desired visual order."),
    },
    async execute(args, exec) {
      return emit(runtime, { kind: "layout", surface: args.surface, order: args.order }, exec.signal);
    },
  });

  register(ctx, {
    name: "company_ui_style",
    description: "Apply bounded design tokens to a registered surface. Supported style keys: variant (default|quiet|contrast), columns (1-3), and gap (8-32). Missing keys use safe defaults.",
    parameters: {
      surface: requiredString("The registered page/detail surface id."),
      style: requiredObject("One or more supported design tokens; arbitrary CSS is rejected."),
    },
    async execute(args, exec) {
      return emit(runtime, { kind: "surfaceStyle", surface: args.surface, style: args.style }, exec.signal);
    },
  });

  register(ctx, {
    name: "company_ui_view_upsert",
    description: "Create or update a persistent declarative view for the current user. Blocks are limited to stat, text, list, table, progress, notice, and internal links. No HTML, scripts, CSS, or external URLs are accepted.",
    parameters: { view: requiredObject("A closed declarative view spec from company_ui_catalog.") },
    async execute(args, exec) {
      return emit(runtime, { kind: "viewUpsert", view: args.view }, exec.signal);
    },
  });

  register(ctx, {
    name: "company_ui_view_remove",
    description: "Remove one declarative view belonging to the current user.",
    parameters: { viewId: requiredString("The lower-case declarative view id.") },
    async execute(args, exec) {
      return emit(runtime, { kind: "viewRemove", viewId: args.viewId }, exec.signal);
    },
  });

  register(ctx, {
    name: "company_ui_view_open",
    description: "Open one existing declarative view in the current user's frontend.",
    parameters: { viewId: requiredString("The lower-case declarative view id.") },
    async execute(args, exec) {
      return emit(runtime, { kind: "viewOpen", viewId: args.viewId }, exec.signal);
    },
  });
}
