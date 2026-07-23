import { useMemo, type ReactNode } from 'react';
import { ListChecks, HeartPulse, FlaskConical } from 'lucide-react';
import { fetchDashboard } from '../api';
import { fallbackDashboard } from '../../../data/fallback';
import { useAsync } from '../../../hooks/useAsync';
import MetricStrip from '../../../components/common/MetricStrip';
import Panel from '../../../components/common/Panel';
import PageHeader from '../../../components/common/PageHeader';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import PageState from '../../../components/common/PageState';
import type { DashboardData, Task, Project } from '../../../types';
import {
  healthVariant,
  HEALTH_THRESHOLD_OK,
  TASK_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import { getSessionUser } from '../../../services/auth';
import ActionSummaryItem from './ActionSummaryItem';
import DashboardAiAdvisor from './DashboardAiAdvisor';
import AiSummaryPanel from './AiSummaryPanel';
import RequirementProgressPanel from './RequirementProgressPanel';

const ACTION_TASK_LIMIT = 12;

const taskColumns: DataTableColumn<Task>[] = [
  {
    key: 'title',
    title: '任务',
    render: (task) => <span className="font-medium">{task.title}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
  },
  { key: 'owner', title: '负责人', render: (task) => task.owner || '未分配' },
  { key: 'dueDate', title: '截止日期', render: (task) => task.dueDate || '未设置' },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (task) => <ProgressBar percent={task.progress ?? 0} height={6} />,
  },
];

const riskyColumns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    title: '项目',
    render: (project) => <span className="font-medium">{project.name}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (project) => (
      <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
    ),
  },
  {
    key: 'healthScore',
    title: '健康度',
    align: 'center',
    render: (project) => (
      <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
    ),
  },
  {
    key: 'riskCount',
    title: '风险数',
    align: 'center',
    render: (project) => <span className="text-mono">{project.riskCount}</span>,
  },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
  },
];

function PageHeaderShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <PageHeader
        title="工作台"
        description="集中查看任务、项目健康度、需求推进和 AI 总结。"
      />
      {children}
    </div>
  );
}

