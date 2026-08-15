import { unwrap, buildQuery } from '../../../services/apiClient';
import { normalizeAiInvocationEvent } from '../models/harnessModel';
import type { AiInvocationEvent } from '../harnessTypes';

// ---------------------------------------------------------------------------
// dsh session replay (admin REST, /api/ai/sessions). Sessions carry the same
// event shape as invocation traces, so replay reuses the timeline's event
// view models — read-only, no realtime subscription.
// ---------------------------------------------------------------------------

export interface AiSessionSummary {
  id: string;
  startedAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
}

export interface AiSessionReplayRecord {
  id: string;
  events: AiInvocationEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeAiSessionSummary(value: unknown): AiSessionSummary {
  if (!isRecord(value)) throw new TypeError('Invalid AI session summary response.');
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) throw new TypeError('Invalid AI session summary response.');
  return {
    id,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
    lastEventAt: typeof value.lastEventAt === 'string' ? value.lastEventAt : null,
    eventCount: typeof value.eventCount === 'number' && Number.isFinite(value.eventCount) && value.eventCount >= 0
      ? Math.floor(value.eventCount)
      : 0,
  };
}

export function normalizeAiSessionReplay(value: unknown): AiSessionReplayRecord {
  if (!isRecord(value)) throw new TypeError('Invalid AI session replay response.');
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) throw new TypeError('Invalid AI session replay response.');
  const rawEvents = Array.isArray(value.events) ? value.events : [];
  return { id, events: rawEvents.map((event, index) => normalizeAiInvocationEvent(event, index + 1)) };
}

/** GET /api/ai/sessions?limit=… → data.items (most recent first). */
export async function fetchAiSessions(limit = 20, signal?: AbortSignal): Promise<AiSessionSummary[]> {
  const query = buildQuery({ limit: String(limit) });
  const response = await unwrap<unknown>(`/api/ai/sessions${query}`, { signal });
  const items = isRecord(response) && Array.isArray(response.items) ? response.items : [];
  return items.map(normalizeAiSessionSummary);
}

/** GET /api/ai/sessions/:id → data.{ id, events } */
export async function fetchAiSession(id: string, signal?: AbortSignal): Promise<AiSessionReplayRecord> {
  const response = await unwrap<unknown>(`/api/ai/sessions/${encodeURIComponent(id)}`, { signal });
  return normalizeAiSessionReplay(response);
}
