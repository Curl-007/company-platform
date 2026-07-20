import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Code2, FolderTree, GripVertical, KanbanSquare, Plus, UserRound } from 'lucide-react';
import {
  createSprint,
  createWbsTask,
  deleteTask,
  fetchProjectKanban,
  fetchSprintBurndown,
  fetchSprintCommitment,
  fetchSprintScopeChanges,
  updateTask,
  updateTaskKanban,
  type CreateSprintInput,
  type CreateWbsTaskInput,
} from '../features/tasks/api';
import { fetchRequirements } from '../features/requirements/api';
import { fetchProducts, fetchPrograms } from '../features/products/api';
import { fetchDefects, fetchTestCases } from '../features/testing/api';
import { fetchBuilds, fetchReleases } from '../features/delivery/api';
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  type CreateProjectInput,
  updateProject,
  updateProjectStatus,
} from '../features/projects/api';
import ProjectMembersForm from '../features/projects/components/ProjectMembersForm';
import FlowTab from '../features/projects/components/FlowTab';
import GovernanceTab from '../features/projects/components/GovernanceTab';
import SourceTab from '../features/projects/components/SourceTab';
import SprintBurndownRow from '../features/projects/components/SprintBurndownRow';
import ProjectDeliveryPanel, { type ProjectDeliveryData } from '../features/projects/components/ProjectDeliveryPanel';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import { createIdempotencyKey } from '../services/idempotency';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import TreeTable, { type TreeTableColumn } from '../components/common/TreeTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import BurndownChart from '../components/common/BurndownChart';
import BusinessAdvicePanel from '../components/common/BusinessAdvicePanel';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import type {
  Project,
  ProjectDetail,
  KanbanColumn,
  Task,
  Sprint,
  BurndownData,
  SprintCommitment,
  SprintScopeChange,
  Milestone,
  SessionUser,
  Requirement,
  TestCase,
  Defect,
  Build,
  Release,
} from '../types';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROCESS_MODE_LABELS,
  TASK_STATUS_LABELS,
  SPRINT_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  healthVariant,
  labelOf,
} from '../constants/enums';
import { canOperate } from '../constants/roles';
import { filterProjects, sortProjects, type ProjectFilter } from '../features/projects/listModel';

type DetailTab = 'overview' | 'wbs' | 'kanban' | 'flow' | 'governance' | 'source';

const PROJECT_ACTIVATION_MISSING_LABELS: Record<string, string> = {
  projectObjective: '项目目标',
  plannedDates: '计划起止日期',
  projectMembers: '项目成员',
  milestoneOrSprint: '首个里程碑或 Sprint',
  riskOwners: '高风险责任人',
  capacityAllocations: '项目投入分配',
  capacityPlans: '成员容量计划',
  capacityApprovals: '超配例外审批',
};

function activationGateMissing(error: unknown): string[] {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return [];
  const body = error.body as { errorCode?: unknown; details?: { missing?: unknown } };
  if (body.errorCode !== 'PROJECT_ACTIVATION_GATE_BLOCKED' || !Array.isArray(body.details?.missing)) return [];
  return body.details.missing.filter((item): item is string => typeof item === 'string');
}

function activationGateSummary(missing: string[]): string {
  const labels = missing.map((item) => PROJECT_ACTIVATION_MISSING_LABELS[item] ?? item);
  return labels.length ? `激活前还需要完成：${labels.join('、')}` : '项目尚未满足激活门禁。';
}

const STORAGE_KEYS = {
  projectFilter: 'projects-list-filter',
  projectKeyword: 'projects-list-keyword',
  detailTab: 'project-detail-tab',
  wbsOwner: 'project-wbs-owner-filter',
  wbsStatus: 'project-wbs-status-filter',
};

function fetchProjectDeliveryData(project: ProjectDetail): Promise<ProjectDeliveryData> {
  return Promise.all([
    fetchRequirements({ projectId: project.id }),
    fetchTestCases({ projectId: project.id }),
    fetchDefects({ projectId: project.id }),
    fetchBuilds(project.id),
    project.productId ? fetchReleases(project.productId) : Promise.resolve([]),
  ]).then(([requirements, testCases, defects, builds, releases]) => ({
    requirements,
    testCases,
    defects,
    builds,
    releases,
  }));
}

