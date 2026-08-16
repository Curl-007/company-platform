import { defineTool } from "@deepseek-ai/dsh-tools";
import executionCapabilities from "../../src/modules/ai/executionCapabilities.js";
import uiDirectives from "../../src/modules/ai/uiDirectives.js";

export const name = "company-execution-tool";
export const inject = ["systemPrompt", "tools"];

const DOMAIN_ROUTE = "/v1/execution";
const SNAPSHOT_ROUTE = "/v1/project-snapshot";
const MAX_PROJECT_ID_LENGTH = 128;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_REMINDER_MESSAGE_LENGTH = 500;
const REMINDER_MIN_LEAD_MS = 60_000;
const REMINDER_MAX_LEAD_MS = 180 * 24 * 60 * 60 * 1000;
const PRIORITIES = Object.freeze(["high", "medium", "low"]);

// ui_control action vocabulary: each action maps onto exactly one whitelisted
// UI directive kind (validated through the shared server-side whitelist, so a
// bad action or value never leaves the runtime).
const UI_CONTROL_CAPABILITY_ID = "ui-control";
const UI_CONTROL_CAPABILITY_VERSION = "1.0.0";

// browser_control action vocabulary: open/text/screenshot/click/type/press.
// The gateway re-validates every field and audits the action before it runs;
// local validation here only keeps malformed input inside the runtime.
const BROWSER_CAPABILITY_ID = "browser-control";
const BROWSER_CAPABILITY_VERSION = "1.0.0";
const BROWSER_ACTIONS = Object.freeze(["open", "text", "screenshot", "click", "type", "press"]);
const UI_CONTROL_ACTIONS = Object.freeze({
  setTheme: (value) => ({ kind: "theme", mode: value }),
  setFontSize: (value) => ({ kind: "fontSize", value: readUiControlInteger("setFontSize", "value", value) }),
  setFontFamily: (value) => ({ kind: "fontFamily", value }),
  setDensity: (value) => ({ kind: "density", value }),
  setAccentColor: (value) => ({ kind: "accentColor", value }),
  setContentPadding: (value) => ({ kind: "contentPadding", value: readUiControlInteger("setContentPadding", "value", value) }),
  setReduceMotion: (value) => ({ kind: "reduceMotion", value: readUiControlBoolean("setReduceMotion", "value", value) }),
  openAiSidebar: (value) => ({ kind: "openAiSidebar", open: readUiControlBoolean("openAiSidebar", "value", value) }),
  navigate: (value) => ({ kind: "navigate", page: value }),
});

function readUiControlInteger(toolName, field, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw invalidInput(toolName, field, "must be an integer.");
  return parsed;
}

function readUiControlBoolean(toolName, field, value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text !== "true" && text !== "false") throw invalidInput(toolName, field, "must be \"true\" or \"false\".");
  return text === "true";
}

function invalidInput(toolName, field, reason) {
  const error = new Error(`${toolName}: ${field} ${reason}`);
  error.code = "AI_EXECUTION_TOOL_INVALID_INPUT";
  return error;
}

function readRequiredString(toolName, args, field, maxLength) {
  const value = args[field];
  if (typeof value !== "string" || !value.trim()) throw invalidInput(toolName, field, "is required.");
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw invalidInput(toolName, field, `must not exceed ${maxLength} characters.`);
  return trimmed;
}

function readOptionalString(toolName, args, field, maxLength) {
  if (args[field] === undefined || args[field] === null) return "";
  if (typeof args[field] !== "string") throw invalidInput(toolName, field, "must be a string.");
  const trimmed = args[field].trim();
  if (trimmed.length > maxLength) throw invalidInput(toolName, field, `must not exceed ${maxLength} characters.`);
  return trimmed;
}

function readOptionalPriority(toolName, args) {
  const value = args.priority;
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !PRIORITIES.includes(value)) {
    throw invalidInput(toolName, "priority", `must be one of: ${PRIORITIES.join(", ")}.`);
  }
  return value;
}