export default function DashboardView() {
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchDashboard, [], { cacheKey: 'dashboard:overview' });
  const dashboard = data ?? (error ? fallbackDashboard : null);
  const currentUser = getSessionUser();
  const canUseAi = canOperate(currentUser, 'ai:analyze');

  const heroCards = useMemo(() => {
    if (!dashboard) return [];
    const { metrics } = dashboard;
    const completed = metrics.tasks.done ?? 0;
    const blocked = metrics.tasks.blocked ?? 0;

    return [
      {
        label: '活跃任务',
        value: metrics.tasks.total,
        icon: <ListChecks size={16} />,
        tone: 'info' as const,
        trend: `${completed} 已完成 · ${blocked} 阻塞中`,
        trendDirection: 'flat' as const,
      },
      {
        label: '项目平均健康度',
        value: metrics.projectHealthAverage,
        icon: <HeartPulse size={16} />,
        tone: metrics.projectHealthAverage >= HEALTH_THRESHOLD_OK ? ('success' as const) : ('warning' as const),
        trend: metrics.projectHealthAverage >= HEALTH_THRESHOLD_OK ? '整体稳定' : '需要关注',
        trendDirection: metrics.projectHealthAverage >= HEALTH_THRESHOLD_OK ? ('up' as const) : ('down' as const),
      },
      {
        label: '测试通过率',
        value: `${metrics.testPassRate}%`,
        icon: <FlaskConical size={16} />,
        tone: metrics.testPassRate >= 90 ? ('success' as const) : ('risk' as const),
        trend: metrics.testPassRate >= 90 ? '达到目标' : '低于目标',
        trendDirection: metrics.testPassRate >= 90 ? ('up' as const) : ('down' as const),
      },
    ];
  }, [dashboard]);

  const managementOverview = useMemo(() => {
    if (!dashboard) return [];
    const { metrics } = dashboard;
    return [
      {
        label: '需求完成率',
        value: `${metrics.requirementCompletionAverage}%`,
        caption: '当前需求平均完成进度',
        tone: 'neutral' as const,
      },
      {
        label: '开放风险',
        value: metrics.openRisks,
        caption: metrics.openRisks > 0 ? '需要持续跟进处置' : '当前没有开放风险',
        tone: metrics.openRisks > 0 ? ('risk' as const) : ('success' as const),
      },
      {
        label: '知识文档',
        value: metrics.documentCount,
        caption: '工作区已沉淀文档',
        tone: 'neutral' as const,
      },
    ];
  }, [dashboard]);

  const actionQueue = useMemo(() => {
    if (!dashboard) return { tasks: [] as Task[], blocked: 0, overdue: 0, inFlight: 0, review: 0 };
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const isOverdue = (task: Task) => {
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      return !Number.isNaN(due.getTime()) && due <= today && !['done', 'cancelled'].includes(task.status);
    };

    const weight = (task: Task) => {
      if (task.status === 'blocked') return 0;
      if (isOverdue(task)) return 1;
      if (['code_review', 'testing', 'acceptance'].includes(task.status)) return 2;
      if (task.status === 'in_progress') return 3;
      if (task.status === 'todo') return 4;
      return 9;
    };

    const activeTasks = dashboard.focusTasks
      .filter((task) => !['done', 'cancelled'].includes(task.status))
      .sort((a, b) => {
        const priority = weight(a) - weight(b);
        if (priority !== 0) return priority;
        return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
      });

    return {
      tasks: activeTasks.slice(0, ACTION_TASK_LIMIT),
      blocked: activeTasks.filter((task) => task.status === 'blocked').length,
      overdue: activeTasks.filter(isOverdue).length,
      inFlight: activeTasks.filter((task) => task.status === 'in_progress').length,
      review: activeTasks.filter((task) => ['code_review', 'testing', 'acceptance'].includes(task.status)).length,
    };
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
        <div className="helper-text" style={{ marginBottom: 12, color: 'var(--color-warning, #BF8700)' }}>
          当前展示的是离线兜底数据，暂时未连接到实时接口。
        </div>
      )}

      <MetricStrip variant="hero" items={heroCards} className="dashboard-kpi-strip" />

      <section className="dashboard-management-overview" aria-labelledby="dashboard-overview-heading">
        <header className="dashboard-section-heading dashboard-management-overview__heading">
          <div>
            <h2 id="dashboard-overview-heading" className="dashboard-section-title">管理概览</h2>
            <p className="dashboard-section-description">需求推进、风险敞口与知识沉淀</p>
          </div>
        </header>
        <dl className="dashboard-overview-stats">
          {managementOverview.map((stat) => (
            <div
              key={stat.label}
              className={`dashboard-overview-stat dashboard-overview-stat--${stat.tone}`}
            >
              <dt className="dashboard-overview-stat__label">{stat.label}</dt>
              <dd className="dashboard-overview-stat__value">{stat.value}</dd>
              <dd className="dashboard-overview-stat__caption">{stat.caption}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="dashboard-workspace">
        <section className="dashboard-workspace__primary" aria-labelledby="dashboard-priority-heading">
          <header className="dashboard-section-heading">
            <div>
              <h2 id="dashboard-priority-heading" className="dashboard-section-title">今日优先事项</h2>
              <p className="dashboard-section-description">先处理阻塞与到期事项，再关注项目风险</p>
            </div>
          </header>

          <div className="dashboard-primary-stack">
            <Panel
              title="行动队列"
              subtitle={`展示前 ${ACTION_TASK_LIMIT} 条，按阻塞、逾期、待确认和进行中排序`}
              className="dashboard-action-panel"
            >
              <div className="action-summary-row dashboard-action-summary">
                <ActionSummaryItem label="阻塞" value={actionQueue.blocked} tone="risk" />
                <ActionSummaryItem label="逾期/今日到期" value={actionQueue.overdue} tone="warning" />
                <ActionSummaryItem label="进行中" value={actionQueue.inFlight} tone="info" />
                <ActionSummaryItem label="待确认" value={actionQueue.review} tone="success" />
              </div>
              <div className="dashboard-action-table">
                <DataTable
                  columns={taskColumns}
                  data={actionQueue.tasks}
                  rowKey="id"
                  emptyText="当前没有需要优先处理的任务。"
                />
              </div>
            </Panel>

            <Panel
              title="风险项目"
              subtitle="存在开放风险或健康度偏低的项目"
              className="dashboard-risk-panel"
            >
              <div className="dashboard-risk-table">
                <DataTable
                  columns={riskyColumns}
                  data={dashboard.riskyProjects}
                  rowKey="id"
                  emptyText="当前没有标记为风险的项目。"
                />
              </div>
            </Panel>
          </div>
        </section>

        <aside className="dashboard-workspace__insights" aria-labelledby="dashboard-insights-heading">
          <header className="dashboard-section-heading">
            <div>
              <h2 id="dashboard-insights-heading" className="dashboard-section-title">分析与推进</h2>
              <p className="dashboard-section-description">AI 建议、自动摘要和需求进度</p>
            </div>
          </header>

          <div className="dashboard-insights-stack">
            {canUseAi ? <DashboardAiAdvisor data={dashboard} /> : null}
            <AiSummaryPanel data={dashboard} />
            <RequirementProgressPanel items={dashboard.requirementProgress} />
          </div>
        </aside>
      </div>
    </PageHeaderShell>
  );
}
