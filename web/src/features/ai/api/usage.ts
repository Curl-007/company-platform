import { unwrap, buildQuery } from '../../../services/apiClient';

// ---------------------------------------------------------------------------
// AI token usage dashboard (Sprint 5.3).
// ---------------------------------------------------------------------------

export interface AiUsageTotals {
  invocations: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiUsageByCapability extends AiUsageTotals {
  capabilityId: string;
  capabilityVersion: string;
}

export interface AiUsageByDay extends AiUsageTotals {
  date: string;
}

export interface AiUsageSummary {
  total: AiUsageTotals;
  byCapability: AiUsageByCapability[];
  /** Present only when requesting groupBy: 'day'. */
  byDay?: AiUsageByDay[];
}

export interface AiUsageSummaryParams {
  projectId?: string;
  from?: string;
  to?: string;
  groupBy?: 'capability' | 'day';
}

function usageCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeAiUsageSummary(payload: unknown, expectDays: boolean): AiUsageSummary {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Invalid AI usage summary response.');
  }
  const record = payload as Record<string, unknown>;
  const totalSource = record.total && typeof record.total === 'object' ? record.total as Record<string, unknown> : {};
  const byCapability = Array.isArray(record.byCapability)
    ? record.byCapability.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const normalized: AiUsageSummary = {
    total: {
      invocations: usageCount(totalSource.invocations),
      promptTokens: usageCount(totalSource.promptTokens),
      completionTokens: usageCount(totalSource.completionTokens),
      totalTokens: usageCount(totalSource.totalTokens),
    },
    byCapability: byCapability.map((item) => ({
      capabilityId: typeof item.capabilityId === 'string' ? item.capabilityId : '',
      capabilityVersion: typeof item.capabilityVersion === 'string' ? item.capabilityVersion : '',
      invocations: usageCount(item.invocations),
      promptTokens: usageCount(item.promptTokens),
      completionTokens: usageCount(item.completionTokens),
      totalTokens: usageCount(item.totalTokens),
    })),
  };
  if (expectDays || Array.isArray(record.byDay)) {
    const byDay = Array.isArray(record.byDay)
      ? record.byDay.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : [];
    normalized.byDay = byDay.map((item) => ({
      date: typeof item.date === 'string' ? item.date : '',
      invocations: usageCount(item.invocations),
      promptTokens: usageCount(item.promptTokens),
      completionTokens: usageCount(item.completionTokens),
      totalTokens: usageCount(item.totalTokens),
    }));
  }
  return normalized;
}

/** Aggregated AI token usage; groupBy 'day' adds the per-day series. */
export async function fetchAiUsageSummary(
  params: AiUsageSummaryParams = {},
  signal?: AbortSignal,
): Promise<AiUsageSummary> {
  const query = buildQuery({
    projectId: params.projectId,
    from: params.from,
    to: params.to,
    groupBy: params.groupBy,
  });
  const response = await unwrap<unknown>(`/api/ai/usage/summary${query}`, { signal });
  return normalizeAiUsageSummary(response, params.groupBy === 'day');
}
