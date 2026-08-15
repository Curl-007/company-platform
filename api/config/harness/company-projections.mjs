import { z } from "zod";

export const name = "company-projections";
export const inject = ["sessionProjections"];

// Company-owned session projection units. Each unit is three pure
// synchronous functions plus declarations, registered on the
// session-projection registry: the framework drives apply() over every
// committed session event, a same-reference return gates the change feed
// (Object.is), and view() produces the schema-validated wire value. Event
// payloads live under event.data (envelope: { type, seq, time, data }) —
// token accounting rides assistant/message's optional usage record, tool
// names ride tool/call, and turn outcomes ride turn/end's reason.kind.

/** How many trailing tool calls the company.tool-calls view carries. */
export const RECENT_TOOL_CALL_LIMIT = 5;

/** Provider-reported usage fields are model/tool JSON boundaries; guard them like the window fold does. */
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const tokenUsageSchema = z.object({
  requests: z.number().int().nonnegative(),
  promptTokens: z.number().nonnegative(),
  completionTokens: z.number().nonnegative(),
  totalTokens: z.number().nonnegative(),
}).strict();

/** Per-session inference accounting: one request per assembled assistant message, tokens summed over reported usage. */
export const tokenUsageProjection = {
  key: "company.token-usage",
  schema: tokenUsageSchema,
  init: () => ({ requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
  apply: (state, event) => {
    if (event.type !== "assistant/message") return state;
    const data = event.data && typeof event.data === "object" ? event.data : {};
    const usage = data.usage && typeof data.usage === "object" ? data.usage : null;
    const promptTokens = usage === null ? null : nonNegativeNumber(usage.inputTokens);
    const completionTokens = usage === null ? null : nonNegativeNumber(usage.outputTokens);
    return {
      requests: state.requests + 1,
      promptTokens: state.promptTokens + (promptTokens ?? 0),
      completionTokens: state.completionTokens + (completionTokens ?? 0),
      totalTokens: state.totalTokens + (promptTokens ?? 0) + (completionTokens ?? 0),
    };
  },
  view: (state) => ({
    requests: state.requests,
    promptTokens: state.promptTokens,
    completionTokens: state.completionTokens,
    totalTokens: state.totalTokens,
  }),
  stateVersion: 1,
};

const recentToolCallSchema = z.object({
  name: z.string(),
  time: z.number().int().nonnegative(),
}).strict();

const toolCallsSchema = z.object({
  counts: z.record(z.string(), z.number().int().nonnegative()),
  recent: z.array(recentToolCallSchema),
}).strict();

/** Tool-call summary: calls per tool name plus the trailing few dispatch timestamps. */
export const toolCallsProjection = {
  key: "company.tool-calls",
  schema: toolCallsSchema,
  init: () => ({ counts: {}, recent: [] }),
  apply: (state, event) => {
    if (event.type !== "tool/call") return state;
    const name = event.data && typeof event.data.name === "string" ? event.data.name : "";
    if (name === "") return state;
    // Own-key check: tool names cross the model/tool JSON boundary, so a
    // prototype property name must read as unseen instead of as an inherited
    // value that would poison the count with NaN.
    const previous = Object.hasOwn(state.counts, name) ? state.counts[name] : 0;
    const recent = [...state.recent, { name, time: event.time }];
    return {
      counts: { ...state.counts, [name]: previous + 1 },
      recent: recent.length > RECENT_TOOL_CALL_LIMIT ? recent.slice(recent.length - RECENT_TOOL_CALL_LIMIT) : recent,
    };
  },
  view: (state) => ({
    counts: Object.fromEntries(Object.entries(state.counts)),
    recent: state.recent.map((entry) => ({ name: entry.name, time: entry.time })),
  }),
  stateVersion: 1,
};

const turnStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  byKind: z.record(z.string(), z.number().int().nonnegative()),
}).strict();

/** Whole-log turn outcomes: total, completed/error counts, and the full reason.kind breakdown. */
export const turnStatsProjection = {
  key: "company.turn-stats",
  schema: turnStatsSchema,
  init: () => ({ total: 0, succeeded: 0, failed: 0, byKind: {} }),
  apply: (state, event) => {
    if (event.type !== "turn/end") return state;
    const data = event.data && typeof event.data === "object" ? event.data : {};
    const reason = data.reason && typeof data.reason === "object" ? data.reason : null;
    const kind = reason !== null && typeof reason.kind === "string" && reason.kind !== "" ? reason.kind : "unknown";
    const previous = Object.hasOwn(state.byKind, kind) ? state.byKind[kind] : 0;
    return {
      total: state.total + 1,
      succeeded: state.succeeded + (kind === "completed" ? 1 : 0),
      failed: state.failed + (kind === "error" ? 1 : 0),
      byKind: { ...state.byKind, [kind]: previous + 1 },
    };
  },
  view: (state) => ({
    total: state.total,
    succeeded: state.succeeded,
    failed: state.failed,
    byKind: Object.fromEntries(Object.entries(state.byKind)),
  }),
  stateVersion: 1,
};

export function apply(ctx) {
  ctx.sessionProjections.register(tokenUsageProjection);
  ctx.sessionProjections.register(toolCallsProjection);
  ctx.sessionProjections.register(turnStatsProjection);
}
