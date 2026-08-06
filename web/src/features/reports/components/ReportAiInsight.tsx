import { useState } from 'react';
import { sendAiChat } from '../../ai/api';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import type { DashboardData } from '../../../types';
import { buildReportsAiPrompt, type ReportModel, type ReportView } from '../reportModel';

export default function ReportAiInsight({
  data,
  reportModel,
  view,
}: {
  data: DashboardData;
  reportModel: ReportModel;
  view: ReportView;
}) {
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reply = await sendAiChat({
        messages: [
          {
            role: 'user',
            content: buildReportsAiPrompt(data, reportModel, view),
          },
        ],
        scope: 'reports-management-insight',
        currentPage: `reports:${view}`,
      });
      setAiInsight(reply.content);
    } catch (err: unknown) {
      setAiError(err instanceof ApiError ? err.message : 'AI 报表解读生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  const viewLabel = view === 'overview' ? '经营概览' : view === 'risk' ? '风险分析' : '交付追踪';

  return (
    <Panel
      title="AI 报表解读"
      subtitle={`当前视图：${viewLabel} · 面向管理层输出结论与动作`}
      className="report-ai-panel"
      toolbar={(
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={aiLoading}>
          {aiLoading ? 'AI 解读中...' : aiInsight ? '重新解读' : '生成解读'}
        </button>
      )}
    >
      <div className="report-ai-signal-row">
        <span>健康 {data.metrics.projectHealthAverage}</span>
        <span>需求 {data.metrics.requirementCompletionAverage}%</span>
        <span>测试 {data.metrics.testPassRate}%</span>
        <span>阻塞 {reportModel.blockedRate}%</span>
      </div>
      {(aiInsight || aiLoading || aiError) ? (
        <div className="report-ai-result">
          {aiLoading ? <div className="body-text">AI 正在解读当前报表指标、风险项目和交付趋势，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiInsight ? <div className="report-ai-content">{aiInsight}</div> : null}
        </div>
      ) : (
        <p className="body-text report-ai-empty">点击生成后，会输出可用于周会/经营会的报表结论、异常指标和管理动作。</p>
      )}
    </Panel>
  );
}