function readOptionalHours(toolName, args) {
  const value = args.estimatedHours;
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    throw invalidInput(toolName, "estimatedHours", "must be a non-negative number.");
  }
  return parsed;
}

// remindAt must be a future ISO 8601 timestamp: at least one minute ahead (the
// platform scheduler rejects anything closer) and at most 180 days ahead.
function readRequiredRemindAt(toolName, args) {
  const value = args.remindAt;
  if (typeof value !== "string" || !value.trim()) throw invalidInput(toolName, "remindAt", "is required.");
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) throw invalidInput(toolName, "remindAt", "must be an ISO 8601 timestamp.");
  const nowMs = Date.now();
  if (parsed < nowMs + REMINDER_MIN_LEAD_MS) {
    throw invalidInput(toolName, "remindAt", "must be at least 60 seconds in the future.");
  }
  if (parsed > nowMs + REMINDER_MAX_LEAD_MS) {
    throw invalidInput(toolName, "remindAt", "must be within the next 180 days.");
  }
  return new Date(parsed).toISOString();
}

// dsh tool parameter declarations must be required; optional arguments are
// documented in the description and accepted defensively by execute().
const stringParameter = (description) => ({ type: "string", required: true, description });
// Optional string parameter: dsh-tools marks a property required only when its
// own `required: true` flag is set, so omitting it keeps the field optional.
const optionalStringParameter = (description) => ({ type: "string", description });

// Every domain tool is bound to one registry capability (exact id + version).
// The gateway is the adjudication point: it re-checks the scoped token, the
// registry-declared permission, and the invocation project on every call.
const DOMAIN_TOOLS = [
  {
    name: "requirements_list",
    capabilityId: "requirements-list",
    capabilityVersion: "1.0.0",
    description: "List the requirements of the one project assigned to this invocation as compact summaries.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
    },
    normalize: (args) => ({ projectId: readRequiredString("requirements_list", args, "projectId", MAX_PROJECT_ID_LENGTH) }),
  },
  {
    name: "requirement_get",
    capabilityId: "requirement-get",
    capabilityVersion: "1.0.0",
    description: "Read one requirement of the invocation project by identifier.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
      requirementId: stringParameter("The requirement identifier to read."),
    },
    normalize: (args) => ({
      projectId: readRequiredString("requirement_get", args, "projectId", MAX_PROJECT_ID_LENGTH),
      requirementId: readRequiredString("requirement_get", args, "requirementId", MAX_ID_LENGTH),
    }),
  },
  {
    name: "tasks_list",
    capabilityId: "tasks-list",
    capabilityVersion: "1.0.0",
    description: "List the tasks of the one project assigned to this invocation as compact summaries.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
    },
    normalize: (args) => ({ projectId: readRequiredString("tasks_list", args, "projectId", MAX_PROJECT_ID_LENGTH) }),
  },
  {
    name: "defects_list",
    capabilityId: "defects-list",
    capabilityVersion: "1.0.0",
    description: "List the defects of the one project assigned to this invocation as compact summaries.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
    },
    normalize: (args) => ({ projectId: readRequiredString("defects_list", args, "projectId", MAX_PROJECT_ID_LENGTH) }),
  },
  {
    name: "requirement_create",
    capabilityId: "requirement-create",
    capabilityVersion: "1.0.0",
    description: "Create one draft requirement in the invocation project. Optional arguments: description (max 4000 characters) and priority (high, medium, low; defaults to medium). Use only when the invocation explicitly authorizes creation.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
      title: stringParameter("The requirement title (at most 200 characters)."),
    },
    normalize: (args) => {
      const normalized = {
        projectId: readRequiredString("requirement_create", args, "projectId", MAX_PROJECT_ID_LENGTH),
        title: readRequiredString("requirement_create", args, "title", MAX_TITLE_LENGTH),
        description: readOptionalString("requirement_create", args, "description", MAX_DESCRIPTION_LENGTH),
      };
      const priority = readOptionalPriority("requirement_create", args);
      if (priority) normalized.priority = priority;
      return normalized;
    },
  },
  {
    name: "task_create",
    capabilityId: "task-create",
    capabilityVersion: "1.0.0",
    description: "Create one task linked to a requirement of the invocation project. Optional argument: estimatedHours (non-negative number). Use only when the invocation explicitly authorizes creation.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
      requirementId: stringParameter("The requirement the new task belongs to."),
      title: stringParameter("The task title (at most 200 characters)."),
    },
    normalize: (args) => {
      const normalized = {
        projectId: readRequiredString("task_create", args, "projectId", MAX_PROJECT_ID_LENGTH),
        requirementId: readRequiredString("task_create", args, "requirementId", MAX_ID_LENGTH),
        title: readRequiredString("task_create", args, "title", MAX_TITLE_LENGTH),
      };
      const estimatedHours = readOptionalHours("task_create", args);
      if (estimatedHours) normalized.estimatedHours = estimatedHours;
      return normalized;
    },
  },
  {
    name: "reminders_list",
    capabilityId: "reminders-list",
    capabilityVersion: "1.0.0",
    description: "List the pending future reminders of the one project assigned to this invocation.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
    },
    normalize: (args) => ({
      projectId: readRequiredString("reminders_list", args, "projectId", MAX_PROJECT_ID_LENGTH),
    }),
  },
  {
    name: "reminder_create",
    capabilityId: "reminder-create",
    capabilityVersion: "1.0.0",
    description: "Schedule one reminder for the invocation project. The platform delivers it when it is due; no live agent is kept running. Optional argument: invocationId (the current invocation identifier).",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
      message: stringParameter("The reminder message (at most 500 characters)."),
      remindAt: stringParameter("When to deliver the reminder: an ISO 8601 timestamp at least 60 seconds and at most 180 days in the future."),
    },
    normalize: (args) => {
      const normalized = {
        projectId: readRequiredString("reminder_create", args, "projectId", MAX_PROJECT_ID_LENGTH),
        message: readRequiredString("reminder_create", args, "message", MAX_REMINDER_MESSAGE_LENGTH),
        remindAt: readRequiredRemindAt("reminder_create", args),
      };
      const invocationId = readOptionalString("reminder_create", args, "invocationId", MAX_ID_LENGTH);
      if (invocationId) normalized.invocationId = invocationId;
      return normalized;
    },
  },
];

