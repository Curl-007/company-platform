import i18n from '../../../i18n';
import { getInterfaceLocale } from '../../../i18n';
import type {
  AiHarnessPlugin,
  AiHarnessStatus,
  AiInvocationDetail,
  AiInvocationEvent,
  AiInvocationListResult,
  AiInvocationSummary,
  AiInvocationTokenUsage,
} from '../harnessTypes';

// ---------------------------------------------------------------------------
// dsh harness status + invocation trace normalization.
//
// Backend responses are structurally validated here so components only ever
// see well-formed data; malformed envelopes raise TypeError (same style as
// normalizeAiCapabilityInvocation in api.ts).
// ---------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asOptionalString(value: unknown): string | undefined {
  const text = asString(value);
  return text === null ? undefined : text;
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Optional counters stay absent (undefined) when the backend omits them, so older payloads degrade gracefully. */
function asOptionalCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

/** Relative time reuse of the existing common.* keys (matches NotificationBell). */
export function formatInvocationRelativeTime(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const min = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (min < 1) return i18n.t('common.justNow');
  if (min < 60) return i18n.t('common.minutesAgo', { count: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return i18n.t('common.hoursAgo', { count: hour });
  return parsed.toLocaleDateString(getInterfaceLocale());
}

export function normalizeAiHarnessStatus(value: unknown): AiHarnessStatus {
  if (!isRecord(value)) throw new TypeError('Invalid AI harness status response.');
  const composition = isRecord(value.composition) ? value.composition : null;
  const compositionId = asString(composition?.id);
  if (!composition || !compositionId) throw new TypeError('Invalid AI harness status response.');

  const rawPlugins = Array.isArray(composition.plugins) ? composition.plugins : [];
  const plugins: AiHarnessPlugin[] = rawPlugins
    .filter((plugin): plugin is UnknownRecord => isRecord(plugin))
    .map((plugin) => ({
      id: asString(plugin.id) ?? '',
      name: asString(plugin.name) ?? '',
      kind: asString(plugin.kind) ?? '',
    }))
    .filter((plugin) => plugin.id);

  const runtime = isRecord(value.runtime) ? value.runtime : null;
  if (!runtime) throw new TypeError('Invalid AI harness status response.');
  const proxy = isRecord(runtime.proxy) ? runtime.proxy : {};
  const totalCalls = asOptionalCount(runtime.totalCalls);
  const totalRuns = asOptionalCount(runtime.totalRuns);

  return {
    composition: {
      id: compositionId,
      sdkVersion: asString(composition.sdkVersion) ?? '',
      plugins,
    },
    runtime: {
      active: asBoolean(runtime.active),
      activeCalls: asCount(runtime.activeCalls),
      maxRunsPerRuntime: asCount(runtime.maxRunsPerRuntime),
      queued: asCount(runtime.queued),
      ...(totalCalls !== undefined ? { totalCalls } : {}),
      ...(totalRuns !== undefined ? { totalRuns } : {}),
      proxy: {
        started: asBoolean(proxy.started),
        activeRoutes: asCount(proxy.activeRoutes),
      },
    },
    tokenUsageService: asBoolean(value.tokenUsageService),
  };
}

function normalizeAiInvocationSummary(value: unknown): AiInvocationSummary {
  if (!isRecord(value)) throw new TypeError('Invalid AI capability invocation record.');
  const id = asString(value.id);
  const status = asString(value.status);
  if (!id || !status) throw new TypeError('Invalid AI capability invocation record.');
  return {
    id,
    status,
    ...(asOptionalString(value.capabilityId) ? { capabilityId: asOptionalString(value.capabilityId) } : {}),
    ...(asOptionalString(value.capabilityVersion) ? { capabilityVersion: asOptionalString(value.capabilityVersion) } : {}),
    ...(asOptionalString(value.projectId) ? { projectId: asOptionalString(value.projectId) } : {}),
    ...(asOptionalString(value.actorId) ? { actorId: asOptionalString(value.actorId) } : {}),
    ...(asOptionalString(value.errorCode) ? { errorCode: asOptionalString(value.errorCode) } : {}),
    ...(typeof value.createdAt === 'string' || value.createdAt === null ? { createdAt: value.createdAt } : {}),
    ...(typeof value.startedAt === 'string' || value.startedAt === null ? { startedAt: value.startedAt } : {}),
    ...(typeof value.completedAt === 'string' || value.completedAt === null ? { completedAt: value.completedAt } : {}),
  };
}

export function normalizeAiInvocationList(value: unknown): AiInvocationListResult {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new TypeError('Invalid AI capability invocation list response.');
  }
  return {
    items: value.items.map(normalizeAiInvocationSummary),
    total: asCount(value.total),
  };
}

export function normalizeAiInvocationEvent(value: unknown, fallbackSeq: number): AiInvocationEvent {
  if (!isRecord(value)) throw new TypeError('Invalid AI invocation event record.');
  const type = asString(value.type);
  if (!type) throw new TypeError('Invalid AI invocation event record.');
  const time = typeof value.time === 'string' ? value.time : null;
  const seq = typeof value.seq === 'number' && Number.isSafeInteger(value.seq) && value.seq >= 0
    ? value.seq
    : fallbackSeq;
  return { type, seq, time, data: isRecord(value.data) ? value.data : null };
}

function normalizeAiTokenUsage(value: unknown): AiInvocationTokenUsage {
  if (!isRecord(value)) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  return {
    promptTokens: asCount(value.promptTokens),
    completionTokens: asCount(value.completionTokens),
    totalTokens: asCount(value.totalTokens),
  };
}

export function normalizeAiInvocationDetail(value: unknown): AiInvocationDetail {
  const summary = normalizeAiInvocationSummary(value);
  const record = isRecord(value) ? value : {};
  const rawEvents = Array.isArray(record.events) ? record.events : [];
  const events = rawEvents.map((event, index) => normalizeAiInvocationEvent(event, index + 1));
  return {
    ...summary,
    events,
    tokenUsage: normalizeAiTokenUsage(record.tokenUsage),
    result: isRecord(record.result) ? record.result : null,
  };
}

/** Terminal invocation statuses stop timeline polling. */
const TERMINAL_INVOCATION_STATUSES = new Set(['completed', 'failed', 'aborted', 'blocked', 'error', 'cancelled', 'canceled']);

export function isTerminalInvocationStatus(status: string | undefined): boolean {
  if (!status) return false;
  return TERMINAL_INVOCATION_STATUSES.has(status.trim().toLowerCase());
}

/** turn/end reason kinds that definitively finished the invocation (dsh rc.6). */
const TERMINAL_TURN_END_REASONS = new Set(['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted']);

/** True when a turn/end event's reason.kind marks the whole invocation as finished. */
export function isTerminalTurnEndReason(data: Record<string, unknown> | null): boolean {
  if (!data || !isRecord(data.reason)) return false;
  const kind = asString(data.reason.kind);
  return kind !== null && TERMINAL_TURN_END_REASONS.has(kind);
}

/**
 * Merges realtime-streamed events into the detail payload's events: deduped by
 * seq (the first occurrence wins, so detail data outranks a redelivered live
 * event) and kept in ascending seq order. Returns a fresh array every call.
 */
export function mergeInvocationEvents(
  base: readonly AiInvocationEvent[],
  incoming: readonly AiInvocationEvent[],
): AiInvocationEvent[] {
  const merged = [...base];
  const seen = new Set(base.map((event) => event.seq));
  for (const event of incoming) {
    if (seen.has(event.seq)) continue;
    seen.add(event.seq);
    merged.push(event);
  }
  return merged.sort((a, b) => a.seq - b.seq);
}

/** Known invocation statuses get localized labels; anything else renders raw. */
const INVOCATION_STATUS_KEYS: Record<string, string> = {
  queued: 'statusQueued',
  running: 'statusRunning',
  completed: 'statusCompleted',
  failed: 'statusFailed',
  aborted: 'statusAborted',
  blocked: 'statusBlocked',
};

export function invocationStatusLabel(status: string): string {
  const key = INVOCATION_STATUS_KEYS[status.trim().toLowerCase()];
  return key ? i18n.t(`features.ai.aiInvocationTimeline.${key}`) : status;
}

// ---------------------------------------------------------------------------
// Event view model for the timeline renderer.
// ---------------------------------------------------------------------------

export type InvocationEventCategory = 'turn-end' | 'assistant-message' | 'tool-call' | 'generic';
export type InvocationEventTone = 'success' | 'error' | 'neutral';

export interface InvocationEventUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface InvocationEventView {
  seq: number;
  time: string | null;
  /** Raw event type; always rendered for unknown categories. */
  type: string;
  category: InvocationEventCategory;
  tone: InvocationEventTone;
  reasonKind: string | null;
  toolName: string | null;
  usage: InvocationEventUsage | null;
}

function countOf(record: UnknownRecord | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Classifies harness events for rendering. Unknown event types degrade to a
 * generic node instead of throwing so a newer runtime never breaks the UI.
 */
export function toInvocationEventView(event: AiInvocationEvent): InvocationEventView {
  const base = {
    seq: event.seq,
    time: event.time,
    type: event.type,
  };

  if (event.type === 'turn/end') {
    const reason = isRecord(event.data?.reason) ? event.data?.reason : null;
    const reasonKind = asString(reason?.kind) ?? null;
    const tone: InvocationEventTone = reasonKind === 'completed'
      ? 'success'
      : reasonKind === 'error' || reasonKind === 'interrupted'
        ? 'error'
        : 'neutral';
    return { ...base, category: 'turn-end', tone, reasonKind, toolName: null, usage: null };
  }

  if (event.type === 'assistant/message') {
    const usage = isRecord(event.data?.usage) ? event.data.usage : null;
    const inputTokens = countOf(usage, 'inputTokens');
    const outputTokens = countOf(usage, 'outputTokens');
    return {
      ...base,
      category: 'assistant-message',
      tone: 'neutral',
      reasonKind: null,
      toolName: null,
      usage: inputTokens !== null && outputTokens !== null ? { inputTokens, outputTokens } : null,
    };
  }

  if (event.type === 'tool/call') {
    const toolName = asString(event.data?.name) ?? null;
    return { ...base, category: 'tool-call', tone: 'neutral', reasonKind: null, toolName, usage: null };
  }

  return { ...base, category: 'generic', tone: 'neutral', reasonKind: null, toolName: null, usage: null };
}

export function toInvocationEventViews(events: readonly AiInvocationEvent[]): InvocationEventView[] {
  return events.map(toInvocationEventView);
}

export interface JsonPreview {
  text: string;
  truncated: boolean;
}

/** Pretty JSON preview capped at maxChars (default ~2KB) for the result drawer. */
export function previewJson(value: unknown, maxChars = 2048): JsonPreview {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? '';
  } catch {
    return { text: String(value), truncated: false };
  }
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n…`, truncated: true };
}
