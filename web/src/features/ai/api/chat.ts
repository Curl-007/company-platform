import { unwrap, unwrapPost } from '../../../services/apiClient';
import type {
  AiBusinessAdvice,
  AiBusinessAdviceInput,
  AiChatInput,
  AiChatMessage,
  AiJob,
  AiSummary,
  ConfirmAiJobInput,
} from '../../../types';

// ---------------------------------------------------------------------------
// Assistant chat + AI job review endpoints (Sprint 1 chat workspace).
// ---------------------------------------------------------------------------

export function fetchAiBusinessAdvice(input: AiBusinessAdviceInput): Promise<AiBusinessAdvice> {
  return unwrapPost<AiBusinessAdvice>('/api/ai/business-advice', input, {
    invalidateCache: false,
    timeoutMs: 90000,
  });
}

export function sendAiChat(input: AiChatInput): Promise<AiChatMessage> {
  return unwrapPost<AiChatMessage>('/api/ai/chat', input, {
    invalidateCache: false,
    // Tool-capable DSH turns can include several authorized platform reads.
    // Keep a small transport margin over the server-side 120s turn budget.
    timeoutMs: 130000,
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
  // Summary loads do not need to wait for model inference, but a cold local
  // server can still take longer than the generic 15s request window.
  return unwrap<AiSummary>(`/api/ai/summary${query}`, { timeoutMs: 35_000 });
}
