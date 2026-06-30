import { useState } from 'react';
import { fetchAiBusinessAdvice } from '../../services/resources';
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
  buttonText = 'AI 分析',
  question,
  draft,
  className = '',
}: BusinessAdvicePanelProps) {
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
      setError(err instanceof ApiError ? err.message : 'AI 分析失败，请检查模型配置或稍后重试。');
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
            {advice?.fallback ? ' · 规则兜底' : ''}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={loading || !targetId}>
          {loading ? 'AI 分析中...' : advice ? '重新分析' : buttonText}
        </button>
      </div>
      {(advice || loading || error) ? (
        <div className="business-ai-result">
          {loading ? <div className="body-text">AI 正在读取业务上下文并生成建议，请稍候...</div> : null}
          {error ? <div className="form-error">{error}</div> : null}
          {advice ? (
            <div className="business-ai-content">
              <p>{advice.summary}</p>
              <AdviceList title="风险" items={advice.risks} />
              <AdviceList title="建议" items={advice.suggestions} />
              <AdviceList title="下一步" items={advice.nextActions} />
              <AdviceList title="缺少信息" items={advice.missingInfo} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default BusinessAdvicePanel;
