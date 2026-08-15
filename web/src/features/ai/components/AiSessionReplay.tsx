import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { History, RefreshCw } from 'lucide-react';
import { fetchAiSession, fetchAiSessions } from '../api/sessions';
import { formatInvocationRelativeTime, toInvocationEventViews } from '../models/harnessModel';
import AiInvocationEventList from './AiInvocationEventList';

/**
 * Read-only dsh session replay (admin): the recent session list expands into
 * the same event rendering the live invocation trace uses — no websocket, no
 * polling; data comes from GET /api/ai/sessions and /api/ai/sessions/:id.
 */
export default function AiSessionReplay() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['ai', 'sessions'],
    queryFn: ({ signal }) => fetchAiSessions(20, signal),
  });
  const sessions = sessionsQuery.data ?? [];

  const sessionQuery = useQuery({
    queryKey: ['ai', 'session-replay', expandedId],
    queryFn: ({ signal }) => fetchAiSession(expandedId as string, signal),
    enabled: Boolean(expandedId),
  });

  const replayEvents = sessionQuery.data ? toInvocationEventViews(sessionQuery.data.events) : [];

  return (
    <section className="ai-session-replay" aria-label={t('features.ai.aiSessionReplay.title')}>
      <div className="ai-session-header">
        <div className="ai-session-heading">
          <History size={14} aria-hidden="true" />
          <strong>{t('features.ai.aiSessionReplay.title')}</strong>
          <em>{t('features.ai.aiSessionReplay.subtitle')}</em>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={sessionsQuery.isFetching}
          onClick={() => { void queryClient.invalidateQueries({ queryKey: ['ai', 'sessions'] }); }}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {t('features.ai.aiSessionReplay.refresh')}
        </button>
      </div>

      {sessionsQuery.isError ? (
        <div className="ai-session-state is-error" role="status">
          {t('features.ai.aiSessionReplay.loadFailed')}
        </div>
      ) : sessionsQuery.isPending ? (
        <div className="ai-session-state" role="status">
          {t('features.ai.aiSessionReplay.loading')}
        </div>
      ) : sessions.length === 0 ? (
        <div className="ai-session-state" role="status">
          {t('features.ai.aiSessionReplay.empty')}
        </div>
      ) : (
        <ul className="ai-session-list">
          {sessions.map((session) => {
            const expanded = session.id === expandedId;
            return (
              <li key={session.id} className={`ai-session-item ${expanded ? 'is-expanded' : ''}`}>
                <button
                  type="button"
                  className="ai-session-row"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : session.id)}
                >
                  <span className="text-mono ai-session-id">{session.id}</span>
                  <span className="ai-session-meta">
                    <span title={t('features.ai.aiSessionReplay.startedAt')}>
                      {formatInvocationRelativeTime(session.startedAt)}
                    </span>
                    <span title={t('features.ai.aiSessionReplay.lastEventAt')}>
                      {formatInvocationRelativeTime(session.lastEventAt)}
                    </span>
                  </span>
                  <span className="ai-session-count">
                    {t('features.ai.aiSessionReplay.eventCount', { count: session.eventCount })}
                  </span>
                  <span className="ai-session-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                </button>
                {expanded ? (
                  sessionQuery.isError ? (
                    <div className="ai-session-state is-error" role="status">
                      {t('features.ai.aiSessionReplay.sessionLoadFailed')}
                    </div>
                  ) : sessionQuery.isPending || !sessionQuery.data ? (
                    <div className="ai-session-state" role="status">
                      {t('features.ai.aiSessionReplay.sessionLoading')}
                    </div>
                  ) : replayEvents.length === 0 ? (
                    <div className="ai-session-state" role="status">
                      {t('features.ai.aiSessionReplay.emptyEvents')}
                    </div>
                  ) : (
                    <AiInvocationEventList events={replayEvents} />
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
