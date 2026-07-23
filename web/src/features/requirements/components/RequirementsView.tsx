import { useEffect, useMemo, useState } from 'react';
import {
  deleteRequirement,
  fetchRequirements,
  type RequirementFilters,
} from '../api';
import { fetchProjects } from '../../projects/api';
import CreateRequirementForm from './CreateRequirementForm';
import RequirementDetail from './RequirementDetail';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import PageHeader from '../../../components/common/PageHeader';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import FilterBar from '../../../components/common/FilterBar';
import TreeTable, { type TreeTableColumn } from '../../../components/common/TreeTable';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { Project, Requirement } from '../../../types';
import {
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import { clearRequirementFocusFromHash, readRequirementFocusFromHash } from './requirementsFocus';

export function RequirementCompletionCell({ completion }: { completion?: number | null }) {
  const percent = completion ?? 0;

  return (
    <div className="requirement-completion-cell" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div className="requirement-completion-bar" style={{ flex: '1 1 auto', minWidth: 0 }}>
        <ProgressBar percent={percent} height={6} showPercent={false} />
      </div>
      <span className="text-mono" style={{ minWidth: 42 }}>{percent}%</span>
    </div>
  );
}

export default function RequirementsView() {
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageRequirements = canOperate(sessionUser, 'requirements:manage');
  const [filters, setFilters] = useState<RequirementFilters>({});
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const projectsState = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const { data, loading, error, reload } = useAsync<Requirement[]>(
    () => fetchRequirements(filters),
    [filters.keyword, filters.status, filters.priority, filters.projectId],
    { cacheKey: 'requirements:list' },
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
      setFocusId(readRequirementFocusFromHash());
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
      render: (item) => <RequirementCompletionCell completion={item.completion} />,
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
