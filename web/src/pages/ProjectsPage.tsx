import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Code2, FileCode2, FolderTree, GripVertical, KanbanSquare, Plus, SlidersHorizontal, UserRound } from 'lucide-react';
import {
  fetchProjects,
  fetchProject,
  fetchProjectKanban,
  updateProjectStatus,
  createProject,
  createSprint,
  createWbsTask,
  updateProject,
  deleteProject,
  updateTask,
  updateTaskKanban,
  deleteTask,
  fetchSprintBurndown,
  fetchProjectFlow,
  fetchProjectSources,
  fetchSourceFile,
  fetchProjectMembers,
  addProjectMember,
  deleteProjectMember,
  fetchPrograms,
  fetchProducts,
  fetchRequirements,
  fetchTestCases,
  fetchDefects,
  fetchBuilds,
  fetchReleases,
  type CreateProjectInput,
  type CreateSprintInput,
  type CreateWbsTaskInput,
} from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import TreeTable, { type TreeTableColumn } from '../components/common/TreeTable';
import FileTree from '../components/common/FileTree';
import CodeViewer from '../components/common/CodeViewer';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import BurndownChart from '../components/common/BurndownChart';
import FlowPipeline from '../components/common/FlowPipeline';
import DefectFunnel from '../components/common/DefectFunnel';
import ResizablePanels from '../components/common/ResizablePanels';
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
  ProjectFlow,
  Milestone,
  SourceFile,
  FileTreeNode,
  SessionUser,
  ProjectMember,
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
  REQUIREMENT_STATUS_LABELS,
  BUILD_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  SPRINT_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  healthVariant,
  labelOf,
} from '../constants/enums';
import { canOperate } from '../constants/roles';

type DetailTab = 'overview' | 'wbs' | 'kanban' | 'flow' | 'source';
type ProjectFilter = 'all' | 'mine' | 'risk' | 'active';

const STORAGE_KEYS = {
  projectFilter: 'projects-list-filter',
  projectKeyword: 'projects-list-keyword',
  detailTab: 'project-detail-tab',
  wbsOwner: 'project-wbs-owner-filter',
  wbsStatus: 'project-wbs-status-filter',
};

