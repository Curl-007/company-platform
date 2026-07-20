import { useState } from 'react';
import { sendAiChat } from '../../ai/api';
import { ApiError } from '../../../services/api';

interface DeliveryAiPanelProps {
  prompt: string;
  candidateCount: number;
  blockedGateCount: number;
  openDefectCount: number;
  loading: boolean;
  error: unknown;
}

export default function DeliveryAiPanel({
  prompt,
  candidateCount,
  blockedGateCount,
  openDefectCount,
  loading,
  error,
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
    } catch (error) {
      setAiError(error instanceof ApiError ? error.message : 'AI 交付分析生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <section className="delivery-ai-panel">
      <div className="delivery-ai-main">
        <div>
          <div className="section-title">AI 交付参谋</div>
          <div className="body-text">基于构建、发布、质量门禁、未完成需求和缺陷闭环生成发布准备度建议。</div>
        </div>
        <div className="delivery-ai-stats">
          <span>候选 {candidateCount}</span>
          <span>门禁阻断 {blockedGateCount}</span>
          <span>未关闭缺陷 {openDefectCount}</span>
        </div>
      </div>
      <div className="delivery-ai-actions">
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={loading || aiLoading || Boolean(error)}>
          {aiLoading ? 'AI 分析中...' : aiAdvice ? '重新分析交付' : 'AI 交付建议'}
        </button>
      </div>
      {error ? <div className="form-error">交付数据加载失败，暂时无法生成 AI 建议。</div> : null}
      {(aiAdvice || aiLoading || aiError) ? (
        <div className="delivery-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析发布准备度、门禁阻断和缺陷闭环，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="delivery-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
