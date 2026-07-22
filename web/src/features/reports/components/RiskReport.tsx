import Panel from '../../../components/common/Panel';
import DataTable from '../../../components/common/DataTable';
import StatusBadge from '../../../components/common/StatusBadge';
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
  return (
    <>
      <Panel title="风险项目健康度排名" subtitle="按健康度降序" className="mt-20">
        {healthRankData.length === 0 ? (
          <p className="text-secondary" style={{ margin: 0 }}>当前没有风险项目数据。</p>
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

      <div className="grid-2 mt-20">
        <Panel title="风险项目" subtitle="存在开放风险的项目">
          <DataTable columns={riskyColumns} data={reportModel.riskProjects} rowKey="id" emptyText="当前没有风险项目。" />
        </Panel>
        <Panel title="风险处置清单" subtitle="优先处理低健康度、高风险数项目">
          <ActionList items={reportModel.actionItems} />
          <div className="mt-16">
            <StatusBadge label={`开放风险 ${data.metrics.openRisks}`} variant={data.metrics.openRisks > 0 ? 'risk' : 'success'} />
          </div>
        </Panel>
      </div>
    </>
  );
}
