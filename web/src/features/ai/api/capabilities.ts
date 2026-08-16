import { unwrap, unwrapPost } from '../../../services/apiClient';
import type {
  AiCapabilityInvocation,
  AiCapabilityManifest,
} from '../../../types';
import { normalizeAiCapabilityList } from '../models/capabilityPresentation';

// ---------------------------------------------------------------------------
// BFF-approved declarative capability manifests + invocations.
// ---------------------------------------------------------------------------

// The capability adapter allows a 120s model/tool execution window. Leave a
// small transport margin so the browser does not abort a request that the BFF
// can still finish, which otherwise makes a manual retry look like a new write.
export const AI_CAPABILITY_INVOKE_TIMEOUT_MS = 130_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAiCapabilityInvocation(
  value: unknown,
  requestedCapabilityId: string,
): AiCapabilityInvocation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid AI capability invocation response.');
  }
  const record = value as Record<string, unknown>;
  const jobId = typeof record.jobId === 'string' ? record.jobId.trim() : '';
  const invocationId = typeof record.invocationId === 'string' ? record.invocationId.trim() : '';
  const status = typeof record.status === 'string' ? record.status.trim() : '';
  if ((!jobId && !invocationId) || !status) throw new TypeError('Invalid AI capability invocation response.');
  const nestedCapability = isRecord(record.capability) ? record.capability : null;
  const capabilityId = typeof record.capabilityId === 'string'
    ? record.capabilityId.trim()
    : typeof nestedCapability?.id === 'string'
      ? nestedCapability.id.trim()
      : requestedCapabilityId;
  return {
    status,
    ...(jobId ? { jobId } : {}),
    ...(invocationId ? { invocationId } : {}),
    ...(capabilityId ? { capabilityId } : {}),
    ...(typeof record.createdAt === 'string' || record.createdAt === null ? { createdAt: record.createdAt } : {}),
    ...(isRecord(record.result) || record.result === null ? { result: record.result } : {}),
  };
}

export type AiCapabilityAvailability =
  | { state: 'available'; capabilities: AiCapabilityManifest[] }
  | { state: 'unavailable'; capabilities: [] };

export interface InvokeAiCapabilityOptions {
  /** Reuse after an uncertain network outcome so the BFF returns the original invocation. */
  idempotencyKey?: string;
}

/** Read only BFF-approved manifests; invalid or non-declarative entries are never rendered. */
export async function fetchAiCapabilities(): Promise<AiCapabilityManifest[]> {
  const payload = await unwrap<unknown>('/api/ai/capabilities');
  return normalizeAiCapabilityList(payload);
}

/**
 * Capability routes may not have deployed with the current backend yet. Keep
 * the chat workspace functional and avoid surfacing infrastructure details.
 */
export async function fetchAiCapabilityAvailability(): Promise<AiCapabilityAvailability> {
  try {
    return { state: 'available', capabilities: await fetchAiCapabilities() };
  } catch {
    return { state: 'unavailable', capabilities: [] };
  }
}

export async function invokeAiCapability(
  capabilityId: string,
  input: Record<string, string>,
  { idempotencyKey }: InvokeAiCapabilityOptions = {},
): Promise<AiCapabilityInvocation> {
  const normalizedIdempotencyKey = String(idempotencyKey ?? '').trim();
  const response = await unwrapPost<unknown>(
    `/api/ai/capabilities/${encodeURIComponent(capabilityId)}/invocations`,
    input,
    {
      invalidation: 'aiCapabilityInvocation',
      timeoutMs: AI_CAPABILITY_INVOKE_TIMEOUT_MS,
      headers: normalizedIdempotencyKey ? { 'Idempotency-Key': normalizedIdempotencyKey } : undefined,
    },
  );
  return normalizeAiCapabilityInvocation(response, capabilityId);
}
