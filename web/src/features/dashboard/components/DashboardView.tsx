import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardList,
  FileText,
  FolderKanban,
  HeartPulse,
  ListTodo,
  Search,
  TestTube2,
} from 'lucide-react';
import { fetchDashboard } from '../api';
import { fetchProjects } from '../../projects/api';
import { fallbackDashboard } from '../../../data/fallback';
import { useAsync } from '../../../hooks/useAsync';
import Panel from '../../../components/common/Panel';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import MetricStrip, { type MetricStripItem } from '../../../components/common/MetricStrip';
import DonutChart from '../../../components/common/DonutChart';
import { Button, Input } from '../../../components/ui';
import { CountUp, FadeContent, MotionGuard } from '../../../components/reactbits';
import type { DashboardData, Project, Task } from '../../../types';
import {
  PROCESS_MODE_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import DashboardAiAdvisor from './DashboardAiAdvisor';
import RequirementProgressPanel from './RequirementProgressPanel';

const taskColumns: DataTableColumn<Task>[] = [
  {
    key: 'title',
    title: '任务',
    render: (task) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{task.title}</div>
        <div className="truncate text-secondary">{task.owner || '未分配负责人'}</div>
      </div>
    ),
  },
  {
    key: 'status',
    title: '状态',
    render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
  },
  { key: 'dueDate', title: '截止日期', render: (task) => task.dueDate || '未设置' },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (task) => (
      <div className="flex min-w-[120px] items-center gap-2">
        <ProgressBar percent={task.progress ?? 0} height={5} showPercent={false} />
        <span className="text-secondary text-mono">{task.progress ?? 0}%</span>
      </div>
    ),
  },
];

function projectDates(project: Project) {
  if (!project.startDate && !project.endDate) return '未设置日期';
  return `${project.startDate || '未开始'} - ${project.endDate || '未结束'}`;
}

function HealthBucket({
  label,
  count,
  tone,
  hint,
}: {
  label: string;
  count: number;
  tone: 'success' | 'warning' | 'risk';
  hint: string;
}) {
  const toneClass =
    tone === 'success' ? 'text-[var(--color-success)]' :
    tone === 'warning' ? 'text-[var(--color-warning)]' :
    'text-[var(--color-risk)]';
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-secondary">
        <span className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${tone === 'success' ? 'bg-[var(--color-success)]' : tone === 'warning' ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-risk)]'}`} />
        {label}
        <span className="ml-1 text-xs opacity-70">{hint}</span>
      </span>
      <strong className={`text-mono ${toneClass}`}>{count}</strong>
    </div>
  );
}

