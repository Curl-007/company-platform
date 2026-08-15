import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Gauge, ListTree } from 'lucide-react';
import { fetchAiUsageSummary } from '../api/usage';
import type { Project } from '../../../types';

/** Usage is passive dashboard data: poll on a slow cadence, no retries. */
const USAGE_REFETCH_MS = 30_000;
const DAY_RANGE_DAYS = 30;

type UsageView = 'capability' | 'day';
type UsageRange = '7d' | '30d' | 'all';

const RANGE_DAYS: Record<Exclude<UsageRange, 'all'>, number> = { '7d': 7, '30d': 30 };

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatTokens(value: number): string {
  return value.toLocaleString();
}

/**
 * AI token usage dashboard (Sprint 5.3). Default view aggregates per
 * capability; the "by day" toggle shows the last 30 days as CSS bars (no new
 * chart dependency). Project scope reuses the shared invocation project
 * context so tray and dashboard always agree.
 */
export default function AiUsagePanel({
  projects,
  projectId,
  onProjectChange,
}: {
  projects: Project[];
  /** Shared AI workspace project scope ("" = all accessible projects). */
  projectId: string;
  onProjectChange: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<UsageView>('capability');
  const [range, setRange] = useState<UsageRange>('7d');

  // The day series is defined as the last 30 days regardless of the range
  // filter; the capability table honours the selected range. Memoized so the
  // ISO timestamp (and with it the query key) stays stable across re-renders.
  const from = useMemo(
    () => (view === 'day'
      ? isoDaysAgo(DAY_RANGE_DAYS)
      : range === 'all' ? undefined : isoDaysAgo(RANGE_DAYS[range])),
    [range, view],
  );

  const usageQuery = useQuery({
    queryKey: ['ai', 'usage', view, from ?? '', projectId],
    queryFn: ({ signal }) => fetchAiUsageSummary(
      { ...(projectId ? { projectId } : {}), ...(from ? { from } : {}), groupBy: view },
      signal,
    ),
    refetchInterval: USAGE_REFETCH_MS,
  });

  const byDay = usageQuery.data?.byDay ?? [];
  const maxDayTokens = useMemo(
    () => byDay.reduce((max, item) => Math.max(max, item.totalTokens), 0),
    [byDay],
  );

  return (
    <section className="ai-usage-card" aria-label={t('features.ai.aiUsagePanel.title')}>
      <div className="ai-usage-header">
        <div className="ai-usage-heading">
          <Gauge size={14} aria-hidden="true" />
          <strong>{t('features.ai.aiUsagePanel.title')}</strong>
          {usageQuery.data ? (
            <em>
              {t('features.ai.aiUsagePanel.totalSummary', {
                invocations: usageQuery.data.total.invocations,
                tokens: formatTokens(usageQuery.data.total.totalTokens),
              })}
            </em>
          ) : null}
        </div>
        <div className="ai-usage-controls">
          <select
            className="form-select"
            value={projectId}
            onChange={(event) => onProjectChange(event.target.value)}
            aria-label={t('features.ai.aiUsagePanel.projectFilter')}
          >
            <option value="">{t('features.ai.aiUsagePanel.allProjects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select
            className="form-select"
            value={range}
            onChange={(event) => setRange(event.target.value as UsageRange)}
            aria-label={t('features.ai.aiUsagePanel.rangeFilter')}
            disabled={view === 'day'}
          >
            <option value="7d">{t('features.ai.aiUsagePanel.range7d')}</option>
            <option value="30d">{t('features.ai.aiUsagePanel.range30d')}</option>
            <option value="all">{t('features.ai.aiUsagePanel.rangeAll')}</option>
          </select>
          <div className="ai-usage-view-toggle" role="group" aria-label={t('features.ai.aiUsagePanel.viewToggle')}>
            <button
              type="button"
              className={`btn btn-sm ${view === 'capability' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('capability')}
              aria-pressed={view === 'capability'}
            >
              {t('features.ai.aiUsagePanel.viewByCapability')}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === 'day' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('day')}
              aria-pressed={view === 'day'}
            >
              {t('features.ai.aiUsagePanel.viewByDay')}
            </button>
          </div>
        </div>
      </div>

      {usageQuery.isError ? (
        <div className="ai-usage-state is-error" role="status">
          {t('features.ai.aiUsagePanel.loadFailed')}
        </div>
      ) : usageQuery.isPending ? (
        <div className="ai-usage-state" role="status">
          {t('features.ai.aiUsagePanel.loading')}
        </div>
      ) : view === 'capability' ? (
        usageQuery.data.byCapability.length === 0 ? (
          <div className="ai-usage-state" role="status">
            {t('features.ai.aiUsagePanel.empty')}
          </div>
        ) : (
          <div className="ai-usage-table-wrap">
            <table className="ai-usage-table">
              <thead>
                <tr>
                  <th>{t('features.ai.aiUsagePanel.columnCapability')}</th>
                  <th>{t('features.ai.aiUsagePanel.columnInvocations')}</th>
                  <th>{t('features.ai.aiUsagePanel.columnPromptTokens')}</th>
                  <th>{t('features.ai.aiUsagePanel.columnCompletionTokens')}</th>
                  <th>{t('features.ai.aiUsagePanel.columnTotalTokens')}</th>
                </tr>
              </thead>
              <tbody>
                {usageQuery.data.byCapability.map((group) => (
                  <tr key={`${group.capabilityId}@${group.capabilityVersion}`}>
                    <td>
                      <span className="text-mono">{group.capabilityId || '—'}</span>
                      {group.capabilityVersion ? (
                        <span className="ai-usage-version">v{group.capabilityVersion}</span>
                      ) : null}
                    </td>
                    <td className="text-mono">{formatTokens(group.invocations)}</td>
                    <td className="text-mono">{formatTokens(group.promptTokens)}</td>
                    <td className="text-mono">{formatTokens(group.completionTokens)}</td>
                    <td className="text-mono">{formatTokens(group.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : byDay.length === 0 ? (
        <div className="ai-usage-state" role="status">
          {t('features.ai.aiUsagePanel.empty')}
        </div>
      ) : (
        <ul className="ai-usage-days" aria-label={t('features.ai.aiUsagePanel.viewByDay')}>
          {byDay.map((day) => (
            <li key={day.date} className="ai-usage-day">
              <span className="ai-usage-day-date text-mono">{day.date}</span>
              <span className="ai-usage-day-bar">
                <span
                  className="ai-usage-day-fill"
                  style={{ width: `${maxDayTokens > 0 ? Math.max(2, (day.totalTokens / maxDayTokens) * 100) : 0}%` }}
                />
              </span>
              <span className="ai-usage-day-meta text-mono">
                {formatTokens(day.totalTokens)} · {t('features.ai.aiUsagePanel.invocationsCount', { count: day.invocations })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {view === 'day' ? (
        <div className="ai-usage-note">
          <ListTree size={12} aria-hidden="true" />
          {t('features.ai.aiUsagePanel.dayNote')}
        </div>
      ) : null}
    </section>
  );
}
