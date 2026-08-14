import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import { normalizeAiCapabilityList } from './capabilityPresentation';
import type {
  AiBusinessAdvice,
  AiBusinessAdviceInput,
  AiAssistantConfig,
  AiCapabilityInvocation,
  AiCapabilityManifest,
  AiChatInput,
  AiChatMessage,
  AiJob,
  AiModelListResult,
  AiProviderConfig,
  AiProviderTestResult,
  AiSummary,
  ConfirmAiJobInput,
  UpdateAiProviderInput,
  UpdateAiAssistantInput,
} from '../../types';

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

export function fetchAiBusinessAdvice(input: AiBusinessAdviceInput): Promise<AiBusinessAdvice> {
  return unwrapPost<AiBusinessAdvice>('/api/ai/business-advice', input, {
    invalidateCache: false,
    timeoutMs: 90000,
  });
}

export function sendAiChat(input: AiChatInput): Promise<AiChatMessage> {
  return unwrapPost<AiChatMessage>('/api/ai/chat', input, {
    invalidateCache: false,
    timeoutMs: 60000,
  });
}

export function fetchAiJob(id: string, signal?: AbortSignal): Promise<AiJob> {
  return unwrap<AiJob>(`/api/ai/jobs/${id}`, { signal });
}

export function confirmAiJob(id: string, input: ConfirmAiJobInput = {}): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/confirm`, input, { invalidation: 'aiJobs' });
}

export function rejectAiJob(id: string, input: { reason?: string } = {}): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/reject`, input, { invalidation: 'aiJobs' });
}

export function retryAiJob(id: string): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/retry`, {}, { invalidation: 'aiJobs' });
}

export function fetchAiSummary(scope?: string): Promise<AiSummary> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return unwrap<AiSummary>(`/api/ai/summary${query}`);
}

export function fetchAiProviderConfig(): Promise<AiProviderConfig> {
  return unwrap<AiProviderConfig>('/api/admin/ai-provider');
}

export function updateAiProviderConfig(input: UpdateAiProviderInput): Promise<AiProviderConfig> {
  return unwrapPatch<AiProviderConfig>('/api/admin/ai-provider', input, { invalidation: 'aiProvider' });
}

export function activateAiProviderConfig(id: string): Promise<AiProviderConfig> {
  return unwrapPost<AiProviderConfig>(`/api/admin/ai-provider/${id}/activate`, {}, { invalidation: 'aiProvider' });
}

export function updateAiProviderStatus(id: string, enabled: boolean): Promise<AiProviderConfig> {
  return unwrapPatch<AiProviderConfig>(`/api/admin/ai-provider/${id}/status`, { enabled }, { invalidation: 'aiProvider' });
}

export function deleteAiProviderConfig(id: string): Promise<AiProviderConfig> {
  return unwrapDel<AiProviderConfig>(`/api/admin/ai-provider/${id}`, { invalidation: 'aiProvider' });
}

export function testAiProviderConfig(input: Partial<UpdateAiProviderInput> = {}): Promise<AiProviderTestResult> {
  return unwrapPost<AiProviderTestResult>('/api/admin/ai-provider/test', input, { invalidateCache: false });
}

export function fetchAiModels(): Promise<AiModelListResult> {
  return unwrap<AiModelListResult>('/api/ai/models');
}

export function fetchAdminAiProviderModels(id?: string): Promise<AiModelListResult> {
  const query = id ? `?id=${encodeURIComponent(id)}` : '';
  return unwrap<AiModelListResult>(`/api/admin/ai-provider/models${query}`);
}

export function fetchAiAssistantConfig(): Promise<AiAssistantConfig> {
  return unwrap<AiAssistantConfig>('/api/admin/ai-assistant');
}

export function updateAiAssistantConfig(input: UpdateAiAssistantInput): Promise<AiAssistantConfig> {
  return unwrapPatch<AiAssistantConfig>('/api/admin/ai-assistant', input, { invalidation: 'aiAssistant' });
}

export type AiCapabilityAvailability =
  | { state: 'available'; capabilities: AiCapabilityManifest[] }
  | { state: 'unavailable'; capabilities: [] };

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
): Promise<AiCapabilityInvocation> {
  const response = await unwrapPost<unknown>(
    `/api/ai/capabilities/${encodeURIComponent(capabilityId)}/invocations`,
    input,
    { invalidation: 'aiCapabilityInvocation', timeoutMs: 60000 },
  );
  return normalizeAiCapabilityInvocation(response, capabilityId);
}
