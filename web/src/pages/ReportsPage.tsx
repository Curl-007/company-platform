import { useMemo } from 'react';
import { fetchDashboard } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import MetricCard from '../components/common/MetricCard';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import type { DashboardData, Project, RequirementProgress } from '../types';

function healthVariant(score: number): 'success' | 'warning' | 'risk' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'risk';
}

// ---------------------------------------------------------------------------
// Risky projects table
// ---------------------------------------------------------------------------

const riskyColumns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    title: '项目名称',
    render: (project) => <span className="font-medium">{project.name}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (project) => <StatusBadge label={project.status} status={project.status} />,
  },
  {
    key: 'healthScore',
    title: '健康度',
    align: 'center',
    sorter: (a, b) => a.healthScore - b.healthScore,
    render: (project) => (
      <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
    ),
  },
  {
    key: 'riskCount',
    title: '风险数',
    align: 'center',
    sorter: (a, b) => a.riskCount - b.riskCount,
    render: (project) => <span className="text-mono">{project.riskCount}</span>,
  },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ReportsPage() {
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchDashboard, []);

  const metricCards = useMemo(() => {
    if (!data) return [];
    const { metrics } = data;
    return [
      {
        label: '项目健康均值',
        value: metrics.projectHealthAverage,
        trend: metrics.projectHealthAverage >= 75 ? '整体健康' : '需要关注',
        direction: metrics.projectHealthAverage >= 75 ? ('up' as const) : ('down' as const),
      },
      {
        label: '需求完成率',
        value: `${metrics.requirementCompletionAverage}%`,
        trend: '跨项目需求平均完成度',
        direction: 'flat' as const,
      },
      {
        label: '测试通过率',
        value: `${metrics.testPassRate}%`,
        trend: metrics.testPassRate >= 90 ? '达标' : '低于目标',
        direction: metrics.testPassRate >= 90 ? ('up' as const) : ('down' as const),
      },
      {
        label: '文档数量',
        value: metrics.documentCount,
        trend: '文档中心总量',
        direction: 'flat' as const,
      },
      {
        label: '开放风险',
        value: metrics.openRisks,
        trend: '全部项目累计',
        direction: metrics.openRisks > 0 ? ('down' as const) : ('flat' as const),
      },
    ];
  }, [data]);

  if (loading || error || !data) {
    return (
      <div>
        <PageHeader title="报表中心" description="项目健康度、需求完成率、测试通过率等综合报表。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="报表中心" description="项目健康度、需求完成率、测试通过率等综合报表。" />

      <div className="metric-grid">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            trend={card.trend}
            trendDirection={card.direction}
          />
        ))}
      </div>

      <div className="grid-2 mt-20">
        <Panel title="风险项目" subtitle="存在开放风险的项目">
          <DataTable
            columns={riskyColumns}
            data={data.riskyProjects}
            rowKey="id"
            emptyText="当前无风险项目。"
          />
        </Panel>

        <RequirementProgressTable items={data.requirementProgress} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirement progress table
// ---------------------------------------------------------------------------

function RequirementProgressTable({ items }: { items: RequirementProgress[] }) {
  return (
    <Panel title="需求进度" subtitle="各需求完成情况追踪">
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>暂无需求进度数据。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((item) => (
            <div key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="font-medium" style={{ minWidth: 0 }}>{item.title}</span>
                <span className="text-secondary text-mono">{item.completion}%</span>
              </div>
              <div className="text-secondary" style={{ fontSize: 12, marginBottom: 4 }}>{item.projectName}</div>
              <ProgressBar percent={item.completion} showPercent={false} height={6} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default ReportsPage;
