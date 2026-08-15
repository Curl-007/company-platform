import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CalendarDays,
  FolderKanban,
  GitBranch,
  ListTree,
  Pencil,
  ShieldAlert,
  SquareKanban,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { fetchProject, updateProjectStatus } from '../api';
import {
  activationGateMissing,
  activationGateSummary,
  type DetailTab,
  STORAGE_KEYS,
} from '../detailModel';
import EditProjectForm from './EditProjectForm';
import FlowTab from './FlowTab';
import GovernanceTab from './GovernanceTab';
import KanbanTab from './KanbanTab';
import OverviewTab from './OverviewTab';
import ProjectMembersForm from './ProjectMembersForm';
import WbsTab from './WbsTab';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/Tabs';
import { ComboSelect } from '../../../components/ui';
import type { Project, ProjectDetail, SessionUser } from '../../../types';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROCESS_MODE_LABELS,
  healthVariant,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import { useAgentPageContextPublisher } from '../../ai/agentPageContext';

const PROJECT_DETAIL_TABS: Array<{ key: DetailTab; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'features.projects.projectDetailView.tabOverview', icon: FolderKanban },
  { key: 'wbs', label: 'features.projects.projectDetailView.tabWbs', icon: ListTree },
  { key: 'kanban', label: 'features.projects.projectDetailView.tabKanban', icon: SquareKanban },
  { key: 'flow', label: 'features.projects.projectDetailView.tabFlow', icon: GitBranch },
  { key: 'governance', label: 'features.projects.projectDetailView.tabGovernance', icon: ShieldAlert },
];