interface ProjectDeliveryData {
  requirements: Requirement[];
  testCases: TestCase[];
  defects: Defect[];
  builds: Build[];
  releases: Release[];
}

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

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (b.riskCount !== a.riskCount) return b.riskCount - a.riskCount;
    if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
    if (a.progress !== b.progress) return a.progress - b.progress;
    return a.name.localeCompare(b.name);
  });
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

  const filtered = useMemo(() => {
    return sortedProjects.filter((project) => {
      const keywordMatch = project.name.toLowerCase().includes(keyword.trim().toLowerCase());
      if (!keywordMatch) return false;

      switch (filter) {
        case 'mine':
          return currentUser ? project.owner === currentUser.name : false;
        case 'risk':
          return project.riskCount > 0 || project.healthScore < 70;
        case 'active':
          return !['done', 'cancelled'].includes(project.status);
        default:
          return true;
      }
    });
  }, [sortedProjects, keyword, filter, currentUser]);

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
        name: name.trim(),
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
  const [processMode, setProcessMode] = useState('scrum');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入项目名称。');
    if (!owner.trim()) return setFormError('请输入负责人。');

    setSubmitting(true);
    try {
      await createProject({ name: name.trim(), owner: owner.trim(), processMode } as CreateProjectInput);
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

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入迭代名称。');

    setSubmitting(true);
    try {
      await createSprint(projectId, {
        name: name.trim(),
        goal: goal.trim() || undefined,
      } as CreateSprintInput);
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

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入任务标题。');

    setSubmitting(true);
    try {
      await createWbsTask(projectId, {
        title: title.trim(),
        assigneeId: assigneeId.trim() || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      } as CreateWbsTaskInput);
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

function ProjectDeliveryPanel({
  project,
  data,
  loading,
  error,
  onRetry,
}: {
  project: ProjectDetail;
  data: ProjectDeliveryData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const delivery = data ?? { requirements: [], testCases: [], defects: [], builds: [], releases: [] };

  const openRequirements = delivery.requirements.filter((item) => !['closed', 'cancelled'].includes(item.status));
  const acceptedRequirements = delivery.requirements.filter((item) => ['accepted', 'closed'].includes(item.status));
  const openDefects = delivery.defects.filter((item) => !['closed', 'rejected'].includes(item.status));
  const severeDefects = openDefects.filter((item) => ['high', 'critical'].includes(item.severity));
  const failedBuilds = delivery.builds.filter((item) => item.status === 'failed');
  const releasedBuilds = delivery.builds.filter((item) => item.status === 'released');
  const releasedReleases = delivery.releases.filter((item) => item.status === 'released');
  const passedCases = delivery.testCases.filter((item) => item.status === 'passed');
  const testPassRate = delivery.testCases.length
    ? Math.round((passedCases.length / delivery.testCases.length) * 100)
    : 0;

  const latestBuild = latestBy(delivery.builds, (item) => item.buildDate || item.createdAt);
  const latestRelease = latestBy(delivery.releases, (item) => item.releaseDate || item.createdAt);
  const traceRows = delivery.requirements.slice(0, 6).map((requirement) => {
    const tasks = project.tasks.filter(
      (task) => task.requirementId === requirement.id || requirement.linkedTasks.includes(task.id),
    );
    const tests = delivery.testCases.filter((item) => item.requirementId === requirement.id);
    const defects = delivery.defects.filter((item) => item.requirementId === requirement.id);
    const builds = delivery.builds.filter((item) =>
      item.linkedStories.includes(requirement.id) || defects.some((defect) => item.linkedBugs.includes(defect.id)),
    );
    const releases = delivery.releases.filter((item) =>
      item.linkedStories.includes(requirement.id) || defects.some((defect) => item.linkedBugs.includes(defect.id)),
    );
    return { requirement, tasks, tests, defects, builds, releases };
  });

  const actionItems = [
    severeDefects.length > 0 ? `优先收敛 ${severeDefects.length} 个高严重级别缺陷` : null,
    failedBuilds.length > 0 ? `复盘 ${failedBuilds.length} 次失败构建并明确责任人` : null,
    openRequirements.length > acceptedRequirements.length ? '推动未验收需求进入评审、测试或验收节点' : null,
    delivery.releases.length > 0 && releasedReleases.length === 0 ? '发布记录已创建，但还没有正式发布版本' : null,
    delivery.releases.length === 0 ? '当前项目关联产品下还没有发布记录' : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Panel
      title="项目交付总览"
      subtitle="需求、任务、测试、缺陷、构建和发布的同屏追踪"
      toolbar={<button className="btn btn-secondary btn-sm" onClick={onRetry}>刷新</button>}
    >
      {loading && !data ? (
        <PageState loading error={null} onRetry={onRetry} />
      ) : error && !data ? (
        <PageState loading={false} error={error} onRetry={onRetry} />
      ) : (
        <>
          {error && (
            <div className="helper-text" style={{ marginBottom: 12, color: 'var(--color-warning, #BF8700)' }}>
              部分交付数据刷新失败，当前展示上一次缓存结果。
            </div>
          )}

          <div className="project-delivery-grid">
            <DeliverySignal label="需求验收" value={`${acceptedRequirements.length}/${delivery.requirements.length}`} meta={`${openRequirements.length} 个未关闭`} tone="info" />
            <DeliverySignal label="任务进度" value={`${project.progress}%`} meta={`${project.tasks.length} 个 WBS 任务`} tone={project.progress >= 80 ? 'success' : 'info'} />
            <DeliverySignal label="测试通过" value={`${testPassRate}%`} meta={`${passedCases.length}/${delivery.testCases.length} 个用例`} tone={testPassRate >= 90 ? 'success' : testPassRate >= 70 ? 'warning' : 'risk'} />
            <DeliverySignal label="开放缺陷" value={openDefects.length} meta={`${severeDefects.length} 个高严重级别`} tone={severeDefects.length > 0 ? 'risk' : openDefects.length > 0 ? 'warning' : 'success'} />
            <DeliverySignal label="构建发布" value={`${releasedBuilds.length}/${delivery.builds.length}`} meta={latestBuild ? `${latestBuild.name} ${latestBuild.version ?? ''}` : '暂无构建'} tone={failedBuilds.length > 0 ? 'risk' : 'success'} />
            <DeliverySignal label="正式发布" value={releasedReleases.length} meta={latestRelease ? `${latestRelease.name} ${latestRelease.version ?? ''}` : '暂无发布'} tone={releasedReleases.length > 0 ? 'success' : 'warning'} />
          </div>

          <div className="delivery-focus-grid">
            <div className="delivery-focus-card">
              <div className="section-title">下一步动作</div>
              {actionItems.length === 0 ? (
                <p className="body-text" style={{ marginBottom: 0 }}>当前交付链路没有明显阻塞项，继续保持需求验收和构建发布节奏。</p>
              ) : (
                <ul className="delivery-action-list">
                  {actionItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
            <div className="delivery-focus-card">
              <div className="section-title">最新交付物</div>
              <div className="delivery-artifact-row">
                <span>构建</span>
                <strong>{latestBuild ? latestBuild.name : '暂无构建'}</strong>
                {latestBuild && <StatusBadge label={labelOf(BUILD_STATUS_LABELS, latestBuild.status)} status={latestBuild.status} />}
              </div>
              <div className="delivery-artifact-row">
                <span>发布</span>
                <strong>{latestRelease ? latestRelease.name : '暂无发布'}</strong>
                {latestRelease && <StatusBadge label={labelOf(RELEASE_STATUS_LABELS, latestRelease.status)} status={latestRelease.status} />}
              </div>
            </div>
          </div>

          <div className="trace-matrix">
            <div className="trace-matrix-header">
              <span>需求</span>
              <span>任务</span>
              <span>测试</span>
              <span>缺陷</span>
              <span>构建</span>
              <span>发布</span>
            </div>
            {traceRows.length === 0 ? (
              <div className="trace-matrix-empty">该项目暂无需求，先从需求管理录入业务条目。</div>
            ) : (
              traceRows.map((row) => (
                <div className="trace-matrix-row" key={row.requirement.id}>
                  <div>
                    <div className="font-medium">{row.requirement.title}</div>
                    <StatusBadge label={labelOf(REQUIREMENT_STATUS_LABELS, row.requirement.status)} status={row.requirement.status} />
                  </div>
                  <TraceMetric count={row.tasks.length} complete={row.tasks.filter((item) => item.status === 'done').length} label="任务" />
                  <TraceMetric count={row.tests.length} complete={row.tests.filter((item) => item.status === 'passed').length} label="通过" />
                  <TraceMetric count={row.defects.length} complete={row.defects.filter((item) => ['closed', 'rejected'].includes(item.status)).length} label="关闭" />
                  <TraceStatus items={row.builds} empty="未构建" label={(item) => item.name} status={(item) => item.status} labels={BUILD_STATUS_LABELS} />
                  <TraceStatus items={row.releases} empty="未发布" label={(item) => item.name} status={(item) => item.status} labels={RELEASE_STATUS_LABELS} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function DeliverySignal({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string | number;
  meta: string;
  tone: 'success' | 'warning' | 'risk' | 'info';
}) {
  return (
    <div className={`delivery-signal ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}

function TraceMetric({ count, complete, label }: { count: number; complete: number; label: string }) {
  return (
    <div className="trace-metric">
      <strong>{complete}/{count}</strong>
      <span>{label}</span>
    </div>
  );
}

function TraceStatus<T>({
  items,
  empty,
  label,
  status,
  labels,
}: {
  items: T[];
  empty: string;
  label: (item: T) => string;
  status: (item: T) => string;
  labels: Record<string, string>;
}) {
  const item = items[0];
  if (!item) return <span className="trace-empty">{empty}</span>;
  const itemStatus = status(item);
  return (
    <div className="trace-status">
      <span>{label(item)}</span>
      <StatusBadge label={labelOf(labels, itemStatus)} status={itemStatus} />
    </div>
  );
}

function latestBy<T>(items: T[], dateOf: (item: T) => string | null | undefined): T | null {
  return [...items].sort((a, b) => {
    const left = Date.parse(dateOf(a) ?? '');
    const right = Date.parse(dateOf(b) ?? '');
    return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
  })[0] ?? null;
}

function SprintBurndownRow({ sprint }: { sprint: Sprint }) {
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useAsync<BurndownData>(() => fetchSprintBurndown(sprint.id), [sprint.id, open]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <button className="btn btn-text btn-sm" style={{ padding: 0, textAlign: 'left' }} onClick={() => setOpen((value) => !value)}>
          <span className="font-medium">{open ? '▼' : '▶'} {sprint.name}</span>
          <span className="text-secondary" style={{ marginLeft: 8 }}>{sprint.goal}</span>
        </button>
        <StatusBadge label={labelOf(SPRINT_STATUS_LABELS, sprint.status)} status={sprint.status} />
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <p className="text-secondary" style={{ fontSize: 13 }}>正在加载燃尽图...</p>
          ) : error || !data ? (
            <p className="text-secondary" style={{ fontSize: 13 }}>暂无燃尽数据，设置迭代起止日期并补充任务后会显示。</p>
          ) : (
            <>
              <BurndownChart data={data} height={260} />
              <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>
                总预估 {data.totalEstimate}h，任务数 {data.taskCount}。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FlowTab({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useAsync<ProjectFlow>(() => fetchProjectFlow(projectId), [projectId]);

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="研发流程门禁" subtitle={`${data.projectName} · 按阶段自动评估，绿色表示通过，红色表示阻塞`}>
        <FlowPipeline gates={data.gates} />
      </Panel>

      <div className="grid-2">
        <Panel title="缺陷闭环" subtitle="缺陷状态漏斗与关闭转化情况">
          <DefectFunnel data={data.defectFunnel} />
        </Panel>
        <Panel title="工时与规模" subtitle="预估 / 消耗 / 剩余 三类工时数据">
          <div className="metric-grid" style={{ marginBottom: 12 }}>
            <div className="metric-card">
              <div className="metric-card-label">预估工时</div>
              <div className="metric-card-value">{data.hours.estimated}<span className="metric-card-unit">h</span></div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">已消耗</div>
              <div className="metric-card-value">{data.hours.consumed}<span className="metric-card-unit">h</span></div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">剩余工时</div>
              <div className="metric-card-value">{data.hours.remaining}<span className="metric-card-unit">h</span></div>
            </div>
          </div>
          <div className="text-secondary" style={{ fontSize: 13 }}>
            需求 {data.counts.requirements} · 任务 {data.counts.tasks} · 缺陷 {data.counts.defects} · 测试用例 {data.counts.testCases}
          </div>
        </Panel>
      </div>
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
      await updateTaskKanban(taskId, { kanbanColumn: targetColumnId });
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

function SourceTab({ projectId, sourcePath }: { projectId: string; sourcePath: string | null }) {
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [file, setFile] = useState<SourceFile | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourcePath) return;
    setTreeLoading(true);
    setTreeError(null);
    fetchProjectSources(projectId)
      .then((data) => setTree(data as unknown as FileTreeNode[]))
      .catch((err) => setTreeError(err instanceof ApiError ? err.message : '加载源码目录失败'))
      .finally(() => setTreeLoading(false));
  }, [projectId, sourcePath]);

  useEffect(() => {
    if (!selectedPath) {
      setFile(null);
      return;
    }
    setFileLoading(true);
    setFileError(null);
    fetchSourceFile(projectId, selectedPath)
      .then((data) => setFile(data))
      .catch((err) => setFileError(err instanceof ApiError ? err.message : '加载文件失败'))
      .finally(() => setFileLoading(false));
  }, [projectId, selectedPath]);

  if (!sourcePath) {
    return (
      <div className="source-workbench source-workbench-empty">
        <div className="source-workbench-toolbar">
          <div className="project-board-toolbar-left">
            <span className="project-board-icon"><Code2 size={17} /></span>
            <div>
              <div className="project-board-title">源码画板</div>
              <div className="project-board-subtitle">目录、代码画布和文件信息将在这里联动。</div>
            </div>
          </div>
        </div>
        <div className="source-canvas-empty">
          <FileCode2 size={24} />
          <span>该项目未配置源码路径，暂时无法浏览文件。</span>
        </div>
      </div>
    );
  }

  return (
    <div className="source-workbench">
      <div className="source-workbench-toolbar">
        <div className="project-board-toolbar-left">
          <span className="project-board-icon"><Code2 size={17} /></span>
          <div>
            <div className="project-board-title">源码画板</div>
            <div className="project-board-subtitle">{sourcePath}</div>
          </div>
        </div>
        <span className="source-workbench-hint"><SlidersHorizontal size={14} /> 拖动分隔条调整视图</span>
      </div>
      <ResizablePanels
        className="source-resizable"
        leftDefault={300}
        rightDefault={300}
        left={
          <div className="source-tree-panel">
            <div className="source-tree-header"><FolderTree size={15} /> 文件目录</div>
            {treeLoading ? (
              <p className="text-secondary" style={{ padding: 12, fontSize: 13 }}>加载中...</p>
            ) : treeError ? (
              <p className="form-error" style={{ padding: 12, fontSize: 13 }}>{treeError}</p>
            ) : !tree ? (
              <p className="text-secondary" style={{ padding: 12, fontSize: 13 }}>暂无数据</p>
            ) : (
              <FileTree
                items={tree}
                selectedPath={selectedPath ?? undefined}
                onFileSelect={(path) => setSelectedPath(path)}
              />
            )}
          </div>
        }
        right={
          <div className="source-inspector">
            <div className="source-tree-header"><FileCode2 size={15} /> 文件信息</div>
            {file ? (
              <div className="source-inspector-body">
                <div className="detail-field">
                  <span className="detail-label">文件名</span>
                  <span>{(file.path ?? selectedPath ?? '').split(/[\\/]/).pop() || '未命名文件'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">路径</span>
                  <span className="text-mono">{file.path ?? selectedPath}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">语言</span>
                  <span>{file.language || 'text'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">行数</span>
                  <span>{file.lineCount || file.content.split('\n').length}</span>
                </div>
              </div>
            ) : (
              <div className="source-inspector-empty">从左侧选择文件</div>
            )}
          </div>
        }
      >
        <div className="source-content-panel">
          {fileLoading ? (
            <div style={{ padding: 16 }}><p className="text-secondary" style={{ fontSize: 13 }}>加载文件中...</p></div>
          ) : fileError ? (
            <div style={{ padding: 16 }}><p className="form-error" style={{ fontSize: 13 }}>{fileError}</p></div>
          ) : !file ? (
            <div className="source-canvas-empty">
              <FileCode2 size={24} />
              <span>请从左侧选择文件以查看内容。</span>
            </div>
          ) : (
            <CodeViewer file={file} />
          )}
        </div>
      </ResizablePanels>
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

function ProjectMembersForm({
  projectId,
  projectName,
  onClose,
  canManageMembers,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  canManageMembers: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('dev');
  const [formError, setFormError] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    setFormError(null);
    try {
      const data = await fetchProjectMembers(projectId);
      setMembers(data);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '加载项目成员失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [projectId]);

  async function handleAddMember() {
    if (!canManageMembers) {
      setFormError('当前账号无权维护项目成员。');
      return;
    }
    if (!userName.trim()) {
      setFormError('请输入成员名称');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await addProjectMember(projectId, { userName: userName.trim(), role });
      setUserName('');
      await loadMembers();
      toast.success(`已添加项目成员：${userName.trim()}`);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '添加项目成员失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMember(member: ProjectMember) {
    if (!canManageMembers) {
      toast.error('当前账号无权移出项目成员。');
      return;
    }
    const confirmed = await confirm({
      title: `移出项目成员“${member.userName}”？`,
      description: '移出后该成员不会再计入项目成员统计和日报缺报统计。',
      confirmText: '移出成员',
      tone: 'warning',
    });
    if (!confirmed) return;

    try {
      await deleteProjectMember(projectId, member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      toast.success(`已移除项目成员：${member.userName}`);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '移除项目成员失败');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel
        title="项目成员管理"
        subtitle={`${projectName} · 维护项目归属成员，用于日报缺报统计与协作分派`}
        style={{ maxWidth: 760 }}
      >
        {formError ? <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div> : null}

        {canManageMembers ? <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="project-member-name">成员名称</label>
              <input
                id="project-member-name"
                className="form-input"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="输入项目成员姓名"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="project-member-role">角色</label>
              <select
                id="project-member-role"
                className="form-select"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="pdm">产品经理</option>
                <option value="dev">开发</option>
                <option value="qa">测试</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={submitting}>
              {submitting ? '添加中...' : '添加成员'}
            </button>
          </div>
        </div> : <div className="form-help-text" style={{ marginBottom: 12 }}>当前账号为只读模式，不能添加或移出项目成员。</div>}

        <Panel title="当前成员" subtitle={`共 ${members.length} 人`} noPadding>
          {loading ? (
            <div style={{ padding: 16 }} className="text-secondary">加载中...</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 16 }} className="text-secondary">当前项目还没有手工维护成员。</div>
          ) : (
            <DataTable
              rowKey="id"
              data={members}
              columns={[
                {
                  key: 'userName',
                  title: '成员',
                  render: (item) => <span className="font-medium">{item.userName}</span>,
                },
                {
                  key: 'role',
                  title: '角色',
                  render: (item) => (
                    <StatusBadge
                      status={item.role}
                      label={item.role === 'pdm' ? '产品经理' : item.role === 'dev' ? '开发' : '测试'}
                      showDot={false}
                    />
                  ),
                },
                {
                  key: 'source',
                  title: '来源',
                  render: (item) => item.source || 'manual',
                },
                {
                  key: 'createdAt',
                  title: '加入时间',
                  render: (item) => item.createdAt?.slice(0, 19).replace('T', ' ') || '-',
                },
                {
                  key: 'actions',
                  title: '操作',
                  align: 'right',
                  render: (item) => canManageMembers ? (
                    <button
                      className="btn btn-text btn-xs"
                      style={{ color: 'var(--color-red, #dc2626)' }}
                      onClick={() => void handleDeleteMember(item)}
                    >
                      移除
                    </button>
                  ) : <span className="text-secondary">只读</span>,
                },
              ]}
              emptyText="暂无项目成员"
            />
          )}
        </Panel>

        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
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
    return saved === 'wbs' || saved === 'kanban' || saved === 'flow' || saved === 'source' ? saved : 'overview';
  });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
    try {
      await updateProjectStatus(id, next);
      toast.success('项目状态已更新');
      reload();
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : '状态更新失败');
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
        {(['overview', 'wbs', 'kanban', 'flow', 'source'] as DetailTab[]).map((key) => (
          <button key={key} className={`nav-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {key === 'overview' ? '概览' : key === 'wbs' ? 'WBS' : key === 'kanban' ? '看板' : key === 'flow' ? '流程' : '源码'}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab project={project} projectId={id} onReload={reload} canManageProject={canUpdateProject} />}
      {tab === 'wbs' && <WbsTab tasks={project.tasks} projectId={id} onReload={reload} canManageProject={canUpdateProject} />}
      {tab === 'kanban' && <KanbanTab projectId={id} canManageProject={canUpdateProject} />}
      {tab === 'flow' && <FlowTab projectId={id} />}
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
