import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setAiError(err instanceof ApiError ? err.message : t('features.reports.reportAiInsight.analyzeFailed'));
    } finally {
      setAiLoading(false);
    }
  }

  const viewLabel = view === 'overview' ? t('features.reports.reportModel.viewOverview') : view === 'risk' ? t('features.reports.reportModel.viewRisk') : t('features.reports.reportModel.viewDelivery');

  return (
    <Panel
      title={t('features.reports.reportAiInsight.title')}
      subtitle={t('features.reports.reportAiInsight.viewSubtitle', { label: viewLabel })}
      className="report-ai-panel"
      toolbar={(
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={aiLoading}>
          {aiLoading ? t('features.reports.reportAiInsight.analyzing') : aiInsight ? t('features.reports.reportAiInsight.reanalyze') : t('features.reports.reportAiInsight.generate')}
        </button>
      )}
    >
      <div className="report-ai-signal-row">
        <span>{t('features.reports.reportAiInsight.healthValue', { value: data.metrics.projectHealthAverage })}</span>
        <span>{t('features.reports.reportAiInsight.requirementValue', { value: data.metrics.requirementCompletionAverage })}</span>
        <span>{t('features.reports.reportAiInsight.testValue', { value: data.metrics.testPassRate })}</span>
        <span>{t('features.reports.reportAiInsight.blockedValue', { value: reportModel.blockedRate })}</span>
      </div>
      {(aiInsight || aiLoading || aiError) ? (
        <div className="report-ai-result">
          {aiLoading ? <div className="body-text">{t('features.reports.reportAiInsight.analyzingDesc')}</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiInsight ? <div className="report-ai-content">{aiInsight}</div> : null}
        </div>
      ) : (
        <p className="body-text report-ai-empty">{t('features.reports.reportAiInsight.emptyHint')}</p>
      )}
    </Panel>
  );
}