export default function ProjectDetailView({ id, onBack, user }: { id: string; onBack: () => void; user?: SessionUser | null }) {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<ProjectDetail>(
    () => fetchProject(id),
    [id],
    { cacheKey: 'projects:detail' },
  );
  // Tell the global agent sidebar which project is open.
  useAgentPageContextPublisher({
    page: 'projects',
    projectId: id,
    projectName: data?.name,
  });
  const [tab, setTab] = useState<DetailTab>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.detailTab);
    return saved === 'wbs' || saved === 'kanban' || saved === 'flow' || saved === 'governance' ? saved : 'overview';
  });
  const [, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activationMissing, setActivationMissing] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [managingMembers, setManagingMembers] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const canUpdateProject = canOperate(user, 'projects:update');
  const canManageMembers = canOperate(user, 'projectMembers:manage');
  const canUseAi = canOperate(user, 'ai:analyze');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.detailTab, tab);
  }, [tab]);

  async function handleStatusChange(next: string) {
    if (!next) return;
    const projectVersion = data?.version;
    if (!projectVersion) return;
    if (!canUpdateProject) {
      setActionError(t('features.projects.projectDetailView.noStatusPermission'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.projects.projectDetailView.changeStatusConfirm', {
        status: labelOf(PROJECT_STATUS_LABELS, next),
      }),
      description: t('features.projects.projectDetailView.changeStatusDesc'),
      confirmText: t('features.projects.projectDetailView.confirmChange'),
      tone: 'info',
    });
    if (!confirmed) {
      setStatus('');
      return;
    }

    setStatus(next);
    setSaving(true);
    setActionError(null);
    setActivationMissing([]);
    try {
      await updateProjectStatus(id, next, projectVersion);
      toast.success(t('features.projects.projectDetailView.statusUpdated'));
      reload();
    } catch (err: unknown) {
      const missing = activationGateMissing(err);
      setActivationMissing(missing);
      setActionError(missing.length ? activationGateSummary(missing) : err instanceof ApiError ? err.message : t('features.projects.projectDetailView.statusUpdateFailed'));
    } finally {
      setSaving(false);
      setStatus('');
    }
  }

  if (loading || error || !data) {
    return (
      <>
        <button className="btn btn-text btn-sm btn-with-icon" onClick={onBack} style={{ marginBottom: 12 }}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('features.projects.projectDetailView.projectList')}
        </button>
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </>
    );
  }

  const project = data;

  const activeSprints = project.sprints.filter((item) => item.status === 'active' || item.status === 'in_progress').length;
  const blockedTasks = project.tasks.filter((item) => item.status === 'blocked').length;
  const scheduleText = project.startDate || project.endDate
    ? t('features.projects.projectDetailView.scheduleRange', {
        start: project.startDate ?? t('features.projects.common.startUnset'),
        end: project.endDate ?? t('features.projects.common.endUnset'),
      })
    : t('features.projects.common.noSchedule');

  return (
    <div className="project-detail-page min-w-0">
      <nav className="flex min-w-0 max-w-full flex-wrap items-center gap-1 text-sm" aria-label={t('features.projects.projectDetailView.breadcrumbLabel')}>
        <button className="btn btn-text btn-sm btn-with-icon shrink-0" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('features.projects.projectDetailView.projectCrumb')}
        </button>
        <span className="text-secondary" aria-hidden="true">/</span>
        <span className="min-w-0 truncate font-medium" title={project.name}>{project.name}</span>
      </nav>

      <section className="pd-hero">
        <div className="pd-hero-top">
          <div className="pd-hero-main min-w-0">
            <div className="pd-hero-eyebrow">
              <span className="pd-hero-code">
                <FolderKanban size={13} aria-hidden="true" />
                {project.code || project.id}
              </span>
              <span className="pd-hero-dot" aria-hidden="true" />
              <span>{labelOf(PROCESS_MODE_LABELS, project.processMode)}</span>
              <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
            </div>
            <h2 className="pd-hero-title">{project.name}</h2>
            {(project.description || project.objective) ? (
              <p className="pd-hero-desc">{project.objective || project.description}</p>
            ) : null}
          </div>

          <div className="pd-hero-actions">
            {canUpdateProject ? (
              <button className="btn btn-secondary btn-sm btn-with-icon" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden="true" /> {t('common.edit')}
              </button>
            ) : null}
            {canManageMembers ? (
              <button className="btn btn-secondary btn-sm btn-with-icon" onClick={() => setManagingMembers(true)}>
                <Users size={14} aria-hidden="true" /> {t('features.projects.projectDetailView.membersButton')}
              </button>
            ) : null}
            {canUpdateProject ? (
              <div className="pd-hero-status-select">
                <ComboSelect
                  options={PROJECT_STATUSES
                    .filter((item) => item !== project.status)
                    .map((item) => ({ value: item, label: labelOf(PROJECT_STATUS_LABELS, item) }))}
                  value=""
                  onChange={(next) => handleStatusChange(next)}
                  placeholder={t('features.projects.projectDetailView.changeStatusPlaceholder')}
                  disabled={saving}
                  ariaLabel={t('features.projects.projectDetailView.changeStatusAria')}
                  className="w-full"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="pd-hero-metrics">
          <div className="pd-hero-metric">
            <span className="pd-hero-metric-label">
              <UserRound size={13} aria-hidden="true" />
              {t('features.projects.projectDetailView.ownerLabel')}
            </span>
            <strong className="pd-hero-metric-value truncate">{project.owner || t('features.projects.projectDetailView.ownerUnset')}</strong>
          </div>
          <div className="pd-hero-metric">
            <span className="pd-hero-metric-label">
              <CalendarDays size={13} aria-hidden="true" />
              {t('features.projects.projectDetailView.scheduleLabel')}
            </span>
            <strong className="pd-hero-metric-value truncate" title={scheduleText}>{scheduleText}</strong>
          </div>
          <div className="pd-hero-metric">
            <span className="pd-hero-metric-label">{t('features.projects.projectDetailView.tasksRisksLabel')}</span>
            <strong className="pd-hero-metric-value">
              <span>{t('features.projects.projectDetailView.taskCount', { count: project.tasks.length })}</span>
              <span className={project.riskCount > 0 || blockedTasks > 0 ? 'is-risk' : 'is-muted'}>
                {t('features.projects.projectDetailView.riskCount', { count: project.riskCount })}
              </span>
              <span className={blockedTasks > 0 ? 'is-risk' : 'is-muted'}>
                {t('features.projects.projectDetailView.blockedCount', { count: blockedTasks })}
              </span>
            </strong>
          </div>
          <div className="pd-hero-metric pd-hero-metric-progress">
            <span className="pd-hero-metric-label">
              {t('features.projects.projectDetailView.progressLabel')}
              <span className="pd-hero-health">
                {t('features.projects.projectDetailView.healthLabel')}
                <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
              </span>
            </span>
            <div className="pd-hero-progress-row">
              <ProgressBar percent={project.progress ?? 0} height={6} showPercent={false} className="min-w-0 flex-1" />
              <span className="pd-hero-progress-num text-mono">{project.progress ?? 0}%</span>
            </div>
          </div>
        </div>
      </section>

      {(actionError || activationMissing.length > 0) && (
        <div
          className="flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-[var(--destructive)] bg-[var(--muted)] px-3 py-2 text-sm"
          role="alert"
        >
          {actionError ? <span className="min-w-0 flex-1 break-words text-[var(--destructive)]">{actionError}</span> : null}
          {activationMissing.some((item) => ['projectObjective', 'plannedDates', 'milestoneOrSprint'].includes(item)) && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{t('features.projects.projectDetailView.completeBasicInfo')}</button>
          )}
          {activationMissing.includes('projectMembers') && canManageMembers && (
            <button className="btn btn-secondary btn-sm" onClick={() => setManagingMembers(true)}>{t('features.projects.projectDetailView.manageMembers')}</button>
          )}
          {activationMissing.includes('riskOwners') && (
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('governance')}>{t('features.projects.projectDetailView.addRiskOwner')}</button>
          )}
          {activationMissing.some((item) => ['capacityAllocations', 'capacityPlans', 'capacityApprovals'].includes(item)) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const params = new URLSearchParams({ projectId: project.id });
                if (project.startDate) params.set('periodStart', project.startDate);
                if (project.endDate) params.set('periodEnd', project.endDate);
                window.location.hash = `#/capacity?${params.toString()}`;
              }}
            >
              {t('features.projects.projectDetailView.configureCapacity')}
            </button>
          )}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as DetailTab)}
        className="project-detail-tabs min-w-0"
      >
        <TabsList className="project-detail-tablist" aria-label={t('features.projects.projectDetailView.tabsAria')}>
          {PROJECT_DETAIL_TABS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger
              key={key}
              id={`project-detail-tab-${key}`}
              value={key}
              className="project-detail-tab-trigger"
              aria-controls={`project-detail-panel-${key}`}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{t(label)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {PROJECT_DETAIL_TABS.map(({ key }) => (
          <TabsContent
            key={key}
            value={key}
            id={`project-detail-panel-${key}`}
            className="project-detail-tab-panel"
            aria-labelledby={`project-detail-tab-${key}`}
          >
            {key === 'overview' ? <OverviewTab project={project} projectId={id} onReload={reload} canManageProject={canUpdateProject} /> : null}
            {key === 'wbs' ? <WbsTab tasks={project.tasks} projectId={id} onReload={reload} canManageProject={canUpdateProject} /> : null}
            {key === 'kanban' ? <KanbanTab projectId={id} canManageProject={canUpdateProject} /> : null}
            {key === 'flow' ? <FlowTab projectId={id} /> : null}
            {key === 'governance' ? <GovernanceTab projectId={id} canManageProject={canUpdateProject} onProjectReload={reload} /> : null}
          </TabsContent>
        ))}
      </Tabs>

      {canUseAi ? (
        <BusinessAdvicePanel
          className="project-detail-ai-panel"
          targetType="project"
          targetId={project.id}
          title={t('features.projects.projectDetailView.aiAdviceTitle')}
          description={t('features.projects.projectDetailView.aiAdviceDescription')}
          buttonText={t('features.projects.projectDetailView.aiAnalyzeButton')}
          question={t('features.projects.projectDetailView.aiAdviceQuestion')}
          draft={() => ({
            status: project.status,
            healthScore: project.healthScore,
            progress: project.progress,
            riskCount: project.riskCount,
            blockedTasks,
            activeSprints,
          })}
        />
      ) : null}
      {editing && canUpdateProject && (
        <EditProjectForm
          project={project as unknown as Project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
      {managingMembers && canManageMembers ? (
        <ProjectMembersForm
          projectId={project.id}
          projectName={project.name}
          canManageMembers={canManageMembers}
          onClose={() => setManagingMembers(false)}
        />
      ) : null}
    </div>
  );
}