function buildProjectAiPrompt(project: ProjectDetail): string {
  const statusCounts = project.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  const blockedTasks = project.tasks
    .filter((task) => task.status === 'blocked')
    .slice(0, 6)
    .map((task) => `${task.title}（负责人：${task.owner || '未指派'}，进度：${task.progress ?? 0}%）`);
  const overdueOrDueTasks = project.tasks
    .filter((task) => task.dueDate)
    .slice(0, 8)
    .map((task) => `${task.title}：${task.dueDate} / ${labelOf(TASK_STATUS_LABELS, task.status)}`);
  const sprints = project.sprints
    .slice(0, 6)
    .map((sprint) => `${sprint.name}：${labelOf(SPRINT_STATUS_LABELS, sprint.status)}，${sprint.startDate || '未设开始'} 至 ${sprint.endDate || '未设结束'}`);

  return [
    '请作为项目管理 AI 助手，基于下面项目快照给出项目执行建议。',
    '请控制在 800 字以内，输出：1. 当前判断 2. 主要风险 3. 下一步行动 4. 需要补充的数据。',
    '',
    `项目：${project.name}（${project.code || project.id}）`,
    `状态：${labelOf(PROJECT_STATUS_LABELS, project.status)}，流程：${labelOf(PROCESS_MODE_LABELS, project.processMode)}`,
    `负责人：${project.owner}`,
    `进度：${project.progress}% / 健康分：${project.healthScore} / 风险数：${project.riskCount}`,
    `排期：${project.startDate || '未设开始'} 至 ${project.endDate || '未设结束'}`,
    `任务数：${project.tasks.length}`,
    `任务状态分布：${Object.entries(statusCounts).map(([status, count]) => `${labelOf(TASK_STATUS_LABELS, status)} ${count}`).join('、') || '无任务'}`,
    `阻塞任务：${blockedTasks.length ? blockedTasks.join('；') : '无'}`,
    `近期/已设截止任务：${overdueOrDueTasks.length ? overdueOrDueTasks.join('；') : '无'}`,
    `迭代：${sprints.length ? sprints.join('；') : '无'}`,
    `里程碑：${project.milestones.length ? project.milestones.map((item) => `${item.name} ${item.date || ''} ${labelOf(MILESTONE_STATUS_LABELS, item.status)}`).join('；') : '无'}`,
  ].join('\n');
}

