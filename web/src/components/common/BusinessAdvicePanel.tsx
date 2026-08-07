import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAiBusinessAdvice } from '../../features/ai/api';
import { ApiError } from '../../services/api';
import type { AiBusinessAdvice, AiBusinessAdviceInput } from '../../types';

interface BusinessAdvicePanelProps {
  targetType: AiBusinessAdviceInput['targetType'];
  targetId: string;
  title: string;
  description: string;
  buttonText?: string;
  question?: string;
  draft?: () => Record<string, unknown>;
  className?: string;
}

function AdviceList({ title, items }: { title: string; items?: string[] }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="business-ai-block">
      <strong>{title}</strong>
      <ul>
        {list.map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function BusinessAdvicePanel({
  targetType,
  targetId,
  title,
  description,
  buttonText,
  question,
  draft,
  className = '',
}: BusinessAdvicePanelProps) {
  const { t } = useTranslation();
  const resolvedButtonText = buttonText ?? t('common.aiAnalyze');
  const [advice, setAdvice] = useState<AiBusinessAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!targetId) return;
    setError(null);
    setLoading(true);
    try {
      const result = await fetchAiBusinessAdvice({
        targetType,
        targetId,
        question,
        draft: draft ? draft() : undefined,
      });
      setAdvice(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.aiAnalyzeFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`business-ai-panel ${className}`}>
      <div className="business-ai-head">
        <div>
          <div className="section-title">{advice?.title || title}</div>
          <div className="body-text">
            {description}
            {advice?.modelUsed ? ` · ${advice.modelUsed}` : ''}
            {advice?.fallback ? t('common.ruleFallback') : ''}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={loading || !targetId}>
          {loading ? t('common.aiAnalyzing') : advice ? t('common.reanalyze') : resolvedButtonText}
        </button>
      </div>
      {(advice || loading || error) ? (
        <div className="business-ai-result">
          {loading ? <div className="body-text">{t('common.aiReadingContext')}</div> : null}
          {error ? <div className="form-error">{error}</div> : null}
          {advice ? (
            <div className="business-ai-content">
              <p>{advice.summary}</p>
              <AdviceList title={t('common.risks')} items={advice.risks} />
              <AdviceList title={t('common.suggestions')} items={advice.suggestions} />
              <AdviceList title={t('common.nextSteps')} items={advice.nextActions} />
              <AdviceList title={t('common.missingInfo')} items={advice.missingInfo} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default BusinessAdvicePanel;
