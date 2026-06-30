import { useEffect, useMemo, useState } from 'react';
import {
  createRequirement,
  deleteRequirement,
  fetchAiBusinessAdvice,
  fetchProjects,
  fetchRequirements,
  updateRequirement,
  updateRequirementStatus,
  type RequirementFilters,
} from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import { getSessionUser } from '../services/auth';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import FilterBar from '../components/common/FilterBar';
import TreeTable, { type TreeTableColumn } from '../components/common/TreeTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import type { AiBusinessAdvice, Project, Requirement } from '../types';
import {
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../constants/enums';
import { canOperate } from '../constants/roles';

const ASSIGNMENT_STATUS_OPTIONS = [
  { value: 'unassigned', label: '待分配' },
  { value: 'assigned', label: '已分配' },
  { value: 'in_progress', label: '处理中' },
  { value: 'ready_for_test', label: '提测中' },
  { value: 'verified', label: '已验证' },
];

const EXEC_ROLE_OPTIONS = [
  { value: 'dev', label: '开发' },
  { value: 'qa', label: '测试' },
];

function clearRequirementFocusFromHash() {
  const hash = window.location.hash;
  const [pathPart, queryPart] = hash.split('?');
  if (!queryPart) return;
  const params = new URLSearchParams(queryPart);
  if (!params.has('focus')) return;
  params.delete('focus');
  const nextQuery = params.toString();
  window.location.hash = nextQuery ? `${pathPart}?${nextQuery}` : pathPart;
}

function RequirementsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageRequirements = canOperate(sessionUser, 'requirements:manage');
  const [filters, setFilters] = useState<RequirementFilters>({});
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const projectsState = useAsync<Project[]>(fetchProjects, []);
  const { data, loading, error, reload } = useAsync<Requirement[]>(
    () => fetchRequirements(filters),
    [filters.keyword, filters.status, filters.priority, filters.projectId],
  );

  const projects = projectsState.data ?? [];
  const requirements = data ?? [];
  const roots = requirements.filter((item) => !item.parentId);
  const childrenMap = useMemo(() => {
    const map: Record<string, Requirement[]> = {};
    requirements.forEach((item) => {
      if (!item.parentId) return;
      if (!map[item.parentId]) map[item.parentId] = [];
      map[item.parentId].push(item);
    });
    return map;
  }, [requirements]);

  useEffect(() => {
    const syncFocus = () => {
      const hash = window.location.hash;
      const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      setFocusId(new URLSearchParams(query).get('focus'));
    };

    syncFocus();
    window.addEventListener('hashchange', syncFocus);
    return () => window.removeEventListener('hashchange', syncFocus);
  }, []);

  useEffect(() => {
    if (!focusId || requirements.length === 0 || selected?.id === focusId) return;
    const matched = requirements.find((item) => item.id === focusId);
    if (matched) setSelected(matched);
  }, [focusId, requirements, selected]);

  function handleCloseDetail() {
    clearRequirementFocusFromHash();
    setFocusId(null);
    setSelected(null);
  }

  function handleUpdatedDetail() {
    clearRequirementFocusFromHash();
    setFocusId(null);
    setSelected(null);
    reload();
  }

  const columns: TreeTableColumn<Requirement>[] = [
    {
      key: 'title',
      title: '需求',
      render: (item) => <span className="font-medium">{item.id} {item.title}</span>,
    },
    {
      key: 'priority',
      title: '优先级',
      align: 'center',
      render: (item) => <StatusBadge status={item.priority} label={labelOf(PRIORITY_LABELS, item.priority)} showDot={false} />,
    },
    {
      key: 'status',
      title: '状态',
      render: (item) => <StatusBadge status={item.status} label={labelOf(REQUIREMENT_STATUS_LABELS, item.status)} />,
    },
    {
      key: 'assignment',
      title: '执行人',
      render: (item) => item.assignee ? `${item.assignee}${item.assigneeRole ? ` · ${labelOf(USER_ROLE_LABELS, item.assigneeRole)}` : ''}` : '未分配',
    },
    {
      key: 'completion',
      title: '完成度',
      width: 180,
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProgressBar percent={item.completion ?? 0} height={6} />
          <span className="text-mono" style={{ minWidth: 42 }}>{item.completion ?? 0}%</span>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (item) => (
        canManageRequirements ? (
          <button
            className="btn btn-text btn-xs"
            style={{ color: 'var(--color-red, #dc2626)' }}
            onClick={(event) => {
              event.stopPropagation();
              void handleDelete(item);
            }}
          >
            删除
          </button>
        ) : <span className="text-secondary">只读</span>
      ),
    },
  ];

  function setFilter(key: keyof RequirementFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function handleDelete(requirement: Requirement) {
    if (!canManageRequirements) {
      toast.error('当前账号无权删除需求。');
      return;
    }
    const confirmed = await confirm({
      title: `删除需求“${requirement.title}”？`,
      description: '删除后需求记录将不可恢复，请确认它没有仍在流转中的任务或测试依赖。',
      confirmText: '删除需求',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteRequirement(requirement.id);
      toast.success(`已删除需求：${requirement.title}`);
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除需求失败');
    }
  }

  return (
    <div>
      <PageHeader
        title="需求管理"
        description="管理需求池、角色指派、开发提测和测试回归链路。"
        actions={canManageRequirements ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建需求</button> : undefined}
      />

      <Panel title="需求池" subtitle={`共 ${requirements.length} 条需求`}>
        <FilterBar trailing={<button className="btn btn-secondary btn-sm" onClick={reload}>刷新</button>}>
          <input className="form-input filter-search" placeholder="搜索需求标题" value={filters.keyword ?? ''} onChange={(e) => setFilter('keyword', e.target.value)} />
          <select className="form-select" value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">全部状态</option>
            {REQUIREMENT_STATUSES.map((item) => <option key={item} value={item}>{labelOf(REQUIREMENT_STATUS_LABELS, item)}</option>)}
          </select>
          <select className="form-select" value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)}>
            <option value="">全部优先级</option>
            {REQUIREMENT_PRIORITIES.map((item) => <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>)}
          </select>
          <select className="form-select filter-project" value={filters.projectId ?? ''} onChange={(e) => setFilter('projectId', e.target.value)}>
            <option value="">全部项目</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </FilterBar>

        <div className="filter-bar-divider" />

        {loading || error ? (
          <PageState loading={loading} error={error} onRetry={reload} />
        ) : (
          <TreeTable
            columns={columns}
            data={roots}
            getChildren={(item) => childrenMap[item.id] ?? []}
            getDepth={(item) => {
              let depth = 0;
              let current = item.parentId;
              while (current) {
                depth += 1;
                current = requirements.find((candidate) => candidate.id === current)?.parentId ?? null;
              }
              return depth;
            }}
            rowKey="id"
            onRowClick={setSelected}
            emptyText="当前没有符合条件的需求。"
          />
        )}
      </Panel>

      {creating && canManageRequirements ? (
        <CreateRequirementForm
          projects={projects}
          requirements={requirements}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}

      {selected ? (
        <RequirementDetail
          requirement={selected}
          projects={projects}
          allRequirements={requirements}
          canManage={canManageRequirements}
          onClose={handleCloseDetail}
          onUpdated={handleUpdatedDetail}
        />
      ) : null}
    </div>
  );
}

function AdviceList({ title, items }: { title: string; items?: string[] }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="requirement-ai-advice-block">
      <strong>{title}</strong>
      <ul>
        {list.map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function CreateRequirementForm({
  projects,
  requirements,
  onClose,
  onCreated,
}: {
  projects: Project[];
  requirements: Requirement[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [parentId, setParentId] = useState('');
  const [owner, setOwner] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('dev');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) return setFormError('请输入需求标题。');
    if (!projectId) return setFormError('请选择所属项目。');
    setFormError(null);
    setSubmitting(true);
    try {
      await createRequirement({
        title: title.trim(),
        projectId,
        parentId: parentId || undefined,
        owner: owner.trim() || undefined,
        assignee: assignee.trim() || undefined,
        assigneeRole: assignee.trim() ? assigneeRole : undefined,
        priority,
        description: description.trim() || undefined,
        acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
      });
      onCreated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '创建需求失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="新建需求" subtitle="创建需求并直接分配给开发或测试。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">需求标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">请选择项目</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">优先级</label>
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {REQUIREMENT_PRIORITIES.map((item) => <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">需求负责人</label>
          <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="例如：项目经理 / 产品经理" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">执行人</label>
            <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="可直接指派开发或测试" />
          </div>
          <div className="form-group">
            <label className="form-label">执行角色</label>
            <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
              {EXEC_ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">父级需求</label>
          <select className="form-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">无</option>
            {requirements.filter((item) => !item.parentId && item.projectId === projectId).map((item) => (
              <option key={item.id} value={item.id}>{item.id} - {item.title}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">需求描述</label>
          <textarea className="form-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">验收标准（每行一条）</label>
          <textarea className="form-textarea" rows={4} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
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

function RequirementDetail({
  requirement,
  projects,
  allRequirements,
  onClose,
  onUpdated,
  canManage,
}: {
  requirement: Requirement;
  projects: Project[];
  allRequirements: Requirement[];
  onClose: () => void;
  onUpdated: () => void;
  canManage: boolean;
}) {
  const [title, setTitle] = useState(requirement.title);
  const [description, setDescription] = useState(requirement.description ?? '');
  const [priority, setPriority] = useState(requirement.priority);
  const [status, setStatus] = useState(requirement.status);
  const [assignee, setAssignee] = useState(requirement.assignee ?? '');
  const [assigneeRole, setAssigneeRole] = useState(requirement.assigneeRole ?? 'dev');
  const [assignmentStatus, setAssignmentStatus] = useState(requirement.assignmentStatus ?? (requirement.assignee ? 'assigned' : 'unassigned'));
  const [completion, setCompletion] = useState(String(requirement.completion ?? 0));
  const [criteria, setCriteria] = useState((requirement.acceptanceCriteria ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiAdvice, setAiAdvice] = useState<AiBusinessAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const projectName = projects.find((item) => item.id === requirement.projectId)?.name ?? requirement.projectId;
  const childRequirements = allRequirements.filter((item) => item.parentId === requirement.id);
  const childCount = childRequirements.length;
  const canUseAi = canOperate(getSessionUser(), 'ai:analyze');

  async function handleSave() {
    if (!canManage) {
      setFormError('当前账号无权更新需求。');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (status !== requirement.status) {
        await updateRequirementStatus(requirement.id, status);
      }
      await updateRequirement(requirement.id, {
        title: title.trim(),
        description: description.trim(),
        priority,
        assignee: assignee.trim() || null,
        assigneeRole: assignee.trim() ? assigneeRole : null,
        assignmentStatus,
        completion: Number(completion) || 0,
        acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
      });
      onUpdated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '更新需求失败');
      setSubmitting(false);
    }
  }

  async function handleAiAdvice() {
    setAiError(null);
    setAiLoading(true);
    try {
      const advice = await fetchAiBusinessAdvice({
        targetType: 'requirement',
        targetId: requirement.id,
        question: '请结合需求、任务、测试、缺陷和当前编辑草稿，给出需求拆解、验收补强、协作风险和下一步动作。',
        draft: {
          title: title.trim() || requirement.title,
          description: description.trim(),
          status,
          priority,
          assignee: assignee.trim() || null,
          assigneeRole: assignee.trim() ? assigneeRole : null,
          assignmentStatus,
          completion: Number(completion) || 0,
          acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
        },
      });
      setAiAdvice(advice);
    } catch (error) {
      setAiError(error instanceof ApiError ? error.message : 'AI 需求分析生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel
        title={requirement.title}
        subtitle={`${requirement.id} · ${projectName}`}
        toolbar={canUseAi ? (
          <button className="btn btn-primary btn-sm" onClick={handleAiAdvice} disabled={aiLoading}>
            {aiLoading ? 'AI 分析中...' : 'AI 需求分析'}
          </button>
        ) : undefined}
      >
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        {(aiAdvice || aiLoading || aiError) ? (
          <section className="requirement-ai-advice-panel">
            <div className="requirement-ai-advice-head">
              <div>
                <div className="section-title">{aiAdvice?.title || 'AI 需求分析'}</div>
                <div className="body-text">
                  基于后端真实需求、任务、测试、缺陷和当前编辑草稿生成。
                  {aiAdvice?.modelUsed ? ` · ${aiAdvice.modelUsed}` : ''}
                  {aiAdvice?.fallback ? ' · 规则兜底' : ''}
                </div>
              </div>
              {aiAdvice ? (
                <button className="btn btn-secondary btn-xs" onClick={handleAiAdvice} disabled={aiLoading}>
                  重新分析
                </button>
              ) : null}
            </div>
            {aiLoading ? <div className="body-text">AI 正在分析需求拆解、验收口径和交付风险，请稍候...</div> : null}
            {aiError ? <div className="form-error">{aiError}</div> : null}
            {aiAdvice ? (
              <div className="requirement-ai-advice-content">
                <p>{aiAdvice.summary}</p>
                <AdviceList title="风险" items={aiAdvice.risks} />
                <AdviceList title="建议" items={aiAdvice.suggestions} />
                <AdviceList title="下一步" items={aiAdvice.nextActions} />
                <AdviceList title="缺少信息" items={aiAdvice.missingInfo} />
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="detail-grid" style={{ marginBottom: 16 }}>
          <div className="detail-field">
            <span className="detail-label">需求负责人</span>
            <span>{requirement.owner || '-'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">当前执行人</span>
            <span>{requirement.assignee || '未分配'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">执行角色</span>
            <span>{requirement.assigneeRole ? labelOf(USER_ROLE_LABELS, requirement.assigneeRole) : '未设置'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">关联子需求</span>
            <span>{childCount}</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">需求标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">状态</label>
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canManage}>
              {REQUIREMENT_STATUSES.map((item) => <option key={item} value={item}>{labelOf(REQUIREMENT_STATUS_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">优先级</label>
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canManage}>
              {REQUIREMENT_PRIORITIES.map((item) => <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">执行人</label>
            <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label className="form-label">执行角色</label>
            <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)} disabled={!canManage}>
              {EXEC_ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">指派状态</label>
            <select className="form-select" value={assignmentStatus} onChange={(e) => setAssignmentStatus(e.target.value)} disabled={!canManage}>
              {ASSIGNMENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">完成度</label>
            <input className="form-input" type="number" min={0} max={100} value={completion} onChange={(e) => setCompletion(e.target.value)} disabled={!canManage} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">需求描述</label>
          <textarea className="form-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
        </div>
        <div className="form-group">
          <label className="form-label">验收标准</label>
          <textarea className="form-textarea" rows={4} value={criteria} onChange={(e) => setCriteria(e.target.value)} disabled={!canManage} />
        </div>

        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          {canManage ? (
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </button>
          ) : null}
        </div>
      </Panel>
    </Overlay>
  );
}

export default RequirementsPage;
