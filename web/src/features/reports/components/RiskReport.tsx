import Panel from '../../../components/common/Panel';
import DataTable from '../../../components/common/DataTable';
import StatusBadge from '../../../components/common/StatusBadge';
import { useTranslation } from 'react-i18next';
import type { DashboardData } from '../../../types';
import type { ReportModel } from '../reportModel';
import { ActionList, riskyColumns } from './ReportShared';

export default function RiskReport({
  data,
  reportModel,
  healthRankData,
}: {
  data: DashboardData;
  reportModel: ReportModel;
  healthRankData: Array<{ name: string; health: number; id: string }>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Panel title={t('features.reports.riskReport.healthRankTitle')} subtitle={t('features.reports.riskReport.healthRankSubtitle')}>
        {healthRankData.length === 0 ? (
          <p className="text-secondary" style={{ margin: 0 }}>{t('features.reports.riskReport.noRiskProjectsData')}</p>
        ) : (
          <div className="health-rank-list">
            {healthRankData.map((item) => (
              <div key={item.id} className="health-rank-item">
                <span className="health-rank-name font-medium">{item.name}</span>
                <div className="health-rank-bar-track">
                  <div
                    className="health-rank-bar-fill"
                    style={{ width: `${item.health}%`, background: item.health >= 75 ? 'var(--color-success, #16a34a)' : item.health >= 50 ? 'var(--color-warning, #d97706)' : 'var(--color-risk, #dc2626)' }}
                  />
                </div>
                <span className="health-rank-value text-mono">{item.health}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title={t('features.reports.riskReport.riskProjectsTitle')} subtitle={t('features.reports.riskReport.riskProjectsSubtitle')}>
          <DataTable columns={riskyColumns} data={reportModel.riskProjects} rowKey="id" emptyText={t('features.reports.riskReport.noRiskProjects')} />
        </Panel>
        <Panel title={t('features.reports.riskReport.actionListTitle')} subtitle={t('features.reports.riskReport.actionListSubtitle')}>
          <ActionList items={reportModel.actionItems} />
          <div className="mt-16">
            <StatusBadge label={t('features.reports.riskReport.openRisksLabel', { count: data.metrics.openRisks })} variant={data.metrics.openRisks > 0 ? 'risk' : 'success'} />
          </div>
        </Panel>
      </div>
    </>
  );
}