function readRuntimeConfig() {
  const token = String(process.env.DSH_EXECUTION_TOKEN || "").trim();
  const gatewayBaseUrl = String(process.env.DSH_EXECUTION_GATEWAY_URL || "").trim();
  const projectId = String(process.env.DSH_EXECUTION_PROJECT_ID || "").trim();
  const capabilityId = String(process.env.DSH_EXECUTION_CAPABILITY_ID || "").trim();
  const capabilityVersion = String(process.env.DSH_EXECUTION_CAPABILITY_VERSION || "").trim();
  const configured = [token, gatewayBaseUrl, projectId, capabilityId, capabilityVersion].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 5) throw new Error("company-execution-tool: incomplete execution gateway environment");
  if (!executionCapabilities.findExecutionCapability(capabilityId, capabilityVersion)) {
    throw new Error("company-execution-tool: unsupported company capability");
  }
  if (projectId.length > MAX_PROJECT_ID_LENGTH) throw new Error("company-execution-tool: invalid project scope");
  let baseUrl;
  try {
    baseUrl = new URL(gatewayBaseUrl);
  } catch {
    throw new Error("company-execution-tool: invalid execution gateway URL");
  }
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("company-execution-tool: execution gateway must be an unauthenticated IPv4 loopback URL");
  }
  return {
    baseUrl,
    capabilityId,
    projectId,
    token,
  };
}

async function postExecution(runtime, route, body, signal) {
  const response = await fetch(new URL(route, runtime.baseUrl), {
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
    throw new Error("company execution gateway returned invalid JSON");
  }
  if (!response.ok) throw new Error(payload?.error?.message || "company execution gateway rejected the request");
  return payload;
}

async function callSnapshotGateway(runtime, args, signal) {
  if (args.projectId !== runtime.projectId) throw new Error("project_snapshot is restricted to the invocation project");
  const payload = await postExecution(runtime, SNAPSHOT_ROUTE, { projectId: args.projectId }, signal);
  const snapshot = payload?.data?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("company execution gateway returned an invalid project snapshot");
  }
  return snapshot;
}

