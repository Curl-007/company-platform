import StatusBadge from '../../../components/common/StatusBadge';
import { formatTestTime, type AiTestState } from '../settingsModel';

export default function AiProviderTestResultCard({ result, testing }: { result: AiTestState; testing: boolean }) {
  const statusLabel = testing
    ? '测试中'
    : result.status === 'success'
      ? '连接成功'
      : result.status === 'error'
        ? '连接失败'
        : '待测试';
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
        <span>{result.status === 'idle' ? '未完成连接验证' : formatTestTime(result.testedAt)}</span>
      </div>
      <p>{result.message}</p>
      {result.status === 'success' ? (
        <div className="ai-test-card-grid">
          <span>耗时 <strong>{result.latencyMs}ms</strong></span>
          <span>样例 <strong>{result.sample}</strong></span>
        </div>
      ) : null}
    </div>
  );
}
