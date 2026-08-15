import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ListTree, Radio, X } from 'lucide-react';
import StatusBadge from '../../../components/common/StatusBadge';
import { useInvocationTrace } from '../hooks/useInvocationTrace';
import {
  formatInvocationRelativeTime,
  invocationStatusLabel,
  previewJson,
} from '../models/harnessModel';
import AiInvocationEventList from './AiInvocationEventList';

/**
 * Slide-over drawer with the dsh execution trace of one capability invocation:
 * header summary (status/capability/time/error code), vertical event timeline,
 * token usage bar, and a collapsed JSON result preview. Data and realtime
 * merging live in useInvocationTrace; this component only renders.
 */
export default function AiInvocationTimeline({
  invocationId,
  onClose,
}: {
  invocationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { detailQuery, detail, events, liveMode, invocationRunning } = useInvocationTrace({ invocationId });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const usage = detail?.tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const usageTotal = usage.totalTokens || (usage.promptTokens + usage.completionTokens);
  const resultPreview = useMemo(() => (detail?.result ? previewJson(detail.result) : null), [detail?.result]);

  return (
    <>
      <div className="ai-invocation-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="ai-invocation-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('features.ai.aiInvocationTimeline.title')}
      >
        <header className="ai-invocation-header">
          <div className="ai-invocation-header-row">
            <span className="ai-invocation-title">
              <Activity size={15} aria-hidden="true" />
              {t('features.ai.aiInvocationTimeline.title')}
            </span>
            <button
              type="button"
              className="btn btn-text btn-sm"
              onClick={onClose}
              aria-label={t('features.ai.aiInvocationTimeline.close')}
              title={t('features.ai.aiInvocationTimeline.close')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="ai-invocation-header-row">
            <StatusBadge
              label={detail ? invocationStatusLabel(detail.status) : t('features.ai.aiInvocationTimeline.loading')}
              status={detail?.status}
              showDot
            />
            {liveMode === 'live' ? (
              <span
                className="ai-invocation-live-badge"
                title={t('features.ai.aiInvocationTimeline.liveBadgeTitle')}
              >
                <Radio size={11} aria-hidden="true" />
                {t('features.ai.aiInvocationTimeline.liveBadge')}
              </span>
            ) : null}
            <span className="text-mono ai-invocation-meta-id">{invocationId}</span>
          </div>
          <div className="ai-invocation-meta">
            {detail?.capabilityId ? (
              <span>
                {t('features.ai.aiInvocationTimeline.capability')}
                <span className="text-mono">{detail.capabilityId}</span>
                {detail.capabilityVersion ? <span className="text-mono">v{detail.capabilityVersion}</span> : null}
              </span>
            ) : null}
            {detail?.createdAt ? (
              <span>{formatInvocationRelativeTime(detail.createdAt)}</span>
            ) : null}
            {detail?.errorCode ? (
              <span>
                {t('features.ai.aiInvocationTimeline.errorCode')}
                <span className="text-mono">{detail.errorCode}</span>
              </span>
            ) : null}
          </div>
        </header>

        <div className="ai-invocation-body">
          <div className="ai-invocation-section-title">
            <ListTree size={13} aria-hidden="true" />
            {t('features.ai.aiInvocationTimeline.eventsTitle')}
          </div>

          {detailQuery.isError ? (
            <div className="ai-invocation-empty" role="status">
              {t('features.ai.aiInvocationTimeline.loadFailed')}
            </div>
          ) : !detail ? (
            <div className="ai-invocation-empty" role="status">
              {t('features.ai.aiInvocationTimeline.loading')}
            </div>
          ) : events.length === 0 ? (
            <div className="ai-invocation-empty">{t('features.ai.aiInvocationTimeline.emptyEvents')}</div>
          ) : (
            <AiInvocationEventList events={events} />
          )}
        </div>

        <footer className="ai-invocation-footer">
          <div className="ai-invocation-usage" aria-label={t('features.ai.aiInvocationTimeline.tokenUsageTitle')}>
            <span className="ai-invocation-section-title" style={{ marginBottom: 0 }}>
              {t('features.ai.aiInvocationTimeline.tokenUsageTitle')}
            </span>
            <div className="ai-invocation-usage-bar">
              <div
                className="ai-invocation-usage-segment is-prompt"
                style={{ width: `${usageTotal > 0 ? (usage.promptTokens / usageTotal) * 100 : 0}%` }}
              />
              <div
                className="ai-invocation-usage-segment is-completion"
                style={{ width: `${usageTotal > 0 ? (usage.completionTokens / usageTotal) * 100 : 0}%` }}
              />
            </div>
            <div className="ai-invocation-usage-legend">
              <span>{t('features.ai.aiInvocationTimeline.promptTokens', { tokens: usage.promptTokens })}</span>
              <span>{t('features.ai.aiInvocationTimeline.completionTokens', { tokens: usage.completionTokens })}</span>
              <span>{t('features.ai.aiInvocationTimeline.totalTokens', { tokens: usageTotal })}</span>
            </div>
          </div>

          {resultPreview ? (
            <details className="ai-invocation-result">
              <summary>
                {t('features.ai.aiInvocationTimeline.resultTitle')}
                {resultPreview.truncated ? t('features.ai.aiInvocationTimeline.resultTruncated') : ''}
              </summary>
              <pre>{resultPreview.text}</pre>
            </details>
          ) : null}

          {liveMode === 'fallback' && invocationRunning ? (
            <div className="ai-invocation-live-note" role="status">
              {t('features.ai.aiInvocationTimeline.liveFallback')}
            </div>
          ) : null}
        </footer>
      </aside>
    </>
  );
}