export default function DashboardView() {
  const dashboardRequest = useAsync<DashboardData>(fetchDashboard, [], { cacheKey: 'dashboard:overview' });
  const projectsRequest = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const [keyword, setKeyword] = useState('');

  const dashboard = dashboardRequest.data ?? (dashboardRequest.error ? fallbackDashboard : null);
  const projects = projectsRequest.data ?? dashboard?.riskyProjects ?? [];
  const filteredProjects = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => [
      project.name,
      project.code || '',
      project.owner,
      project.description || '',
    ].some((value) => value.toLowerCase().includes(query)));
  }, [keyword, projects]);

  const projectColumns: DataTableColumn<Project>[] = [
    {
      key: 'name',
      title: '项目',
      sorter: (left, right) => left.name.localeCompare(right.name),
      render: (project) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <FolderKanban size={15} className="shrink-0 text-secondary" aria-hidden="true" />
            <span className="truncate font-medium">{project.name}</span>
          </div>
          <div className="truncate text-secondary">
            {labelOf(PROCESS_MODE_LABELS, project.processMode)} · {project.owner || '未分配负责人'}
          </div>
        </div>
      ),
    },
    {
      key: 'progress',
      title: '进度',
      width: 220,
      sorter: (left, right) => left.progress - right.progress,
      render: (project) => (
        <div className="flex min-w-[160px] items-center gap-2">
          <ProgressBar percent={project.progress ?? 0} height={5} showPercent={false} />
          <span className="shrink-0 text-secondary text-mono">{project.progress ?? 0}%</span>
        </div>
      ),
    },
    { key: 'dates', title: '日期', render: (project) => projectDates(project) },
    {
      key: 'status',
      title: '状态',
      render: (project) => <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />,
    },
  ];

  if (dashboardRequest.loading || !dashboard) {
    return <PageState loading={dashboardRequest.loading} error={dashboardRequest.error} onRetry={dashboardRequest.reload} />;
  }

  const openProject = (project: Project) => {
    window.location.hash = `#/projects?focus=${encodeURIComponent(project.id)}`;
  };

  const m = dashboard.metrics;
  // KPI hero strip. Values use CountUp for an animated count-in, wrapped in
  // MotionGuard so reduced-motion users see the plain number instead.
  const kpiItems: MetricStripItem[] = [
    {
      label: '任务总数',
      value: <MotionGuard fallback={<>{m.tasks.total}</>}>
        <CountUp to={m.tasks.total} duration={1.2} />
      </MotionGuard>,
      icon: <ClipboardList size={16} aria-hidden="true" />,
      tone: 'info',
      caption: `${labelOf(TASK_STATUS_LABELS, 'done')} ${m.tasks.done ?? 0}`,
    },
    {
      label: '项目健康度',
      value: <MotionGuard fallback={<>{m.projectHealthAverage}</>}>
        <CountUp to={m.projectHealthAverage} duration={1.2} />
      </MotionGuard>,
      icon: <HeartPulse size={16} aria-hidden="true" />,
      tone: m.projectHealthAverage >= 75 ? 'success' : m.projectHealthAverage >= 50 ? 'warning' : 'risk',
      caption: '平均健康分',
    },
    {
      label: '需求完成率',
      value: <MotionGuard fallback={<>{m.requirementCompletionAverage}%</>}>
        <CountUp to={m.requirementCompletionAverage} duration={1.2} />%
      </MotionGuard>,
      icon: <TestTube2 size={16} aria-hidden="true" />,
      tone: m.requirementCompletionAverage >= 75 ? 'success' : 'warning',
      caption: '平均完成率',
    },
    {
      label: '测试通过率',
      value: <MotionGuard fallback={<>{m.testPassRate}%</>}>
        <CountUp to={m.testPassRate} duration={1.2} />%
      </MotionGuard>,
      icon: <TestTube2 size={16} aria-hidden="true" />,
      tone: m.testPassRate >= 75 ? 'success' : m.testPassRate >= 50 ? 'warning' : 'risk',
      caption: '用例通过',
    },
    {
      label: '开放风险',
      value: <MotionGuard fallback={<>{m.openRisks}</>}>
        <CountUp to={m.openRisks} duration={1.2} />
      </MotionGuard>,
      icon: <AlertTriangle size={16} aria-hidden="true" />,
      tone: m.openRisks > 0 ? 'risk' : 'success',
      caption: m.openRisks > 0 ? '需处理' : '无风险',
    },
    {
      label: '文档总数',
      value: <MotionGuard fallback={<>{m.documentCount}</>}>
        <CountUp to={m.documentCount} duration={1.2} />
      </MotionGuard>,
      icon: <FileText size={16} aria-hidden="true" />,
      tone: 'default',
      caption: '知识库',
    },
  ];

  return (
    <MotionGuard fallback={
      <div className="flex min-w-0 flex-col gap-4">
        {renderDashboardBody(dashboard)}
      </div>
    }>
      <FadeContent blur duration={0.4} threshold={0.05}>
        <div className="flex min-w-0 flex-col gap-4">
          {renderDashboardBody(dashboard)}
        </div>
      </FadeContent>
    </MotionGuard>
  );

  // Hoisted so both the animated and static (reduced-motion) branches share it.
  // Takes dashboard as a parameter so the non-null narrowing from the guard
  // above carries into the closure (TS won't preserve it for captured locals).
  function renderDashboardBody(data: DashboardData) {
    return (
      <>
        {(dashboardRequest.error || projectsRequest.error) && (
          <div className="helper-text border-b border-[var(--border)] pb-3" role="status">
            当前显示可用数据，部分实时资源暂时无法连接。可稍后重试。
          </div>
        )}

        <MetricStrip variant="hero" items={kpiItems} className="dashboard-kpi-strip" />

        <div className="dashboard-main-grid grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <Panel
            title="项目"
            subtitle={`当前显示 ${filteredProjects.length} / ${projects.length} 个可访问项目`}
            icon={<FolderKanban size={16} aria-hidden="true" />}
            toolbar={(
              <Button
                size="sm"
                variant="secondary"
                icon={<ArrowUpRight size={15} aria-hidden="true" />}
                onClick={() => { window.location.hash = '#/projects'; }}
              >
                查看全部
              </Button>
            )}
            className="dashboard-projects-panel"
            noPadding
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <label className="sr-only" htmlFor="dashboard-project-search">搜索项目</label>
              <div className="input-with-icon min-w-0 flex-1 basis-56" style={{ minHeight: 32, padding: '0 10px' }}>
                <Search size={15} className="shrink-0 text-secondary" aria-hidden="true" />
                <Input
                  id="dashboard-project-search"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索项目"
                  className="h-8 border-0 bg-transparent shadow-none focus:shadow-none"
                />
              </div>
              <span className="text-secondary text-xs hidden sm:inline">项目、进度、日期和状态</span>
            </div>
            <DataTable
              columns={projectColumns}
              data={filteredProjects}
              rowKey="id"
              loading={projectsRequest.loading}
              onRowClick={openProject}
              emptyText={keyword ? '没有匹配的项目' : '暂无可访问项目'}
              pageSize={8}
            />
          </Panel>

          <Panel title="健康分布" subtitle={`平均健康分 ${m.projectHealthAverage}`} icon={<HeartPulse size={16} aria-hidden="true" />}>
            {(() => {
              const healthy = projects.filter((p) => (p.healthScore ?? 0) >= 75).length;
              const watch = projects.filter((p) => {
                const score = p.healthScore ?? 0;
                return score >= 50 && score < 75;
              }).length;
              const risk = projects.filter((p) => (p.healthScore ?? 0) < 50).length;
              const topRisk = [...projects]
                .sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0) || (b.riskCount ?? 0) - (a.riskCount ?? 0))
                .slice(0, 4);
              return (
                <div className="dashboard-health-panel flex min-w-0 flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <DonutChart value={m.projectHealthAverage} label="健康" size={112} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <HealthBucket label="健康" count={healthy} tone="success" hint="≥ 75" />
                      <HealthBucket label="关注" count={watch} tone="warning" hint="50–74" />
                      <HealthBucket label="风险" count={risk} tone="risk" hint="< 50" />
                    </div>
                  </div>
                  <div className="dashboard-health-list border-t border-[var(--border)] pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-secondary">需关注项目</span>
                      <span className="text-[11px] text-secondary">按健康分升序</span>
                    </div>
                    {topRisk.length === 0 ? (
                      <p className="text-secondary text-xs m-0">暂无项目数据</p>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                        {topRisk.map((project) => {
                          const score = project.healthScore ?? 0;
                          const tone = score >= 75 ? 'success' : score >= 50 ? 'warning' : 'risk';
                          return (
                            <li key={project.id}>
                              <button
                                type="button"
                                className="dashboard-health-item"
                                onClick={() => openProject(project)}
                              >
                                <span className={`dashboard-health-dot tone-${tone}`} aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  <span className="dashboard-health-name">{project.name}</span>
                                  <span className="dashboard-health-meta">
                                    {project.owner || '未分配'} · 风险 {project.riskCount ?? 0}
                                  </span>
                                </span>
                                <span className={`dashboard-health-score tone-${tone}`}>{score}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })()}
          </Panel>
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Panel title="近期工作" subtitle="保持任务与截止日期可见" icon={<ListTodo size={16} aria-hidden="true" />} noPadding>
            <DataTable
              columns={taskColumns}
              data={data.focusTasks.filter((task) => !['done', 'cancelled'].includes(task.status)).slice(0, 8)}
              rowKey="id"
              emptyText="当前没有待处理任务"
            />
          </Panel>
          <RequirementProgressPanel items={data.requirementProgress} />
          <DashboardAiAdvisor data={data} />
        </div>
      </>
    );
  }
}
