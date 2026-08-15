import { unwrap, unwrapPost, buildQuery } from '../../../services/apiClient';

// ---------------------------------------------------------------------------
// Sprint 5.1 agent interactions (ask-user / user-approval bridge).
// Pending questions/approvals paused inside a dsh runtime; answering here
// wakes the child's loopback long-poll. 15s polling is the fallback path —
// ws `agent.interaction` pushes only accelerate the refresh.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** One selectable option of a pending question. */
export interface AiInteractionOption {
  label: string;
  description?: string;
}

/** One question in a pending interaction (tool-ask-user contract). */
export interface AiInteractionQuestion {
  id: string;
  question: string;
  header?: string;
  detail?: string;
  options?: AiInteractionOption[];
  multiSelect?: boolean;
}

/** Pending/settled agent interaction (GET /api/ai/interactions contract). */
export interface AiInteraction {
  interactionId: string;
  kind: 'question' | 'approval';
  status: 'pending' | 'answered' | 'cancelled' | 'timed_out';
  invocationId: string;
  projectId: string;
  actorId: string;
  payload: {
    questions?: AiInteractionQuestion[];
    toolName?: string;
    reason?: string;
    callId?: string;
  };
  response: { answers?: Array<{ id: string; selected: string[]; custom?: string }>; decision?: string } | null;
  createdAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
}

function normalizeInteractionQuestion(value: unknown): AiInteractionQuestion {
  const record = isRecord(value) ? value : {};
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  if (!id || !question) throw new TypeError('Invalid AI interaction question.');
  const normalized: AiInteractionQuestion = { id, question };
  if (typeof record.header === 'string' && record.header.trim()) normalized.header = record.header.trim();
  if (typeof record.detail === 'string' && record.detail.trim()) normalized.detail = record.detail.trim();
  if (Array.isArray(record.options)) {
    normalized.options = record.options
      .filter((option): option is Record<string, unknown> => isRecord(option))
      .map((option) => {
        const label = typeof option.label === 'string' ? option.label.trim() : '';
        if (!label) throw new TypeError('Invalid AI interaction option.');
        return {
          label,
          ...(typeof option.description === 'string' && option.description.trim()
            ? { description: option.description.trim() }
            : {}),
        };
      });
  }
  if (record.multiSelect === true) normalized.multiSelect = true;
  return normalized;
}

export function normalizeAiInteraction(value: unknown): AiInteraction {
  if (!isRecord(value)) throw new TypeError('Invalid AI interaction response.');
  const interactionId = typeof value.interactionId === 'string' ? value.interactionId.trim() : '';
  const kind = value.kind === 'approval' ? 'approval' : 'question';
  const status = ['pending', 'answered', 'cancelled', 'timed_out'].includes(String(value.status))
    ? (value.status as AiInteraction['status'])
    : 'pending';
  if (!interactionId) throw new TypeError('Invalid AI interaction response.');
  const payloadRecord = isRecord(value.payload) ? value.payload : {};
  const payload: AiInteraction['payload'] = {};
  if (Array.isArray(payloadRecord.questions)) {
    payload.questions = payloadRecord.questions.map(normalizeInteractionQuestion);
  }
  if (typeof payloadRecord.toolName === 'string') payload.toolName = payloadRecord.toolName.trim();
  if (typeof payloadRecord.reason === 'string') payload.reason = payloadRecord.reason.trim();
  if (typeof payloadRecord.callId === 'string') payload.callId = payloadRecord.callId.trim();
  return {
    interactionId,
    kind,
    status,
    invocationId: typeof value.invocationId === 'string' ? value.invocationId.trim() : '',
    projectId: typeof value.projectId === 'string' ? value.projectId.trim() : '',
    actorId: typeof value.actorId === 'string' ? value.actorId.trim() : '',
    payload,
    // The contract declares these as required `T | null` (not optional), so a
    // missing field normalizes to null instead of an absent property.
    response: isRecord(value.response) ? value.response as AiInteraction['response'] : null,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    respondedAt: typeof value.respondedAt === 'string' ? value.respondedAt : null,
    respondedBy: typeof value.respondedBy === 'string' ? value.respondedBy : null,
  };
}

/** Pending (by default) interactions visible to the current user. */
export async function fetchAiInteractions(status = 'pending', signal?: AbortSignal): Promise<AiInteraction[]> {
  const response = await unwrap<unknown>(`/api/ai/interactions${buildQuery({ status })}`, { signal });
  const record = isRecord(response) && Array.isArray(response.items) ? response.items : [];
  return record.map(normalizeAiInteraction);
}

export interface AiInteractionRespondInput {
  /** Question answer in the tool-ask-user contract shape. */
  answer?: { answers: Array<{ id: string; selected: string[]; custom?: string }> };
  /** Approval decision. */
  decision?: 'approve' | 'reject';
}

/** Answer one pending interaction; the dsh child resumes with the result. */
export async function respondAiInteraction(
  interactionId: string,
  input: AiInteractionRespondInput,
): Promise<AiInteraction> {
  return unwrapPost<AiInteraction>(
    `/api/ai/interactions/${encodeURIComponent(interactionId)}/respond`,
    input,
    { invalidateCache: false },
  );
}

/** Withdraw one pending interaction (initiator only). */
export async function cancelAiInteraction(interactionId: string): Promise<AiInteraction> {
  return unwrapPost<AiInteraction>(
    `/api/ai/interactions/${encodeURIComponent(interactionId)}/cancel`,
    {},
    { invalidateCache: false },
  );
}
