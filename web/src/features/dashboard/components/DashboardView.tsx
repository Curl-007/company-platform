import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import i18n from '../../../i18n';
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
    title: i18n.t('features.dashboard.dashboardView.column.task'),
    render: (task) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{task.title}</div>
        <div className="truncate text-secondary">{task.owner || i18n.t('features.dashboard.dashboardView.unassignedOwner')}</div>
      </div>
    ),
  },
  {
    key: 'status',
    title: i18n.t('features.dashboard.dashboardView.column.status'),
    render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
  },
  { key: 'dueDate', title: i18n.t('features.dashboard.dashboardView.column.dueDate'), render: (task) => task.dueDate || i18n.t('features.dashboard.dashboardView.unset') },
  {
    key: 'progress',
    title: i18n.t('features.dashboard.dashboardView.column.progress'),
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
  if (!project.startDate && !project.endDate) return i18n.t('features.dashboard.dashboardView.unsetDate');
  return `${project.startDate || i18n.t('features.dashboard.dashboardView.notStarted')} - ${project.endDate || i18n.t('features.dashboard.dashboardView.notEnded')}`;
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
  const { t } = useTranslation();
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
      title: i18n.t('features.dashboard.dashboardView.column.project'),
      sorter: (left, right) => left.name.localeCompare(right.name),
      render: (project) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <FolderKanban size={15} className="shrink-0 text-secondary" aria-hidden="true" />
            <span className="truncate font-medium">{project.name}</span>
          </div>
          <div className="truncate text-secondary">
            {labelOf(PROCESS_MODE_LABELS, project.processMode)} · {project.owner || i18n.t('features.dashboard.dashboardView.unassignedOwner')}
          </div>
        </div>
      ),
    },
    {
      key: 'progress',
      title: i18n.t('features.dashboard.dashboardView.column.progress'),
      width: 220,
      sorter: (left, right) => left.progress - right.progress,
      render: (project) => (
        <div className="flex min-w-[160px] items-center gap-2">
          <ProgressBar percent={project.progress ?? 0} height={5} showPercent={false} />
          <span className="shrink-0 text-secondary text-mono">{project.progress ?? 0}%</span>
        </div>
      ),
    },
    { key: 'dates', title: i18n.t('features.dashboard.dashboardView.column.date'), render: (project) => projectDates(project) },
    {
      key: 'status',
      title: i18n.t('features.dashboard.dashboardView.column.status'),
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
      label: t('features.dashboard.dashboardView.totalTasks'),
      value: <MotionGuard fallback={<>{m.tasks.total}</>}>
        <CountUp to={m.tasks.total} duration={1.2} />
      </MotionGuard>,
      icon: <ClipboardList size={16} aria-hidden="true" />,
      tone: 'info',
      caption: `${labelOf(TASK_STATUS_LABELS, 'done')} ${m.tasks.done ?? 0}`,
    },
    {
      label: t('features.dashboard.dashboardView.projectHealth'),
      value: <MotionGuard fallback={<>{m.projectHealthAverage}</>}>
        <CountUp to={m.projectHealthAverage} duration={1.2} />
      </MotionGuard>,
      icon: <HeartPulse size={16} aria-hidden="true" />,
      tone: m.projectHealthAverage >= 75 ? 'success' : m.projectHealthAverage >= 50 ? 'warning' : 'risk',
      caption: t('features.dashboard.dashboardView.avgHealthScore'),
    },
    {
      label: t('features.dashboard.dashboardView.requirementCompletion'),
      value: <MotionGuard fallback={<>{m.requirementCompletionAverage}%</>}>
        <CountUp to={m.requirementCompletionAverage} duration={1.2} />%
      </MotionGuard>,
      icon: <TestTube2 size={16} aria-hidden="true" />,
      tone: m.requirementCompletionAverage >= 75 ? 'success' : 'warning',
      caption: t('features.dashboard.dashboardView.avgCompletionRate'),
    },
    {
      label: t('features.dashboard.dashboardView.testPassRate'),
      value: <MotionGuard fallback={<>{m.testPassRate}%</>}>
        <CountUp to={m.testPassRate} duration={1.2} />%
      </MotionGuard>,
      icon: <TestTube2 size={16} aria-hidden="true" />,
      tone: m.testPassRate >= 75 ? 'success' : m.testPassRate >= 50 ? 'warning' : 'risk',
      caption: t('features.dashboard.dashboardView.casePassed'),
    },
    {
      label: t('features.dashboard.dashboardView.openRisks'),
      value: <MotionGuard fallback={<>{m.openRisks}</>}>
        <CountUp to={m.openRisks} duration={1.2} />
      </MotionGuard>,
      icon: <AlertTriangle size={16} aria-hidden="true" />,
      tone: m.openRisks > 0 ? 'risk' : 'success',
      caption: m.openRisks > 0 ? t('features.dashboard.dashboardView.needsAction') : t('features.dashboard.dashboardView.noRisks'),
    },
    {
      label: t('features.dashboard.dashboardView.totalDocuments'),
      value: <MotionGuard fallback={<>{m.documentCount}</>}>
        <CountUp to={m.documentCount} duration={1.2} />
      </MotionGuard>,
      icon: <FileText size={16} aria-hidden="true" />,
      tone: 'default',
      caption: t('features.dashboard.dashboardView.knowledgeBase'),
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
            {t('features.dashboard.dashboardView.partialDataNotice')}
          </div>
        )}

        <MetricStrip variant="hero" items={kpiItems} className="dashboard-kpi-strip" />

        <div className="dashboard-main-grid grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <Panel
            title={t('features.dashboard.dashboardView.column.project')}
            subtitle={t('features.dashboard.dashboardView.projectsSubtitle', { shown: filteredProjects.length, total: projects.length })}
            icon={<FolderKanban size={16} aria-hidden="true" />}
            toolbar={(
              <Button
                size="sm"
                variant="secondary"
                icon={<ArrowUpRight size={15} aria-hidden="true" />}
                onClick={() => { window.location.hash = '#/projects'; }}
              >
                {t('features.dashboard.dashboardView.viewAll')}
              </Button>
            )}
            className="dashboard-projects-panel"
            noPadding
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <label className="sr-only" htmlFor="dashboard-project-search">{t('features.dashboard.dashboardView.searchProject')}</label>
              <div className="input-with-icon min-w-0 flex-1 basis-56" style={{ minHeight: 32, padding: '0 10px' }}>
                <Search size={15} className="shrink-0 text-secondary" aria-hidden="true" />
                <Input
                  id="dashboard-project-search"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={t('features.dashboard.dashboardView.searchProject')}
                  className="h-8 border-0 bg-transparent shadow-none focus:shadow-none"
                />
              </div>
              <span className="text-secondary text-xs hidden sm:inline">{t('features.dashboard.dashboardView.searchHint')}</span>
            </div>
            <DataTable
              columns={projectColumns}
              data={filteredProjects}
              rowKey="id"
              loading={projectsRequest.loading}
              onRowClick={openProject}
              emptyText={keyword ? t('features.dashboard.dashboardView.noMatchingProjects') : t('features.dashboard.dashboardView.noAccessibleProjects')}
              pageSize={8}
            />
          </Panel>

          <Panel title={t('features.dashboard.dashboardView.healthDistribution')} subtitle={t('features.dashboard.dashboardView.avgHealthScoreSubtitle', { score: m.projectHealthAverage })} icon={<HeartPulse size={16} aria-hidden="true" />}>
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
                    <DonutChart value={m.projectHealthAverage} label={t('features.dashboard.dashboardView.health')} size={112} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <HealthBucket label={t('features.dashboard.dashboardView.health')} count={healthy} tone="success" hint="≥ 75" />
                      <HealthBucket label={t('features.dashboard.dashboardView.watch')} count={watch} tone="warning" hint="50–74" />
                      <HealthBucket label={t('features.dashboard.dashboardView.risk')} count={risk} tone="risk" hint="< 50" />
                    </div>
                  </div>
                  <div className="dashboard-health-list border-t border-[var(--border)] pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-secondary">{t('features.dashboard.dashboardView.projectsNeedingAttention')}</span>
                      <span className="text-[11px] text-secondary">{t('features.dashboard.dashboardView.sortedByHealthAsc')}</span>
                    </div>
                    {topRisk.length === 0 ? (
                      <p className="text-secondary text-xs m-0">{t('features.dashboard.dashboardView.noProjectData')}</p>
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
                                    {t('features.dashboard.dashboardView.riskCountLine', { owner: project.owner || t('features.dashboard.dashboardView.unassigned'), count: project.riskCount ?? 0 })}
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
          <Panel title={t('features.dashboard.dashboardView.recentWork')} subtitle={t('features.dashboard.dashboardView.recentWorkSubtitle')} icon={<ListTodo size={16} aria-hidden="true" />} noPadding>
            <DataTable
              columns={taskColumns}
              data={data.focusTasks.filter((task) => !['done', 'cancelled'].includes(task.status)).slice(0, 8)}
              rowKey="id"
              emptyText={t('features.dashboard.dashboardView.noPendingTasks')}
            />
          </Panel>
          <RequirementProgressPanel items={data.requirementProgress} />
          <DashboardAiAdvisor data={data} />
        </div>
      </>
    );
  }
}
