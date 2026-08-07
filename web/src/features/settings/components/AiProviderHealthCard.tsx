import { useTranslation } from 'react-i18next';
import type { AiProviderConfig } from '../../../types';
import StatusBadge from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui';
import { aiHealthLabel, aiHealthVariant, formatHealthTime } from '../settingsModel';

export default function AiProviderHealthCard({
  provider,
  loading,
  onRefresh,
}: {
  provider?: AiProviderConfig | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const health = provider?.health;
  const lastError = health?.lastErrorMessage?.trim();
  return (
    <div className={`ai-health-card ${health?.status || 'unknown'}`}>
      <div className="ai-health-head">
        <div>
          <div className="ai-health-title">{t('features.settings.aiProviderHealthCard.title')}</div>
          <div className="ai-health-subtitle">{t('features.settings.aiProviderHealthCard.subtitle')}</div>
        </div>
        <div className="ai-health-actions">
          <StatusBadge label={aiHealthLabel(health?.status)} status={aiHealthVariant(health?.status)} showDot />
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>{t('features.settings.aiProviderHealthCard.refresh')}</Button>
        </div>
      </div>
      <div className="ai-health-grid">
        <div className="ai-health-metric">
          <span>{t('features.settings.aiProviderHealthCard.lastSuccess')}</span>
          <strong>{formatHealthTime(health?.lastSuccessAt)}</strong>
        </div>
        <div className="ai-health-metric">
          <span>{t('features.settings.aiProviderHealthCard.lastFailure')}</span>
          <strong>{formatHealthTime(health?.lastFailureAt)}</strong>
        </div>
        <div className="ai-health-metric">
          <span>{t('features.settings.aiProviderHealthCard.lastLatency')}</span>
          <strong>{health?.lastLatencyMs != null ? t('features.settings.aiProviderHealthCard.latencyValue', { value: health.lastLatencyMs }) : t('features.settings.settingsModel.noRecords')}</strong>
        </div>
        <div className="ai-health-metric">
          <span>{t('features.settings.aiProviderHealthCard.consecutiveFailures')}</span>
          <strong>{health?.consecutiveFailures ?? 0}</strong>
        </div>
      </div>
      <div className="ai-health-foot">
        <span>{t('features.settings.aiProviderHealthCard.lastProtocol', { protocol: health?.lastWireApi === 'responses' ? 'Responses API' : health?.lastWireApi === 'chat_completions' ? 'Chat Completions' : t('features.settings.settingsModel.noRecords') })}</span>
        <span>{t('features.settings.aiProviderHealthCard.lastAttempt', { time: formatHealthTime(health?.lastAttemptAt) })}</span>
      </div>
      {lastError ? (
        <div className="ai-health-error">
          <span>{health?.lastErrorCode ? t('features.settings.aiProviderHealthCard.errorCode', { code: health.lastErrorCode }) : t('features.settings.aiProviderHealthCard.lastErrorReason')}</span>
          <p>{lastError}</p>
        </div>
      ) : null}
    </div>
  );
}
