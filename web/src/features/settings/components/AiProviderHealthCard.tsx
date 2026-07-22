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
  const health = provider?.health;
  const lastError = health?.lastErrorMessage?.trim();
  return (
    <div className={`ai-health-card ${health?.status || 'unknown'}`}>
      <div className="ai-health-head">
        <div>
          <div className="ai-health-title">AI 健康状态</div>
          <div className="ai-health-subtitle">记录最近一次真实模型调用与供应商异常，兜底成功也会保留失败原因。</div>
        </div>
        <div className="ai-health-actions">
          <StatusBadge label={aiHealthLabel(health?.status)} status={aiHealthVariant(health?.status)} showDot />
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>刷新</Button>
        </div>
      </div>
      <div className="ai-health-grid">
        <div className="ai-health-metric">
          <span>最近成功</span>
          <strong>{formatHealthTime(health?.lastSuccessAt)}</strong>
        </div>
        <div className="ai-health-metric">
          <span>最近失败</span>
          <strong>{formatHealthTime(health?.lastFailureAt)}</strong>
        </div>
        <div className="ai-health-metric">
          <span>最近耗时</span>
          <strong>{health?.lastLatencyMs != null ? `${health.lastLatencyMs}ms` : '暂无记录'}</strong>
        </div>
        <div className="ai-health-metric">
          <span>连续失败</span>
          <strong>{health?.consecutiveFailures ?? 0}</strong>
        </div>
      </div>
      <div className="ai-health-foot">
        <span>最近协议：{health?.lastWireApi === 'responses' ? 'Responses API' : health?.lastWireApi === 'chat_completions' ? 'Chat Completions' : '暂无记录'}</span>
        <span>最近尝试：{formatHealthTime(health?.lastAttemptAt)}</span>
      </div>
      {lastError ? (
        <div className="ai-health-error">
          <span>{health?.lastErrorCode ? `错误 ${health.lastErrorCode}` : '最近失败原因'}</span>
          <p>{lastError}</p>
        </div>
      ) : null}
    </div>
  );
}
