import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../../services/apiClient';
import type {
  AiAssistantConfig,
  AiModelListResult,
  AiProviderConfig,
  AiProviderTestResult,
  UpdateAiProviderInput,
  UpdateAiAssistantInput,
} from '../../../types';

// ---------------------------------------------------------------------------
// AI provider / assistant admin configuration endpoints.
// ---------------------------------------------------------------------------

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
  // Provider probes use a short 64-token turn, but Harness startup can still
  // take a few seconds on a cold runtime.
  return unwrapPost<AiProviderTestResult>('/api/admin/ai-provider/test', input, {
    invalidateCache: false,
    timeoutMs: 30_000,
  });
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
