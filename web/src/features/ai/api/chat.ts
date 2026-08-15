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
