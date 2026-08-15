import { unwrap, buildQuery } from '../../../services/apiClient';
import {
  normalizeAiHarnessStatus,
  normalizeAiInvocationDetail,
  normalizeAiInvocationList,
} from '../models/harnessModel';
import type {
  AiHarnessStatus,
  AiInvocationDetail,
  AiInvocationListResult,
} from '../harnessTypes';

// ---------------------------------------------------------------------------
// dsh (DeepSeek Harness) runtime status + capability invocation traces.
// ---------------------------------------------------------------------------

/** dsh composition/runtime health. Requires the ai permission (any logged-in user). */
export async function fetchAiHarnessStatus(signal?: AbortSignal): Promise<AiHarnessStatus> {
  const response = await unwrap<unknown>('/api/ai/harness/status', { signal });
  return normalizeAiHarnessStatus(response);
}

export interface AiInvocationListParams {
  /** Non-admin callers must scope to one project or the route answers 403. */
  projectId?: string;
  limit?: number;
  status?: string;
}

/** Recent capability invocations for the trace entry list. */
export async function fetchAiCapabilityInvocations(
  params: AiInvocationListParams = {},
  signal?: AbortSignal,
): Promise<AiInvocationListResult> {
  const query = buildQuery({
    projectId: params.projectId,
    limit: typeof params.limit === 'number' ? String(params.limit) : undefined,
    status: params.status,
  });
  const response = await unwrap<unknown>(`/api/ai/capabilities/invocations${query}`, { signal });
  return normalizeAiInvocationList(response);
}

/** Full invocation record: summary fields + event trace + token usage + result. */
export async function fetchAiCapabilityInvocation(
  invocationId: string,
  signal?: AbortSignal,
): Promise<AiInvocationDetail> {
  const response = await unwrap<unknown>(
    `/api/ai/capabilities/invocations/${encodeURIComponent(invocationId)}`,
    { signal },
  );
  return normalizeAiInvocationDetail(response);
}
