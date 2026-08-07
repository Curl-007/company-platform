import { useTranslation } from 'react-i18next';
import StatusBadge from '../../../components/common/StatusBadge';
import { formatTestTime, type AiTestState } from '../settingsModel';

export default function AiProviderTestResultCard({ result, testing }: { result: AiTestState; testing: boolean }) {
  const { t } = useTranslation();
  const statusLabel = testing
    ? t('features.settings.aiProviderTestResultCard.testing')
    : result.status === 'success'
      ? t('features.settings.aiProviderTestResultCard.connected')
      : result.status === 'error'
        ? t('features.settings.aiProviderTestResultCard.connectFailed')
        : t('features.settings.aiProviderTestResultCard.pending');
  const status = testing
    ? 'info'
    : result.status === 'success'
      ? 'success'
      : result.status === 'error'
        ? 'risk'
        : 'warning';

  return (
    <div className={`ai-test-card ${testing ? 'testing' : result.status}`}>
      <div className="ai-test-card-head">
        <StatusBadge label={statusLabel} status={status} showDot />
        <span>{result.status === 'idle' ? t('features.settings.aiProviderTestResultCard.notVerified') : formatTestTime(result.testedAt)}</span>
      </div>
      <p>{result.message}</p>
      {result.status === 'success' ? (
        <div className="ai-test-card-grid">
          <span>{t('features.settings.aiProviderTestResultCard.latency')} <strong>{result.latencyMs}ms</strong></span>
          <span>{t('features.settings.aiProviderTestResultCard.sample')} <strong>{result.sample}</strong></span>
        </div>
      ) : null}
    </div>
  );
}