async function callDomainGateway(runtime, tool, args, signal) {
  // Validate and clamp every argument locally: invalid input never leaves the
  // runtime, and the invocation project is enforced before any I/O.
  const normalized = tool.normalize(args);
  if (normalized.projectId !== runtime.projectId) {
    throw new Error(`${tool.name} is restricted to the invocation project`);
  }
  const payload = await postExecution(runtime, DOMAIN_ROUTE, {
    capabilityId: tool.capabilityId,
    capabilityVersion: tool.capabilityVersion,
    ...normalized,
  }, signal);
  const result = payload?.data?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`company execution gateway returned an invalid ${tool.name} result`);
  }
  return result;
}

// ui_control drives the invoking user's live frontend through whitelisted UI
// directives. It is a non-project capability: the gateway resolves the target
// user from the scoped token itself, so no projectId is sent or required.
async function callUiControlGateway(runtime, args, signal) {
  const action = readRequiredString("ui_control", args, "action", 64);
  const builder = UI_CONTROL_ACTIONS[action];
  if (!builder) {
    throw invalidInput("ui_control", "action", `must be one of: ${Object.keys(UI_CONTROL_ACTIONS).join(", ")}.`);
  }
  const value = readRequiredString("ui_control", args, "value", 240);
  const directive = uiDirectives.parseUiDirective(builder(value));
  if (!directive) {
    throw invalidInput("ui_control", "value", "is not valid for the requested action.");
  }
  const payload = await postExecution(runtime, DOMAIN_ROUTE, {
    capabilityId: UI_CONTROL_CAPABILITY_ID,
    capabilityVersion: UI_CONTROL_CAPABILITY_VERSION,
    directive,
  }, signal);
  const result = payload?.data?.result;
  if (!result || typeof result !== "object" || Array.isArray(result) || result.ok !== true) {
    throw new Error("company execution gateway returned an invalid ui_control result");
  }
  return result;
}

// browser_control drives the platform's headless browser service. Like
// ui_control it is a non-project capability: no projectId is sent, the
// gateway audits the action first, and the URL policy (public web +
// localhost/allowlist) applies on open.
async function callBrowserControlGateway(runtime, args, signal) {
  const action = readRequiredString("browser_control", args, "action", 16).toLowerCase();
  if (!BROWSER_ACTIONS.includes(action)) {
    throw invalidInput("browser_control", "action", `must be one of: ${BROWSER_ACTIONS.join(", ")}.`);
  }
  const normalized = { action };
  if (action === "open") normalized.url = readRequiredString("browser_control", args, "url", 2048);
  if (action === "click" || action === "type" || action === "press") {
    normalized.selector = readRequiredString("browser_control", args, "selector", 256);
  }
  if (action === "type") normalized.text = readRequiredString("browser_control", args, "text", 2000);
  if (action === "press") normalized.key = readRequiredString("browser_control", args, "key", 32);
  const waitMs = readOptionalString("browser_control", args, "waitMs", 6);
  if (waitMs) normalized.waitMs = waitMs;
  const payload = await postExecution(runtime, DOMAIN_ROUTE, {
    capabilityId: BROWSER_CAPABILITY_ID,
    capabilityVersion: BROWSER_CAPABILITY_VERSION,
    ...normalized,
  }, signal);
  const result = payload?.data?.result;
  if (!result || typeof result !== "object" || Array.isArray(result) || result.ok !== true) {
    throw new Error("company execution gateway returned an invalid browser_control result");
  }
  return result;
}

const jsonOutput = () => ({
  schema: { type: "object", additionalProperties: true },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
});

