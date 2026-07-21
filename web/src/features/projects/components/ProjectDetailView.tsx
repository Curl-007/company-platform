import { useEffect, useState } from 'react';
import { Clock3, FolderKanban, UserRound } from 'lucide-react';
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
import type { Project, ProjectDetail, SessionUser } from '../../../types';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROCESS_MODE_LABELS,
  healthVariant,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';

export default function ProjectDetailView({ id, onBack, user }: { id: string; onBack: () => void; user?: SessionUser | null }) {
  const { data, loading, error, reload } = useAsync<ProjectDetail>(() => fetchProject(id), [id]);
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
        <button className="btn btn-text btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← 返回项目列表</button>
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
    <div className="project-detail-page">
      <button className="btn btn-text btn-sm project-detail-back" onClick={onBack}>← 返回项目列表</button>

      <section className="project-detail-hero">
        <div className="project-detail-main">
          <div className="project-detail-title-row">
            <div className="project-detail-icon">
              <FolderKanban size={20} />
            </div>
            <div>
              <div className="project-detail-eyebrow">
                <span>{project.code || project.id}</span>
                <span>{labelOf(PROCESS_MODE_LABELS, project.processMode)}</span>
              </div>
              <h2>{project.name}</h2>
            </div>
          </div>

          <p className="project-detail-description">
            {project.description || '暂无项目描述。'}
          </p>
          <div className="detail-field" style={{ marginBottom: 12 }}>
            <span className="detail-label">项目目标</span>
            <span>{project.objective || '尚未定义项目目标。'}</span>
          </div>

          <div className="project-detail-meta">
            <span><UserRound size={14} /> {project.owner}</span>
            <span><Clock3 size={14} /> {scheduleText}</span>
          </div>
        </div>

        <div className="project-detail-actions">
          <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
          {canUpdateProject ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>编辑</button> : null}
          {canManageMembers ? <button className="btn btn-secondary btn-sm" onClick={() => setManagingMembers(true)}>成员管理</button> : null}
          {canUpdateProject ? (
            <select
              className="form-select"
              value={status}
              disabled={saving}
              onChange={(event) => handleStatusChange(event.target.value)}
            >
              <option value="">变更状态...</option>
              {PROJECT_STATUSES.filter((item) => item !== project.status).map((item) => (
                <option key={item} value={item}>{labelOf(PROJECT_STATUS_LABELS, item)}</option>
              ))}
            </select>
          ) : null}
        </div>

        {actionError && <div className="form-error project-detail-error">{actionError}</div>}
        {activationMissing.length > 0 && (
          <div className="project-detail-error flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
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

        <div className="project-detail-metrics">
          <div className={`project-detail-metric ${healthVariant(project.healthScore)}`}>
            <span>健康评分</span>
            <strong>{project.healthScore}</strong>
          </div>
          <div className="project-detail-metric">
            <span>项目进度</span>
            <strong>{project.progress}%</strong>
            <ProgressBar percent={project.progress ?? 0} height={6} />
          </div>
          <div className={project.riskCount > 0 || blockedTasks > 0 ? 'project-detail-metric risk' : 'project-detail-metric'}>
            <span>风险 / 阻塞</span>
            <strong>{project.riskCount} / {blockedTasks}</strong>
          </div>
          <div className="project-detail-metric">
            <span>任务总数</span>
            <strong>{project.tasks.length}</strong>
          </div>
          <div className="project-detail-metric">
            <span>迭代</span>
            <strong>{activeSprints} / {project.sprints.length}</strong>
          </div>
        </div>
      </section>

      {canUseAi ? (
        <BusinessAdvicePanel
          targetType="project"
          targetId={project.id}
          title="AI 项目建议"
          description="基于后端项目、需求、任务、测试、缺陷、构建和交付上下文生成。"
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

      <div className="project-detail-tabs nav-tabs">
        {(['overview', 'wbs', 'kanban', 'flow', 'governance'] as DetailTab[]).map((key) => (
          <button key={key} className={`nav-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {key === 'overview' ? '概览' : key === 'wbs' ? 'WBS' : key === 'kanban' ? '看板' : key === 'flow' ? '流程' : '风险与决策'}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab project={project} projectId={id} onReload={reload} canManageProject={canUpdateProject} />}
      {tab === 'wbs' && <WbsTab tasks={project.tasks} projectId={id} onReload={reload} canManageProject={canUpdateProject} />}
      {tab === 'kanban' && <KanbanTab projectId={id} canManageProject={canUpdateProject} />}
      {tab === 'flow' && <FlowTab projectId={id} />}
      {tab === 'governance' && <GovernanceTab projectId={id} canManageProject={canUpdateProject} onProjectReload={reload} />}
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
