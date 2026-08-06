import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type {
  AiBusinessAdvice,
  AiBusinessAdviceInput,
  AiChatInput,
  AiChatMessage,
  AiJob,
  AiModelListResult,
  AiProviderConfig,
  AiProviderTestResult,
  AiSummary,
  ConfirmAiJobInput,
  UpdateAiProviderInput,
} from '../../types';

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
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/confirm`, input);
}

export function rejectAiJob(id: string, input: { reason?: string } = {}): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/reject`, input);
}

export function retryAiJob(id: string): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/retry`, {});
}

export function fetchAiSummary(scope?: string): Promise<AiSummary> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return unwrap<AiSummary>(`/api/ai/summary${query}`);
}

export function fetchAiProviderConfig(): Promise<AiProviderConfig> {
  return unwrap<AiProviderConfig>('/api/admin/ai-provider');
}

export function updateAiProviderConfig(input: UpdateAiProviderInput): Promise<AiProviderConfig> {
  return unwrapPatch<AiProviderConfig>('/api/admin/ai-provider', input);
}

export function activateAiProviderConfig(id: string): Promise<AiProviderConfig> {
  return unwrapPost<AiProviderConfig>(`/api/admin/ai-provider/${id}/activate`, {});
}

export function updateAiProviderStatus(id: string, enabled: boolean): Promise<AiProviderConfig> {
  return unwrapPatch<AiProviderConfig>(`/api/admin/ai-provider/${id}/status`, { enabled });
}

export function deleteAiProviderConfig(id: string): Promise<AiProviderConfig> {
  return unwrapDel<AiProviderConfig>(`/api/admin/ai-provider/${id}`);
}

export function testAiProviderConfig(): Promise<AiProviderTestResult> {
  return unwrapPost<AiProviderTestResult>('/api/admin/ai-provider/test', {}, { invalidateCache: false });
}

export function fetchAiModels(): Promise<AiModelListResult> {
  return unwrap<AiModelListResult>('/api/ai/models');
}
