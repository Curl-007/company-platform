import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Package, RefreshCw, Rocket, Sparkles } from 'lucide-react';
import { sendAiChat } from '../../ai/api';
import { ApiError } from '../../../services/api';

interface DeliveryAiPanelProps {
  prompt: string;
  candidateCount: number;
  blockedGateCount: number;
  openDefectCount: number;
  loading: boolean;
  error: unknown;
  onReload?: () => void;
}

export default function DeliveryAiPanel({
  prompt,
  candidateCount,
  blockedGateCount,
  openDefectCount,
  loading,
  error,
  onReload,
}: DeliveryAiPanelProps) {
  const { t } = useTranslation();
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reply = await sendAiChat({
        messages: [{ role: 'user', content: prompt }],
        scope: 'delivery-readiness-advice',
        currentPage: 'delivery',
      });
      setAiAdvice(reply.content);
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : t('features.delivery.deliveryAiPanel.analyzeFailed'));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <section className="dl-ai-panel delivery-ai-panel">
      <div className="dl-ai-head">
        <div className="dl-ai-copy">
          <div className="section-title dl-ai-title">
            <Sparkles size={15} aria-hidden="true" />
            {t('features.delivery.deliveryAiPanel.title')}
          </div>
          <div className="body-text">{t('features.delivery.deliveryAiPanel.description')}</div>
        </div>
        <div className="dl-ai-actions">
          {onReload ? (
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={onReload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" />
              {loading ? t('common.loading') : t('features.delivery.deliveryAiPanel.refreshSnapshot')}
            </button>
          ) : null}
          <button
            className="btn btn-primary btn-sm btn-with-icon"
            onClick={handleAnalyze}
            disabled={loading || aiLoading || Boolean(error)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {aiLoading ? t('features.delivery.deliveryAiPanel.analyzing') : aiAdvice ? t('common.reanalyze') : t('features.delivery.deliveryAiPanel.advice')}
          </button>
        </div>
      </div>

      <div className="dl-ai-signals" aria-label={t('features.delivery.deliveryAiPanel.snapshotAria')}>
        <div className={`dl-ai-signal ${candidateCount > 0 ? 'is-info' : ''}`}>
          <span><Package size={13} aria-hidden="true" /> {t('features.delivery.deliveryAiPanel.candidatesLabel')}</span>
          <strong>{candidateCount}</strong>
          <em>{t('features.delivery.deliveryAiPanel.canRelease')}</em>
        </div>
        <div className={`dl-ai-signal ${blockedGateCount > 0 ? 'is-warn' : ''}`}>
          <span><AlertTriangle size={13} aria-hidden="true" /> {t('features.delivery.deliveryAiPanel.blockedGates')}</span>
          <strong>{blockedGateCount}</strong>
          <em>{t('features.delivery.deliveryAiPanel.gateNotPassed')}</em>
        </div>
        <div className={`dl-ai-signal ${openDefectCount > 0 ? 'is-warn' : ''}`}>
          <span><Rocket size={13} aria-hidden="true" /> {t('features.delivery.deliveryAiPanel.openDefects')}</span>
          <strong>{openDefectCount}</strong>
          <em>{t('features.delivery.deliveryAiPanel.affectsRelease')}</em>
        </div>
      </div>

      {error ? <div className="form-error">{t('features.delivery.deliveryAiPanel.dataLoadFailed')}</div> : null}

      {(aiAdvice || aiLoading || aiError) ? (
        <div className="delivery-ai-result dl-ai-result">
          {aiLoading ? <div className="body-text">{t('features.delivery.deliveryAiPanel.analyzingDesc')}</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="delivery-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