export function apply(ctx) {
  const runtime = readRuntimeConfig();
  if (!runtime) return;
  // Ordinary assistant sessions register the full platform-operation tool
  // surface in company-platform-tool.mjs. Keep capability invocations bound
  // to their older, deliberately narrow domain tools.
  if (runtime.capabilityId === "platform-assistant") return;
  ctx.systemPrompt.section({
    name: "company:execution-policy",
    order: 10,
    text: "This runtime is bound to exactly one authorized invocation project. Every company tool call must use the supplied project reference; never use or infer any other project identifier. Read tools return compact, already-authorized summaries. Write tools (requirement_create, task_create, reminder_create) create auditable records under the invoking user and may only be used when the invocation explicitly authorizes creation. Reminders are delivered by the platform scheduler when due. ui_control adjusts the invoking user's own live interface (theme, fonts, density, navigation) and is limited to the whitelisted actions; it never touches project data. browser_control drives a headless browser limited to public web and allowlisted hosts; every action is audited by the platform before it runs. The skill tool lists company delivery-methodology skills only (checklists and analysis guides); it has no executable content. No shell, filesystem access, job, goal, subagent, or arbitrary code execution capability exists.",
  });
  ctx.tools.register(defineTool({
    name: "project_snapshot",
    description: "Read the compact, already-authorized snapshot for the one project assigned to this invocation.",
    parameters: {
      projectId: stringParameter("The opaque project identifier supplied in the invocation request."),
    },
    output: jsonOutput(),
    async execute(args, exec) {
      return callSnapshotGateway(runtime, args, exec.signal);
    },
    isConcurrencySafe: () => false,
  }));
  for (const tool of DOMAIN_TOOLS) {
    const capability = executionCapabilities.findExecutionCapability(tool.capabilityId, tool.capabilityVersion);
    if (!capability) throw new Error(`company-execution-tool: unsupported company capability ${tool.capabilityId}`);
    ctx.tools.register(defineTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: jsonOutput(),
      async execute(args, exec) {
        return callDomainGateway(runtime, tool, args, exec.signal);
      },
      isConcurrencySafe: () => false,
    }));
  }
  ctx.tools.register(defineTool({
    name: "ui_control",
    description: "Adjust the invoking user's live platform interface. Actions: setTheme (dark|light), setFontSize (13-18), setFontFamily (system|sans|noto|misans|puhui), setDensity (compact|comfortable), setAccentColor (#rrggbb), setContentPadding (0-240), setReduceMotion (true|false), openAiSidebar (true|false), navigate (platform page key). Use only when the user asked for an interface change.",
    parameters: {
      action: stringParameter("The interface action to perform (one of setTheme, setFontSize, setFontFamily, setDensity, setAccentColor, setContentPadding, setReduceMotion, openAiSidebar, navigate)."),
      value: stringParameter("The action's argument, spelled as a string (for example \"dark\", \"15\", \"true\", or a page key)."),
    },
    output: jsonOutput(),
    async execute(args, exec) {
      return callUiControlGateway(runtime, args, exec.signal);
    },
    isConcurrencySafe: () => false,
  }));
  ctx.tools.register(defineTool({
    name: "browser_control",
    description: "Drive the platform's headless browser. Actions: open (navigate to an http/https URL on the public web or an allowlisted host; returns title, masked page text excerpt and a screenshot), text (extract the current page's masked text), screenshot (capture the current page), click (click an element by CSS selector), type (fill an input by selector), press (press a key on an element, e.g. Enter to submit a form). Use only when the user asks to view or operate a website.",
    parameters: {
      action: stringParameter("The browser action to perform (one of open, text, screenshot, click, type, press)."),
      url: optionalStringParameter("Required for open: the http/https URL to navigate to."),
      selector: optionalStringParameter("Required for click/type/press: a CSS selector for the target element."),
      text: optionalStringParameter("Required for type: the text to enter into the field."),
      key: optionalStringParameter("Required for press: the keyboard key to press (e.g. Enter, Escape, Tab)."),
      waitMs: optionalStringParameter("Optional: extra wait in milliseconds after navigation (bounded)."),
    },
    output: jsonOutput(),
    async execute(args, exec) {
      return callBrowserControlGateway(runtime, args, exec.signal);
    },
    isConcurrencySafe: () => false,
  }));
}
