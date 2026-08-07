import Panel from '../../../components/common/Panel';
import DonutChart from '../../../components/common/DonutChart';
import { useTranslation } from 'react-i18next';
import type { DashboardData } from '../../../types';
import type { ReportModel } from '../reportModel';
import { ActionList, ProgressLine } from './ReportShared';

export default function OverviewReport({
  data,
  reportModel,
}: {
  data: DashboardData;
  reportModel: ReportModel;
}) {
  const { t } = useTranslation();
  return (
    <div className="reports-overview-stack">
      <div className="action-summary-row">
        {reportModel.healthBuckets.map((bucket) => (
          <div key={bucket.label} className={`action-summary-item ${bucket.tone}`}>
            <span>{t('features.reports.overviewReport.bucketProjects', { label: bucket.label })}</span>
            <strong>{bucket.count}</strong>
          </div>
        ))}
        <div className={`action-summary-item ${reportModel.blockedRate > 0 ? 'warning' : 'success'}`}>
          <span>{t('features.reports.overviewReport.blockedTasks')}</span>
          <strong>{reportModel.blockedRate}%</strong>
        </div>
      </div>

      <div className="grid-2">
        <Panel title={t('features.reports.overviewReport.keyMetricsTitle')} subtitle={t('features.reports.overviewReport.keyMetricsSubtitle')}>
          <div className="donut-row">
            <div className="donut-cell">
              <DonutChart value={data.metrics.projectHealthAverage} label={t('features.reports.overviewReport.projectHealthLabel')} size={120} />
              <span className="donut-caption">{t('features.reports.overviewReport.projectHealthCaption')}</span>
            </div>
            <div className="donut-cell">
              <DonutChart value={data.metrics.testPassRate} label={t('features.reports.overviewReport.testPassLabel')} size={120} />
              <span className="donut-caption">{t('features.reports.overviewReport.testPassCaption')}</span>
            </div>
            <div className="donut-cell">
              <DonutChart value={data.metrics.requirementCompletionAverage} label={t('features.reports.overviewReport.requirementCompletionLabel')} size={120} />
              <span className="donut-caption">{t('features.reports.overviewReport.requirementCompletionCaption')}</span>
            </div>
          </div>
        </Panel>
        <Panel title={t('features.reports.overviewReport.taskDeliveryTitle')} subtitle={t('features.reports.overviewReport.taskDeliverySubtitle', { rate: reportModel.doneRate })}>
          <div className="reports-progress-stack">
            <ProgressLine label={t('features.reports.overviewReport.doneLabel')} value={Number(reportModel.taskCounts.done ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="success" />
            <ProgressLine label={t('features.reports.overviewReport.inProgressLabel')} value={Number(reportModel.taskCounts.in_progress ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="info" />
            <ProgressLine label={t('features.reports.overviewReport.blockedLabel')} value={Number(reportModel.taskCounts.blocked ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="risk" />
            <ProgressLine label={t('features.reports.overviewReport.acceptanceLabel')} value={Number(reportModel.taskCounts.acceptance ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="warning" />
          </div>
        </Panel>
      </div>

      <Panel title={t('features.reports.overviewReport.actionAdviceTitle')} subtitle={t('features.reports.overviewReport.actionAdviceSubtitle')}>
        <ActionList items={reportModel.actionItems} />
      </Panel>
    </div>
  );
}
