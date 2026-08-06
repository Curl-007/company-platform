import { useState } from 'react';
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
      setAiError(err instanceof ApiError ? err.message : 'AI 交付分析生成失败，请检查模型配置或稍后重试。');
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
            AI 交付参谋
          </div>
          <div className="body-text">基于构建、发布、门禁、需求和缺陷闭环，给出发布准备度建议。</div>
        </div>
        <div className="dl-ai-actions">
          {onReload ? (
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={onReload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" />
              {loading ? '加载中' : '刷新快照'}
            </button>
          ) : null}
          <button
            className="btn btn-primary btn-sm btn-with-icon"
            onClick={handleAnalyze}
            disabled={loading || aiLoading || Boolean(error)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {aiLoading ? '分析中...' : aiAdvice ? '重新分析' : 'AI 交付建议'}
          </button>
        </div>
      </div>

      <div className="dl-ai-signals" aria-label="交付 AI 快照">
        <div className={`dl-ai-signal ${candidateCount > 0 ? 'is-info' : ''}`}>
          <span><Package size={13} aria-hidden="true" /> 候选版本</span>
          <strong>{candidateCount}</strong>
          <em>可推进发布</em>
        </div>
        <div className={`dl-ai-signal ${blockedGateCount > 0 ? 'is-warn' : ''}`}>
          <span><AlertTriangle size={13} aria-hidden="true" /> 门禁阻断</span>
          <strong>{blockedGateCount}</strong>
          <em>准入未通过</em>
        </div>
        <div className={`dl-ai-signal ${openDefectCount > 0 ? 'is-warn' : ''}`}>
          <span><Rocket size={13} aria-hidden="true" /> 未关闭缺陷</span>
          <strong>{openDefectCount}</strong>
          <em>影响发布判断</em>
        </div>
      </div>

      {error ? <div className="form-error">交付数据加载失败，暂时无法生成 AI 建议。</div> : null}

      {(aiAdvice || aiLoading || aiError) ? (
        <div className="delivery-ai-result dl-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析发布准备度、门禁阻断和缺陷闭环…</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="delivery-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
