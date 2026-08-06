import { useEffect, useState } from 'react';
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

const PROJECT_DETAIL_TABS: Array<{ key: DetailTab; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: '概览', icon: FolderKanban },
  { key: 'wbs', label: 'WBS', icon: ListTree },
  { key: 'kanban', label: '看板', icon: SquareKanban },
  { key: 'flow', label: '流程', icon: GitBranch },
  { key: 'governance', label: '风险与决策', icon: ShieldAlert },
];

export default function ProjectDetailView({ id, onBack, user }: { id: string; onBack: () => void; user?: SessionUser | null }) {
  const { data, loading, error, reload } = useAsync<ProjectDetail>(
    () => fetchProject(id),
    [id],
    { cacheKey: 'projects:detail' },
  );
  const [tab, setTab] = useState<DetailTab>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.detailTab);
    return saved === 'wbs' || saved === 'kanban' || saved === 'flow' || saved === 'governance' ? saved : 'overview';
  });
  const [status, setStatus] = useState('');
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
      setActionError('当前账号无权变更项目状态。');
      return;
    }
    const confirmed = await confirm({
      title: `变更项目状态为“${labelOf(PROJECT_STATUS_LABELS, next)}”？`,
      description: '状态变更会影响项目看板、报表和动态中心中的项目状态展示。',
      confirmText: '确认变更',
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
      toast.success('项目状态已更新');
      reload();
    } catch (err: unknown) {
      const missing = activationGateMissing(err);
      setActivationMissing(missing);
      setActionError(missing.length ? activationGateSummary(missing) : err instanceof ApiError ? err.message : '状态更新失败');
    } finally {
      setSaving(false);
      setStatus('');
    }
  }

  if (loading || error || !data) {
    return (
      <>
        <button className="btn btn-text btn-sm btn-with-icon" onClick={onBack} style={{ marginBottom: 12 }}>
          <ArrowLeft size={15} aria-hidden="true" /> 项目列表
        </button>
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </>
    );
  }

  const project = data;

  const activeSprints = project.sprints.filter((item) => item.status === 'active' || item.status === 'in_progress').length;
  const blockedTasks = project.tasks.filter((item) => item.status === 'blocked').length;
  const scheduleText = project.startDate || project.endDate
    ? `${project.startDate ?? '未设开始'} 至 ${project.endDate ?? '未设结束'}`
    : '未设置排期';

  return (
    <div className="project-detail-page min-w-0">
      <nav className="flex min-w-0 max-w-full flex-wrap items-center gap-1 text-sm" aria-label="项目路径">
        <button className="btn btn-text btn-sm btn-with-icon shrink-0" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> 项目
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
                <Pencil size={14} aria-hidden="true" /> 编辑
              </button>
            ) : null}
            {canManageMembers ? (
              <button className="btn btn-secondary btn-sm btn-with-icon" onClick={() => setManagingMembers(true)}>
                <Users size={14} aria-hidden="true" /> 成员
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
                  placeholder="变更状态"
                  disabled={saving}
                  ariaLabel="变更项目状态"
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
              负责人
            </span>
            <strong className="pd-hero-metric-value truncate">{project.owner || '未设置'}</strong>
          </div>
          <div className="pd-hero-metric">
            <span className="pd-hero-metric-label">
              <CalendarDays size={13} aria-hidden="true" />
              排期
            </span>
            <strong className="pd-hero-metric-value truncate" title={scheduleText}>{scheduleText}</strong>
          </div>
          <div className="pd-hero-metric">
            <span className="pd-hero-metric-label">任务 / 风险</span>
            <strong className="pd-hero-metric-value">
              <span>{project.tasks.length} 任务</span>
              <span className={project.riskCount > 0 || blockedTasks > 0 ? 'is-risk' : 'is-muted'}>
                风险 {project.riskCount}
              </span>
              <span className={blockedTasks > 0 ? 'is-risk' : 'is-muted'}>
                阻塞 {blockedTasks}
              </span>
            </strong>
          </div>
          <div className="pd-hero-metric pd-hero-metric-progress">
            <span className="pd-hero-metric-label">
              进度
              <span className="pd-hero-health">
                健康
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
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>完善项目基础信息</button>
          )}
          {activationMissing.includes('projectMembers') && canManageMembers && (
            <button className="btn btn-secondary btn-sm" onClick={() => setManagingMembers(true)}>管理项目成员</button>
          )}
          {activationMissing.includes('riskOwners') && (
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('governance')}>补充风险责任人</button>
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
              配置容量与投入
            </button>
          )}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as DetailTab)}
        className="project-detail-tabs min-w-0"
      >
        <TabsList className="project-detail-tablist" aria-label="项目详情视图">
          {PROJECT_DETAIL_TABS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger
              key={key}
              id={`project-detail-tab-${key}`}
              value={key}
              className="project-detail-tab-trigger"
              aria-controls={`project-detail-panel-${key}`}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
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
          title="AI 项目建议"
          description="基于项目、需求、任务、测试、缺陷与交付上下文生成执行建议。"
          buttonText="AI 分析项目"
          question="请分析该项目的执行状态、主要风险、交付缺口和下一步动作。"
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
