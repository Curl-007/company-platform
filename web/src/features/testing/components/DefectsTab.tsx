import { useEffect, useState } from 'react';
import {
  deleteDefect,
  fetchDefects,
  updateDefectStatus,
  type DefectFilters,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import FilterBar from '../../../components/common/FilterBar';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import StatusBadge from '../../../components/common/StatusBadge';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { Defect, Project } from '../../../types';
import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import DefectForm from './DefectForm';

export default function DefectsTab({
  focusId,
  onClearFocus,
}: {
  focusId?: string | null;
  onClearFocus: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageTesting = canOperate(sessionUser, 'testing:manage');
  const canUseAi = canOperate(sessionUser, 'ai:analyze');
  const [filters, setFilters] = useState<DefectFilters>({});
  const { data, loading, error, reload } = useAsync<Defect[]>(
    () => fetchDefects(filters),
    [filters.keyword, filters.status, filters.severity, filters.projectId],
    { cacheKey: 'defects:list' },
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Defect | null>(null);
  const defects = data ?? [];
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });

  useEffect(() => {
    if (!focusId || defects.length === 0 || editing?.id === focusId) return;
    const matched = defects.find((item) => item.id === focusId);
    // Open detail/edit when focused from mywork/dynamic; edit form still gated by canManageTesting.
    if (matched && canManageTesting) setEditing(matched);
  }, [canManageTesting, focusId, defects, editing]);

  function handleCloseEditing() {
    onClearFocus();
    setEditing(null);
  }

  function handleDoneEditing() {
    onClearFocus();
    setEditing(null);
    reload();
  }

  function setFilter(key: keyof DefectFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function handleDelete(item: Defect) {
    if (!canManageTesting) {
      toast.error('当前账号无权删除缺陷。');
      return;
    }
    const confirmed = await confirm({
      title: `删除缺陷“${item.title}”？`,
      description: '删除后缺陷记录及其关联任务入口将不可恢复。',
      confirmText: '删除缺陷',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDefect(item.id);
      toast.success(`已删除缺陷：${item.title}`);
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除缺陷失败');
    }
  }

  const columns: DataTableColumn<Defect>[] = [
    { key: 'title', title: '缺陷标题', render: (item) => <span className="font-medium">{item.title}</span> },
    { key: 'severity', title: '严重级别', render: (item) => <StatusBadge status={item.severity} label={labelOf(DEFECT_SEVERITY_LABELS, item.severity)} showDot={false} /> },
    {
      key: 'status',
      title: '状态',
      render: (item) => (
        canManageTesting ? (
          <select className="form-select" value={item.status} onClick={(e) => e.stopPropagation()} onChange={async (e) => {
            await updateDefectStatus(item.id, e.target.value);
            toast.success('缺陷状态已更新');
            reload();
          }}>
            {DEFECT_STATUSES.map((status) => <option key={status} value={status}>{labelOf(DEFECT_STATUS_LABELS, status)}</option>)}
          </select>
        ) : <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} />
      ),
    },
    { key: 'assignee', title: '当前处理人', render: (item) => item.assignee ? `${item.assignee}${item.assigneeRole ? ` · ${labelOf(USER_ROLE_LABELS, item.assigneeRole)}` : ''}` : '未分配' },
    {
      key: 'actions',
      title: '操作',
      render: (item) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canManageTesting ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setEditing(item)}>编辑</button>
              <button className="btn btn-text btn-xs" style={{ color: 'var(--color-red, #dc2626)' }} onClick={() => void handleDelete(item)}>删除</button>
            </>
          ) : <span className="text-secondary">只读</span>}
        </div>
      ),
    },
  ];

  return (
    <Panel title="缺陷列表" subtitle={`共 ${defects.length} 条缺陷`} toolbar={canManageTesting ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建缺陷</button> : undefined}>
      <FilterBar trailing={<button className="btn btn-secondary btn-sm" onClick={reload}>刷新</button>}>
        <input className="form-input filter-search" placeholder="搜索缺陷标题" value={filters.keyword ?? ''} onChange={(e) => setFilter('keyword', e.target.value)} />
        <select className="form-select" value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">全部状态</option>
          {DEFECT_STATUSES.map((item) => <option key={item} value={item}>{labelOf(DEFECT_STATUS_LABELS, item)}</option>)}
        </select>
        <select className="form-select" value={filters.severity ?? ''} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="">全部严重级别</option>
          {DEFECT_SEVERITIES.map((item) => <option key={item} value={item}>{labelOf(DEFECT_SEVERITY_LABELS, item)}</option>)}
        </select>
        <select className="form-select" value={filters.projectId ?? ''} onChange={(e) => setFilter('projectId', e.target.value)}>
          <option value="">全部项目</option>
          {(projects ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </FilterBar>
      <div className="filter-bar-divider" />
      {loading || error ? (
        <PageState loading={loading} error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          data={defects}
          rowKey="id"
          emptyText="暂无缺陷。"
          onRowClick={canManageTesting ? (item) => setEditing(item) : undefined}
        />
      )}
      {creating && canManageTesting ? <DefectForm mode="create" onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} /> : null}
      {editing && canManageTesting ? <DefectForm mode="edit" item={editing} onClose={handleCloseEditing} onDone={handleDoneEditing} canUseAi={canUseAi} /> : null}
    </Panel>
  );
}
