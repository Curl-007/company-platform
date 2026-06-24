import { useMemo, type ReactNode } from 'react';
import { ListChecks, HeartPulse, FlaskConical } from 'lucide-react';
import { fetchDashboard } from '../services/resources';
import { fallbackDashboard } from '../data/fallback';
import { useAsync } from '../hooks/useAsync';
import MetricCard, { type MetricCardTone } from '../components/common/MetricCard';
import Panel from '../components/common/Panel';
import PageHeader from '../components/common/PageHeader';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import PageState from '../components/common/PageState';
import type { DashboardData, Task, Project, RequirementProgress } from '../types';

function healthVariant(score: number): 'success' | 'warning' | 'risk' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'risk';
}

const taskColumns: DataTableColumn<Task>[] = [
  {
    key: 'title',
    title: 'Task',
    render: (task) => <span className="font-medium">{task.title}</span>,
  },
  {
    key: 'status',
    title: 'Status',
    render: (task) => <StatusBadge label={task.statusText || task.status} status={task.status} />,
  },
  { key: 'owner', title: 'Owner', render: (task) => task.owner || '—' },
  { key: 'dueDate', title: 'Due', render: (task) => task.dueDate || '—' },
  {
    key: 'progress',
    title: 'Progress',
    width: 160,
    render: (task) => <ProgressBar percent={task.progress ?? 0} height={6} />,
  },
];

const riskyColumns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    title: 'Project',
    render: (project) => <span className="font-medium">{project.name}</span>,
  },
  {
    key: 'status',
    title: 'Status',
    render: (project) => <StatusBadge label={project.status} status={project.status} />,
  },
  {
    key: 'healthScore',
    title: 'Health',
    align: 'center',
    render: (project) => (
      <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
    ),
  },
  {
    key: 'riskCount',
    title: 'Risks',
    align: 'center',
    render: (project) => <span className="text-mono">{project.riskCount}</span>,
  },
  {
    key: 'progress',
    title: 'Progress',
    width: 160,
    render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
  },
];

function DashboardPage() {
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchDashboard, []);

  // Degrade to fallback data only on hard failure, so the shell still renders.
  const dashboard = data ?? (error ? fallbackDashboard : null);

  const heroCards = useMemo(() => {
    if (!dashboard) return [];
    const { metrics } = dashboard;
    const completed = metrics.tasks.done ?? 0;
    const blocked = metrics.tasks.blocked ?? 0;
    const cards: Array<{
      label: string;
      value: string | number;
      icon: ReactNode;
      tone: MetricCardTone;
      trend: string;
      direction: 'up' | 'down' | 'flat';
    }> = [
      {
        label: '活跃任务',
        value: metrics.tasks.total,
        icon: <ListChecks size={16} />,
        tone: 'info',
        trend: `${completed} 已完成 · ${blocked} 阻塞`,
        direction: 'flat',
      },
      {
        label: '项目健康均值',
        value: metrics.projectHealthAverage,
        icon: <HeartPulse size={16} />,
        tone: metrics.projectHealthAverage >= 75 ? 'success' : 'warning',
        trend: metrics.projectHealthAverage >= 75 ? '整体健康' : '需要关注',
        direction: metrics.projectHealthAverage >= 75 ? 'up' : 'down',
      },
      {
        label: '测试通过率',
        value: `${metrics.testPassRate}%`,
        icon: <FlaskConical size={16} />,
        tone: metrics.testPassRate >= 90 ? 'success' : 'risk',
        trend: metrics.testPassRate >= 90 ? '达标' : '低于目标',
        direction: metrics.testPassRate >= 90 ? 'up' : 'down',
      },
    ];
    return cards;
  }, [dashboard]);

  const secondaryStats = useMemo(() => {
    if (!dashboard) return [];
    const { metrics } = dashboard;
    return [
      { label: '需求完成率', value: `${metrics.requirementCompletionAverage}%`, direction: 'flat' as const },
      { label: '开放风险', value: metrics.openRisks, direction: metrics.openRisks > 0 ? ('down' as const) : ('flat' as const) },
      { label: '文档总数', value: metrics.documentCount, direction: 'flat' as const },
    ];
  }, [dashboard]);

  if (loading) {
    return (
      <PageHeaderShell>
        <PageState loading error={null} onRetry={reload} />
      </PageHeaderShell>
    );
  }

  if (!dashboard) {
    return (
      <PageHeaderShell>
        <PageState loading={false} error={error} onRetry={reload} />
      </PageHeaderShell>
    );
  }

  return (
    <PageHeaderShell>
      {error && (
        <div className="helper-text" style={{ marginBottom: 12, color: 'var(--color-amber, #b45309)' }}>
          Showing offline data — the live API could not be reached.
        </div>
      )}

      <div className="kpi-hero-grid">
        {heroCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            size="hero"
            trend={card.trend}
            trendDirection={card.direction}
          />
        ))}
      </div>

      <div className="kpi-secondary">
        {secondaryStats.map((stat) => (
          <div key={stat.label} className="kpi-secondary-item">
            <span className="kpi-secondary-label">{stat.label}</span>
            <span className={`kpi-secondary-value ${stat.direction}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid-2-1 mt-20">
        <div className="stack">
          <Panel title="Focus Tasks" subtitle="Tasks that need attention right now">
            <DataTable
              columns={taskColumns}
              data={dashboard.focusTasks}
              rowKey="id"
              emptyText="No focus tasks — you're all caught up."
            />
          </Panel>

          <Panel title="Risky Projects" subtitle="Projects with one or more open risks">
            <DataTable
              columns={riskyColumns}
              data={dashboard.riskyProjects}
              rowKey="id"
              emptyText="No projects currently flagged with risks."
            />
          </Panel>
        </div>

        <div className="stack">
          <AiSummaryPanel data={dashboard} />
          <RequirementProgressPanel items={dashboard.requirementProgress} />
        </div>
      </div>
    </PageHeaderShell>
  );
}

function PageHeaderShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Workspace"
        description="Overview of tasks, project health, requirements, and AI insights."
      />
      {children}
    </div>
  );
}

function AiSummaryPanel({ data }: { data: DashboardData }) {
  const { ai } = data;
  return (
    <Panel title={ai.title || 'AI Summary'} subtitle="Generated insight for your workspace">
      <p className="body-text" style={{ marginTop: 0 }}>{ai.summary}</p>

      {ai.risks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">Risks</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {ai.risks.map((risk, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {ai.recommendations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">Recommendations</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {ai.recommendations.map((rec, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function RequirementProgressPanel({ items }: { items: RequirementProgress[] }) {
  return (
    <Panel title="Requirement Progress" subtitle="Completion across tracked requirements">
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>No requirements are being tracked yet.</p>
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

export default DashboardPage;
