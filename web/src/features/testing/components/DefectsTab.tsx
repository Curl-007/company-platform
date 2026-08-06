import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CircleDashed,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
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

type DefectFocus = 'all' | 'open' | 'severe' | 'unassigned' | 'closed';

const CLOSED_STATUSES = new Set(['closed', 'rejected']);
const SEVERE = new Set(['critical', 'high', 'blocker']);

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
  const [focus, setFocus] = useState<DefectFocus>('all');
  const { data, loading, error, reload } = useAsync<Defect[]>(
    () => fetchDefects(filters),
    [filters.keyword, filters.status, filters.severity, filters.projectId],
    { cacheKey: 'defects:list' },
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Defect | null>(null);
  const defects = data ?? [];
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const projectMap = useMemo(
    () => new Map((projects ?? []).map((item) => [item.id, item.name])),
    [projects],
  );

  const signals = useMemo(() => {
    const total = defects.length;
    const open = defects.filter((item) => !CLOSED_STATUSES.has(item.status)).length;
    const severe = defects.filter((item) => SEVERE.has(item.severity) && !CLOSED_STATUSES.has(item.status)).length;
    const unassigned = defects.filter((item) => !item.assignee && !CLOSED_STATUSES.has(item.status)).length;
    const closed = defects.filter((item) => CLOSED_STATUSES.has(item.status)).length;
    const inFix = defects.filter((item) => item.status === 'in_fix').length;
    return { total, open, severe, unassigned, closed, inFix };
  }, [defects]);

  const visible = useMemo(() => {
    return defects.filter((item) => {
      if (focus === 'open') return !CLOSED_STATUSES.has(item.status);
      if (focus === 'severe') return SEVERE.has(item.severity) && !CLOSED_STATUSES.has(item.status);
      if (focus === 'unassigned') return !item.assignee && !CLOSED_STATUSES.has(item.status);
      if (focus === 'closed') return CLOSED_STATUSES.has(item.status);
      return true;
    });
  }, [defects, focus]);

  useEffect(() => {
    if (!focusId || defects.length === 0 || editing?.id === focusId) return;
    const matched = defects.find((item) => item.id === focusId);
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
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除缺陷失败');
    }
  }

  async function handleStatusChange(item: Defect, nextStatus: string) {
    try {
      await updateDefectStatus(item.id, nextStatus, item.version);
      toast.success('缺陷状态已更新');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '更新缺陷状态失败');
    }
  }

  const focusButtons: { key: DefectFocus; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: signals.total },
    { key: 'open', label: '未关闭', count: signals.open },
    { key: 'severe', label: '高严重', count: signals.severe },
    { key: 'unassigned', label: '待指派', count: signals.unassigned },
    { key: 'closed', label: '已关闭', count: signals.closed },
  ];

  const columns: DataTableColumn<Defect>[] = [
    {
      key: 'title',
      title: '缺陷',
      render: (item) => (
        <div className="qa-title-cell">
          <div className="qa-title-main">
            <span className="qa-id text-mono">{item.id}</span>
            <strong className="qa-title-text" title={item.title}>{item.title}</strong>
          </div>
          <span className="qa-title-meta">
            {projectMap.get(item.projectId) ?? item.projectId}
            {item.requirementId ? ` · ${item.requirementId}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'severity',
      title: '严重级别',
      width: 96,
      render: (item) => (
        <StatusBadge
          status={item.severity}
          label={labelOf(DEFECT_SEVERITY_LABELS, item.severity)}
          showDot={false}
        />
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 128,
      render: (item) => (
        canManageTesting ? (
          <select
            className="form-select form-select-xs qa-inline-select"
            value={item.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void handleStatusChange(item, e.target.value)}
            aria-label={`更新 ${item.title} 状态`}
          >
            {DEFECT_STATUSES.map((status) => (
              <option key={status} value={status}>{labelOf(DEFECT_STATUS_LABELS, status)}</option>
            ))}
          </select>
        ) : (
          <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} />
        )
      ),
    },
    {
      key: 'assignee',
      title: '处理人',
      width: 140,
      render: (item) => (
        <div className="qa-assignee-cell">
          <span className={item.assignee ? '' : 'is-muted'}>{item.assignee || '未分配'}</span>
          {item.assigneeRole ? <em>{labelOf(USER_ROLE_LABELS, item.assigneeRole)}</em> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 110,
      render: (item) => (
        <div className="qa-row-actions" onClick={(e) => e.stopPropagation()}>
          {canManageTesting ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setEditing(item)}>编辑</button>
              <button className="btn btn-text btn-xs qa-danger-btn" onClick={() => void handleDelete(item)}>删除</button>
            </>
          ) : <span className="text-secondary">只读</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="qa-section">
      <section className="qa-signal-strip" aria-label="缺陷概况">
        <div className="qa-signal">
          <span className="qa-signal-label"><Bug size={13} aria-hidden="true" /> 缺陷总数</span>
          <strong>{signals.total}</strong>
          <em>修复中 {signals.inFix}</em>
        </div>
        <div className={`qa-signal ${signals.open > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><CircleDashed size={13} aria-hidden="true" /> 未关闭</span>
          <strong>{signals.open}</strong>
          <em>需持续跟踪</em>
        </div>
        <div className={`qa-signal ${signals.severe > 0 ? 'is-risk' : ''}`}>
          <span className="qa-signal-label"><AlertTriangle size={13} aria-hidden="true" /> 高严重未关</span>
          <strong>{signals.severe}</strong>
          <em>优先收敛</em>
        </div>
        <div className={`qa-signal ${signals.unassigned > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><UserRound size={13} aria-hidden="true" /> 待指派</span>
          <strong>{signals.unassigned}</strong>
          <em>缺少处理人</em>
        </div>
        <div className="qa-signal">
          <span className="qa-signal-label"><CheckCircle2 size={13} aria-hidden="true" /> 已关闭</span>
          <strong>{signals.closed}</strong>
          <em>关闭 / 驳回</em>
        </div>
      </section>

      <Panel
        className="qa-pool-panel"
        title="缺陷列表"
        subtitle={`显示 ${visible.length} / ${defects.length} 条`}
        toolbar={(
          <div className="qa-pool-toolbar">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={reload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" /> 刷新
            </button>
            {canManageTesting ? (
              <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
                <Plus size={14} aria-hidden="true" /> 新建缺陷
              </button>
            ) : null}
          </div>
        )}
      >
        <div className="qa-focus-row" role="group" aria-label="缺陷快速聚焦">
          {focusButtons.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`qa-focus-chip ${focus === item.key ? 'is-active' : ''}`}
              aria-pressed={focus === item.key}
              onClick={() => setFocus(item.key)}
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>

        <div className="qa-filter-wrap">
          <FilterBar>
            <div className="input-with-icon filter-search qa-search">
              <Search size={14} className="shrink-0 text-secondary" aria-hidden="true" />
              <input
                className="form-input border-0 bg-transparent shadow-none"
                placeholder="搜索缺陷标题 / 编号"
                value={filters.keyword ?? ''}
                onChange={(e) => setFilter('keyword', e.target.value)}
                aria-label="搜索缺陷"
              />
            </div>
            <select
              className="form-select"
              value={filters.status ?? ''}
              onChange={(e) => setFilter('status', e.target.value)}
              aria-label="缺陷状态"
            >
              <option value="">全部状态</option>
              {DEFECT_STATUSES.map((item) => (
                <option key={item} value={item}>{labelOf(DEFECT_STATUS_LABELS, item)}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.severity ?? ''}
              onChange={(e) => setFilter('severity', e.target.value)}
              aria-label="严重级别"
            >
              <option value="">全部严重级别</option>
              {DEFECT_SEVERITIES.map((item) => (
                <option key={item} value={item}>{labelOf(DEFECT_SEVERITY_LABELS, item)}</option>
              ))}
            </select>
            <select
              className="form-select filter-project"
              value={filters.projectId ?? ''}
              onChange={(e) => setFilter('projectId', e.target.value)}
              aria-label="所属项目"
            >
              <option value="">全部项目</option>
              {(projects ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </FilterBar>
        </div>

        <div className="filter-bar-divider" />

        {loading || error ? (
          <PageState loading={loading} error={error} onRetry={reload} />
        ) : (
          <DataTable
            className="qa-table"
            columns={columns}
            data={visible}
            rowKey="id"
            emptyText="暂无匹配的缺陷。"
            onRowClick={canManageTesting ? (item) => setEditing(item) : undefined}
            pageSize={10}
          />
        )}
      </Panel>

      {creating && canManageTesting ? (
        <DefectForm
          mode="create"
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
      {editing && canManageTesting ? (
        <DefectForm
          mode="edit"
          item={editing}
          onClose={handleCloseEditing}
          onDone={handleDoneEditing}
          canUseAi={canUseAi}
        />
      ) : null}
    </div>
  );
}