function ProjectList({
  onOpen,
  currentUser,
}: {
  onOpen: (id: string) => void;
  currentUser?: SessionUser | null;
}) {
  const { data, loading, error, reload } = useAsync<Project[]>(fetchProjects, []);
  const [keyword, setKeyword] = useState(() => window.localStorage.getItem(STORAGE_KEYS.projectKeyword) ?? '');
  const [filter, setFilter] = useState<ProjectFilter>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.projectFilter);
    return saved === 'mine' || saved === 'risk' || saved === 'active' ? saved : 'all';
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const canCreateProject = canOperate(currentUser, 'projects:create');
  const canUpdateProject = canOperate(currentUser, 'projects:update');
  const canDeleteProject = canOperate(currentUser, 'projects:delete');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.projectKeyword, keyword);
  }, [keyword]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.projectFilter, filter);
  }, [filter]);

  const sortedProjects = useMemo(() => sortProjects(data ?? []), [data]);

  const filtered = useMemo(
    () => filterProjects(sortedProjects, keyword, filter, currentUser),
    [sortedProjects, keyword, filter, currentUser],
  );

  async function handleDelete(project: Project) {
    if (!canDeleteProject) {
      toast.error('当前账号无权删除项目。');
      return;
    }
    const confirmed = await confirm({
      title: `删除项目“${project.name}”？`,
      description: '该项目下的任务、迭代和项目成员关系也会一并删除，操作后无法恢复。',
      confirmText: '删除项目',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      toast.success(`已删除项目：${project.name}`);
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除项目失败');
    }
  }

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'name',
      title: '项目',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (project) => (
        <div>
          <div className="font-medium">{project.name}</div>
          <div className="text-secondary" style={{ fontSize: 12 }}>
            {labelOf(PROCESS_MODE_LABELS, project.processMode)} · {project.code || '未设置代号'}
          </div>
        </div>
      ),
    },
    { key: 'owner', title: '负责人', render: (project) => project.owner || '-' },
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
      sorter: (a, b) => a.healthScore - b.healthScore,
      render: (project) => (
        <StatusBadge
          label={String(project.healthScore)}
          variant={healthVariant(project.healthScore)}
          showDot={false}
        />
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
      width: 180,
      sorter: (a, b) => a.progress - b.progress,
      render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
    },
    {
      key: 'actions',
      title: '操作',
      width: 140,
      render: (project) => (
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <button className="btn btn-text btn-xs" onClick={() => onOpen(project.id)}>
            查看
          </button>
          {canUpdateProject ? (
            <button className="btn btn-text btn-xs" onClick={() => setEditing(project)}>
              编辑
            </button>
          ) : null}
          {canDeleteProject ? (
            <button
              className="btn btn-text btn-xs"
              style={{ color: 'var(--color-red, #dc2626)' }}
              onClick={() => handleDelete(project)}
            >
              删除
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  if (loading || error) {
    return <PageState loading={loading} error={error} onRetry={reload} />;
  }

  const filterButtons: { key: ProjectFilter; label: string }[] = [
    { key: 'all', label: '全部项目' },
    { key: 'mine', label: '我的项目' },
    { key: 'risk', label: '高风险' },
    { key: 'active', label: '进行中' },
  ];

  return (
    <Panel
      title="项目驾驶舱"
      subtitle={`当前展示 ${filtered.length} / ${sortedProjects.length} 个项目`}
      toolbar={canCreateProject ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建项目</button> : undefined}
    >
      <div className="project-cockpit-toolbar">
        <div className="project-cockpit-search">
          <input
            className="form-input"
            placeholder="搜索项目..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="project-cockpit-filters">
          {filterButtons.map((item) => (
            <button
              key={item.key}
              className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey="id"
        onRowClick={(project) => onOpen(project.id)}
        emptyText={keyword ? '没有匹配的项目。' : '暂无项目。'}
      />

      {creating && canCreateProject && (
        <CreateProjectForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {editing && canUpdateProject && (
        <EditProjectForm
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </Panel>
  );
}

function EditProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [objective, setObjective] = useState(project.objective ?? '');
  const [code, setCode] = useState(project.code ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [owner, setOwner] = useState(project.owner);
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(String(project.progress));
  const [processMode, setProcessMode] = useState(project.processMode);
  const [programId, setProgramId] = useState(project.programId ?? '');
  const [productId, setProductId] = useState(project.productId ?? '');
  const [milestones, setMilestones] = useState<Milestone[]>(project.milestones ?? []);
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [endDate, setEndDate] = useState(project.endDate ?? '');
  const [sourcePath, setSourcePath] = useState(project.sourcePath ?? '');
  const [showSource, setShowSource] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: programs } = useAsync(fetchPrograms, []);
  const { data: products } = useAsync(fetchProducts, []);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('项目名称不能为空。');

    setSubmitting(true);
    try {
      await updateProject(project.id, {
        version: project.version,
        name: name.trim(),
        objective: objective.trim() || undefined,
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        owner: owner.trim(),
        status,
        progress: Number(progress),
        processMode,
        programId: programId || undefined,
        productId: productId || undefined,
        milestones,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sourcePath: sourcePath.trim() || undefined,
      });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存项目失败');
    } finally {
      setSubmitting(false);
    }
  }

  function addMilestoneItem() {
    setMilestones([...milestones, { name: '', status: 'planned', date: '' }]);
  }

  function updateMilestone(idx: number, field: keyof Milestone, value: string) {
    const next = milestones.map((milestone, index) =>
      index === idx ? { ...milestone, [field]: value } : milestone,
    );
    setMilestones(next);
  }

  function removeMilestone(idx: number) {
    setMilestones(milestones.filter((_, index) => index !== idx));
  }

  return (
    <Overlay onClose={onClose} maxWidth={860}>
      <Panel
        className="project-form-panel"
        title="编辑项目"
        subtitle={`${project.name} · ${project.id}`}
        footer={(
          <div className="project-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      >
        {formError && <div className="form-error project-form-error">{formError}</div>}

        <div className="project-form-section">
          <div className="project-form-section-title">基本信息</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">项目代号</label>
              <input className="form-input" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">项目目标</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="说明项目要达成的业务结果或客户价值"
            />
          </div>
          <div className="form-group">
            <label className="form-label">项目描述</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} />
          </div>
        </div>

        <div className="project-form-section">
          <div className="project-form-section-title">排期与进度</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">开始日期</label>
              <input className="form-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">结束日期</label>
              <input className="form-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">进度</label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} style={{ flex: 1 }} />
                <input className="form-input" type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} style={{ width: 64 }} />
                <span>%</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>
                {PROJECT_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {labelOf(PROJECT_STATUS_LABELS, item)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">流程模式</label>
            <select className="form-select" value={processMode} onChange={(event) => setProcessMode(event.target.value)}>
              <option value="scrum">Scrum</option>
              <option value="kanban">看板</option>
              <option value="waterfall">瀑布</option>
            </select>
          </div>
        </div>

        <div className="project-form-section">
          <div className="project-form-section-title">关联信息</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">所属项目集</label>
              <select className="form-select" value={programId} onChange={(event) => setProgramId(event.target.value)}>
                <option value="">无</option>
                {(programs ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">关联产品</label>
              <select className="form-select" value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">无</option>
                {(products ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="project-form-section">
          <div className="project-form-section-title project-form-section-title-row">
            <span>里程碑</span>
            <button className="btn btn-text btn-sm" style={{ marginLeft: 8 }} onClick={addMilestoneItem} type="button">
              + 添加
            </button>
          </div>
          {milestones.length === 0 ? (
            <div className="text-secondary" style={{ fontSize: 13, padding: '4px 0' }}>暂未定义里程碑。</div>
          ) : (
            <div className="project-milestone-list">
              {milestones.map((milestone, idx) => (
                <div key={idx} className="project-milestone-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <input className="form-input" value={milestone.name} onChange={(event) => updateMilestone(idx, 'name', event.target.value)} placeholder="里程碑名称" />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <input className="form-input" type="date" value={milestone.date} onChange={(event) => updateMilestone(idx, 'date', event.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <select className="form-select" value={milestone.status} onChange={(event) => updateMilestone(idx, 'status', event.target.value)}>
                      <option value="planned">计划中</option>
                      <option value="in_progress">进行中</option>
                      <option value="completed">已完成</option>
                      <option value="delayed">已延期</option>
                    </select>
                  </div>
                  <button className="btn btn-text btn-sm" onClick={() => removeMilestone(idx)} type="button">x</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="project-form-section project-form-section-compact">
          <button className="project-source-toggle" onClick={() => setShowSource(!showSource)} type="button">
            {showSource ? '▼' : '▶'} 源码路径
          </button>
          {showSource && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">服务端源码路径</label>
              <input
                className="form-input"
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="例如：/home/projects/my-app"
              />
            </div>
          )}
        </div>

      </Panel>
    </Overlay>
  );
}

function CreateProjectForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [objective, setObjective] = useState('');
  const [processMode, setProcessMode] = useState('scrum');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入项目名称。');
    if (!owner.trim()) return setFormError('请输入负责人。');

    setSubmitting(true);
    try {
      const input: CreateProjectInput = { name: name.trim(), owner: owner.trim(), objective: objective.trim() || undefined, processMode };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('project-create'),
          payload,
        };
      }
      await createProject(input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建项目失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel
        className="project-form-panel"
        title="新建项目"
        subtitle="录入项目基本信息，后续可继续补充排期、关联产品和里程碑。"
        footer={(
          <div className="project-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        )}
      >
        {formError && <div className="form-error project-form-error">{formError}</div>}

        <div className="project-create-layout">
          <div className="project-form-section">
            <div className="project-form-section-title">项目基础</div>
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入项目名称" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">负责人</label>
                <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="请输入负责人姓名" />
              </div>
              <div className="form-group">
                <label className="form-label">流程模式</label>
                <select className="form-select" value={processMode} onChange={(event) => setProcessMode(event.target.value)}>
                  <option value="scrum">Scrum</option>
                  <option value="kanban">看板</option>
                  <option value="waterfall">瀑布</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">项目目标</label>
              <textarea className="form-textarea" rows={2} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="例如：将客户自助开通时长缩短至 5 分钟以内" />
            </div>
          </div>

          <div className="project-create-hint">
            <div className="project-create-hint-title">创建后可继续完善</div>
            <div className="project-create-hint-grid">
              <span>排期计划</span>
              <span>项目成员</span>
              <span>关联产品</span>
              <span>交付里程碑</span>
            </div>
          </div>
        </div>

      </Panel>
    </Overlay>
  );
}

function CreateSprintForm({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入迭代名称。');

    setSubmitting(true);
    try {
      const input: CreateSprintInput = {
        name: name.trim(),
        goal: goal.trim() || undefined,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('sprint-create'),
          payload,
        };
      }
      await createSprint(projectId, input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建迭代失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="新建迭代" subtitle="为项目添加一个迭代">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">迭代名称</label>
          <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Sprint 4" />
        </div>
        <div className="form-group">
          <label className="form-label">迭代目标</label>
          <input className="form-input" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="本次迭代目标" />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function CreateWbsTaskForm({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入任务标题。');

    setSubmitting(true);
    try {
      const input: CreateWbsTaskInput = {
        title: title.trim(),
        assigneeId: assigneeId.trim() || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('task-create'),
          payload,
        };
      }
      await createWbsTask(projectId, input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="新建 WBS 任务" subtitle="在工作分解结构中添加一项任务">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">任务标题</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务标题" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} placeholder="负责人" />
          </div>
          <div className="form-group">
            <label className="form-label">预估工时 (h)</label>
            <input className="form-input" type="number" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function OverviewTab({
  project,
  projectId,
  onReload,
  canManageProject,
}: {
  project: ProjectDetail;
  projectId: string;
  onReload: () => void;
  canManageProject: boolean;
}) {
  const [creatingSprint, setCreatingSprint] = useState(false);
  const {
    data: delivery,
    loading: deliveryLoading,
    error: deliveryError,
    reload: reloadDelivery,
  } = useAsync<ProjectDeliveryData>(() => fetchProjectDeliveryData(project), [project.id, project.productId ?? '']);

  return (
    <div className="project-overview-stack">
      <ProjectDeliveryPanel
        project={project}
        data={delivery}
        loading={deliveryLoading}
        error={deliveryError}
        onRetry={reloadDelivery}
      />

      <div className="grid-2">
        <Panel title="里程碑" subtitle={project.milestones.length ? `共 ${project.milestones.length} 个` : '暂无里程碑'}>
          {project.milestones.length === 0 ? (
            <div className="text-secondary">暂未定义里程碑。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.milestones.map((milestone, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="font-medium">{milestone.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-secondary text-mono">{milestone.date}</span>
                    <StatusBadge label={labelOf(MILESTONE_STATUS_LABELS, milestone.status)} status={milestone.status} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="迭代"
          subtitle={`${project.sprints.length} 个迭代`}
          toolbar={canManageProject ? <button className="btn btn-primary btn-sm" onClick={() => setCreatingSprint(true)}>新建迭代</button> : undefined}
        >
          {project.sprints.length === 0 ? (
            <div className="text-secondary">该项目暂无迭代。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.sprints.map((sprint) => (
                <SprintBurndownRow key={sprint.id} sprint={sprint} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {creatingSprint && canManageProject && (
        <CreateSprintForm
          projectId={projectId}
          onClose={() => setCreatingSprint(false)}
          onCreated={() => {
            setCreatingSprint(false);
            onReload();
          }}
        />
      )}
    </div>
  );
}

function WbsTab({ tasks, projectId, onReload, canManageProject }: { tasks: Task[]; projectId: string; onReload: () => void; canManageProject: boolean }) {
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [ownerFilter, setOwnerFilter] = useState(() => window.localStorage.getItem(STORAGE_KEYS.wbsOwner) ?? '');
  const [statusFilter, setStatusFilter] = useState(() => window.localStorage.getItem(STORAGE_KEYS.wbsStatus) ?? '');
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.wbsOwner, ownerFilter);
  }, [ownerFilter]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.wbsStatus, statusFilter);
  }, [statusFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (ownerFilter && task.owner !== ownerFilter) return false;
      if (statusFilter && task.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, ownerFilter, statusFilter]);

  const roots = filteredTasks
    .filter((task) => !task.parentId)
    .sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }));
  const byParent: Record<string, Task[]> = {};

  filteredTasks.forEach((task) => {
    if (!task.parentId) return;
    if (!byParent[task.parentId]) byParent[task.parentId] = [];
    byParent[task.parentId].push(task);
  });

  for (const parentId of Object.keys(byParent)) {
    byParent[parentId].sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }));
  }

  const ownerOptions = Array.from(new Set(tasks.map((task) => task.owner).filter(Boolean)));

  function getChildren(task: Task): Task[] {
    return byParent[task.id] ?? [];
  }

  const columns: TreeTableColumn<Task>[] = [
    {
      key: 'title',
      title: '任务',
      width: 220,
      render: (task) => <span className="font-medium">{task.wbsCode} {task.title}</span>,
    },
    { key: 'owner', title: '负责人', render: (task) => task.owner || '-' },
    {
      key: 'status',
      title: '状态',
      render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
    },
    {
      key: 'estimatedHours',
      title: '预估(h)',
      align: 'right',
      render: (task) => task.estimatedHours ?? '-',
    },
    {
      key: 'remainingHours',
      title: '剩余(h)',
      align: 'right',
      render: (task) => <span className="text-mono">{task.remainingHours ?? 0}</span>,
    },
    {
      key: 'progress',
      title: '进度',
      width: 160,
      render: (task) => <ProgressBar percent={task.progress ?? 0} height={6} />,
    },
  ];

  async function handleDelete(taskId: string) {
    if (!canManageProject) {
      toast.error('当前账号无权删除任务。');
      return;
    }
    const confirmed = await confirm({
      title: '删除该任务？',
      description: '删除后任务进度、工时和看板位置将不可恢复。',
      confirmText: '删除任务',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteTask(taskId);
      toast.success('任务已删除');
      onReload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除任务失败');
    }
  }

  return (
    <>
      <Panel
        title="WBS"
        subtitle={`当前显示 ${filteredTasks.length} 个任务`}
        toolbar={
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <select className="form-select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="">全部负责人</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
            <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(TASK_STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
            {canManageProject ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建任务</button> : null}
          </div>
        }
      >
        <TreeTable<Task>
          columns={columns}
          data={roots}
          getChildren={getChildren}
          getDepth={(task) => {
            let depth = 0;
            let currentParentId = task.parentId;
            while (currentParentId) {
              depth += 1;
              currentParentId = filteredTasks.find((item) => item.id === currentParentId)?.parentId ?? null;
            }
            return depth;
          }}
          rowKey="id"
          expandedIds={new Set(filteredTasks.filter((task) => !collapsed.has(task.id)).map((task) => task.id))}
          onToggleExpand={(id) => {
            const next = new Set(collapsed);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setCollapsed(next);
          }}
          selectedIds={selectedId ? new Set([selectedId]) : undefined}
          onRowClick={(task) => setSelectedId(task.id)}
          rowActions={(task) => (
            <div className="flex items-center gap-1">
              {canManageProject ? (
                <>
                  <button className="btn btn-text btn-xs" onClick={() => setEditingTask(task)}>编辑</button>
                  <button className="btn btn-text btn-xs" onClick={() => handleDelete(task.id)} style={{ color: 'var(--color-red, #dc2626)' }}>删除</button>
                </>
              ) : null}
              <button className="btn btn-text btn-xs" onClick={() => setDetailTask(task)}>详情</button>
            </div>
          )}
          emptyText="该项目下还没有匹配的 WBS 任务。"
        />
      </Panel>

      {creating && canManageProject && (
        <CreateWbsTaskForm
          projectId={projectId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onReload();
          }}
        />
      )}
      {editingTask && canManageProject && (
        <EditTaskForm
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => {
            setEditingTask(null);
            onReload();
          }}
        />
      )}
      {detailTask && <TaskDetailView task={detailTask} onClose={() => setDetailTask(null)} onUpdated={() => onReload()} />}
    </>
  );
}

function KanbanTab({ projectId, canManageProject }: { projectId: string; canManageProject: boolean }) {
  const { data, loading, error, reload } = useAsync<KanbanColumn[]>(() => fetchProjectKanban(projectId), [projectId]);
  const [columns, setColumns] = useState<KanbanColumn[] | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [movingError, setMovingError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    setColumns(data);
  }, [data]);

  function handleDragStart(taskId: string) {
    if (!canManageProject) return;
    setDragTaskId(taskId);
  }

  function handleDragEnd() {
    setDragTaskId(null);
    setDragOverColumn(null);
  }

  function handleDragOver(columnId: string, event: React.DragEvent<HTMLDivElement>) {
    if (!canManageProject) return;
    event.preventDefault();
    if (dragOverColumn !== columnId) setDragOverColumn(columnId);
  }

  async function handleDrop(targetColumnId: string, event: React.DragEvent<HTMLDivElement>) {
    if (!canManageProject) return;
    event.preventDefault();
    const taskId = dragTaskId;
    setDragTaskId(null);
    setDragOverColumn(null);
    if (!taskId || !columns) return;

    const sourceColumn = columns.find((column) => column.tasks.some((task) => task.id === taskId));
    if (!sourceColumn) return;

    const task = sourceColumn.tasks.find((item) => item.id === taskId);
    if (!task || sourceColumn.id === targetColumnId) return;

    const nextColumns = columns.map((column) => {
      if (column.id === sourceColumn.id) {
        return { ...column, tasks: column.tasks.filter((item) => item.id !== taskId) };
      }
      if (column.id === targetColumnId) {
        return { ...column, tasks: [...column.tasks, { ...task, kanbanColumn: targetColumnId }] };
      }
      return column;
    });

    setColumns(nextColumns);
    setMovingError(null);

    try {
      await updateTaskKanban(taskId, { version: task.version, kanbanColumn: targetColumnId });
      toast.success(`任务已移动到「${labelOf(TASK_STATUS_LABELS, targetColumnId)}」`);
    } catch (err: unknown) {
      setMovingError(err instanceof ApiError ? err.message : '移动失败，已回滚。');
      setColumns(columns);
    }
  }

  if (loading || error || !columns) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !columns} onRetry={reload} />;
  }

  const totalTasks = columns.reduce((sum, column) => sum + column.tasks.length, 0);
  const doneTasks = columns.find((column) => column.id === 'done')?.tasks.length ?? 0;
  const blockedTasks = columns.find((column) => column.id === 'blocked')?.tasks.length ?? 0;
  const activeTasks = Math.max(0, totalTasks - doneTasks);

  return (
    <div className="project-board-shell">
      <div className="project-board-toolbar">
        <div className="project-board-toolbar-left">
          <span className="project-board-icon"><KanbanSquare size={17} /></span>
          <div>
            <div className="project-board-title">项目看板</div>
            <div className="project-board-subtitle">{canManageProject ? '拖拽卡片即可在列之间移动任务，状态会自动同步。' : '当前账号为只读模式，可查看任务流转状态。'}</div>
          </div>
        </div>
        <div className="project-board-stats">
          <span><strong>{totalTasks}</strong> 全部</span>
          <span><strong>{activeTasks}</strong> 进行中</span>
          <span className={blockedTasks > 0 ? 'risk' : ''}><strong>{blockedTasks}</strong> 阻塞</span>
        </div>
      </div>
      {movingError && <div className="form-error" style={{ marginBottom: 12 }}>{movingError}</div>}
      <div className="kanban-board">
        {columns.map((column) => {
          const isDropTarget = dragOverColumn === column.id;
          const averageProgress = column.tasks.length
            ? Math.round(column.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / column.tasks.length)
            : 0;
          return (
            <div
              key={column.id}
              className={`kanban-column${isDropTarget ? ' kanban-column-drop' : ''}`}
              onDragOver={(event) => handleDragOver(column.id, event)}
              onDragLeave={() => setDragOverColumn((current) => (current === column.id ? null : current))}
              onDrop={(event) => handleDrop(column.id, event)}
            >
              <div className="kanban-column-header">
                <div className="kanban-column-heading">
                  <span className={`kanban-column-dot ${column.id}`} />
                  <div>
                    <div className="kanban-column-title">{labelOf(TASK_STATUS_LABELS, column.id)}</div>
                    <div className="kanban-column-meta">{averageProgress}% 平均进度</div>
                  </div>
                </div>
                <span className="tag">{column.tasks.length}</span>
              </div>
              <div className="kanban-column-body">
                {column.tasks.length === 0 ? (
                  <div className="kanban-empty">
                    <Plus size={18} />
                    <span>暂无卡片</span>
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`card kanban-card${dragTaskId === task.id ? ' kanban-card-dragging' : ''}`}
                       draggable={canManageProject}
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="kanban-card-grip"><GripVertical size={14} /></div>
                      <div className="kanban-card-title">
                        <span className="font-medium">{task.title}</span>
                      </div>
                      <div className="kanban-card-code text-mono">{task.wbsCode}</div>
                      <ProgressBar percent={task.progress ?? 0} height={4} showPercent={false} />
                      <div className="kanban-card-meta">
                        <span className="flex items-center gap-1">
                          {task.owner && <span className="kanban-avatar">{(task.owner || '?').slice(0, 1)}</span>}
                          <span className="text-secondary" style={{ fontSize: 12 }}>{task.owner || '未指派'}</span>
                        </span>
                        <span className="text-mono text-secondary" style={{ fontSize: 12 }}>{task.progress}%</span>
                      </div>
                      <div className="kanban-card-footer">
                        <span><UserRound size={12} /> {task.owner || '未指派'}</span>
                        {task.dueDate ? <span><Clock3 size={12} /> {task.dueDate.slice(5)}</span> : null}
                        {task.status === 'blocked' ? <span className="risk"><AlertTriangle size={12} /> 阻塞</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditTaskForm({ task, onClose, onUpdated }: { task: Task; onClose: () => void; onUpdated: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [owner, setOwner] = useState(task.owner ?? '');
  const [status, setStatus] = useState(task.status);
  const [estimatedHours, setEstimatedHours] = useState(String(task.estimatedHours ?? ''));
  const [progress, setProgress] = useState(String(task.progress ?? 0));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('任务名称不能为空。');

    setSubmitting(true);
    try {
      await updateTask(task.id, {
        version: task.version,
        title: title.trim(),
        owner: owner.trim() || undefined,
        status,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        progress: Number(progress),
      });
      onUpdated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="编辑任务" subtitle={task.wbsCode}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">任务名称</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">状态</label>
            <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(TASK_STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">预估工时 (h)</label>
            <input className="form-input" type="number" min={0} value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">进度 (%)</label>
            <input className="form-input" type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function TaskDetailView({ task, onClose }: { task: Task; onClose: () => void; onUpdated: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <Panel title={task.title} subtitle={task.wbsCode}>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">编码</span>
            <span className="text-mono">{task.wbsCode}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">负责人</span>
            <span>{task.owner || '-'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">状态</span>
            <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />
          </div>
          <div className="detail-field">
            <span className="detail-label">预估工时</span>
            <span>{task.estimatedHours ?? '-'}h</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">剩余工时</span>
            <span>{task.remainingHours ?? 0}h</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">进度</span>
            <ProgressBar percent={task.progress ?? 0} height={8} />
          </div>
          <div className="detail-field">
            <span className="detail-label">描述</span>
            <span>{task.description || '暂无描述'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">截止日期</span>
            <span>{task.dueDate || '-'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
        </div>
      </Panel>
    </Overlay>
  );
}

function ProjectDetailView({ id, onBack, user }: { id: string; onBack: () => void; user?: SessionUser | null }) {
  const { data, loading, error, reload } = useAsync<ProjectDetail>(() => fetchProject(id), [id]);
  const [tab, setTab] = useState<DetailTab>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.detailTab);
    return saved === 'wbs' || saved === 'kanban' || saved === 'flow' || saved === 'governance' || saved === 'source' ? saved : 'overview';
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
              <FolderTree size={20} />
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
            <span><Code2 size={14} /> {project.sourcePath || '未配置源码路径'}</span>
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
        {(['overview', 'wbs', 'kanban', 'flow', 'governance', 'source'] as DetailTab[]).map((key) => (
          <button key={key} className={`nav-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {key === 'overview' ? '概览' : key === 'wbs' ? 'WBS' : key === 'kanban' ? '看板' : key === 'flow' ? '流程' : key === 'governance' ? '风险与决策' : '源码'}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab project={project} projectId={id} onReload={reload} canManageProject={canUpdateProject} />}
      {tab === 'wbs' && <WbsTab tasks={project.tasks} projectId={id} onReload={reload} canManageProject={canUpdateProject} />}
      {tab === 'kanban' && <KanbanTab projectId={id} canManageProject={canUpdateProject} />}
      {tab === 'flow' && <FlowTab projectId={id} />}
      {tab === 'governance' && <GovernanceTab projectId={id} canManageProject={canUpdateProject} onProjectReload={reload} />}
      {tab === 'source' && <SourceTab projectId={id} sourcePath={project.sourcePath ?? null} />}
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

function ProjectsPage({ user }: { user?: SessionUser | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const syncFocus = () => {
      const hash = window.location.hash;
      const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const focusId = new URLSearchParams(query).get('focus');
      if (focusId) setSelectedId(focusId);
    };

    syncFocus();
    window.addEventListener('hashchange', syncFocus);
    return () => window.removeEventListener('hashchange', syncFocus);
  }, []);

  function handleBack() {
    const [pathPart] = window.location.hash.split('?');
    if (window.location.hash.includes('focus=')) window.location.hash = pathPart;
    setSelectedId(null);
  }

  return (
    <div>
      <PageHeader
        title="项目管理"
        description="管理项目、工作分解结构、流程看板和源码浏览。"
      />
      {selectedId ? (
        <ProjectDetailView id={selectedId} onBack={handleBack} user={user} />
      ) : (
        <ProjectList onOpen={setSelectedId} currentUser={user} />
      )}
    </div>
  );
}

export default ProjectsPage;
