import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useAgentPageContextPublisher } from '../../ai/agentPageContext';
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
  const { t } = useTranslation();
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
  // Tell the global agent sidebar which project this view is scoped to.
  useAgentPageContextPublisher({
    page: 'testing',
    projectId: filters.projectId,
    projectName: filters.projectId ? projectMap.get(filters.projectId) : undefined,
  });

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
      toast.error(t('features.testing.defectsTab.noPermissionDelete'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.testing.defectsTab.deleteConfirm', { title: item.title }),
      description: t('features.testing.defectsTab.deleteConfirmDesc'),
      confirmText: t('features.testing.defectsTab.deleteDefect'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDefect(item.id);
      toast.success(t('features.testing.defectsTab.deleted', { title: item.title }));
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('features.testing.defectsTab.deleteFailed'));
    }
  }

  async function handleStatusChange(item: Defect, nextStatus: string) {
    try {
      await updateDefectStatus(item.id, nextStatus, item.version);
      toast.success(t('features.testing.defectsTab.statusUpdated'));
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('features.testing.defectsTab.statusUpdateFailed'));
    }
  }

  const focusButtons: { key: DefectFocus; label: string; count: number }[] = [
    { key: 'all', label: t('features.testing.defectsTab.focus.all'), count: signals.total },
    { key: 'open', label: t('features.testing.defectsTab.focus.open'), count: signals.open },
    { key: 'severe', label: t('features.testing.defectsTab.focus.severe'), count: signals.severe },
    { key: 'unassigned', label: t('features.testing.defectsTab.focus.unassigned'), count: signals.unassigned },
    { key: 'closed', label: t('features.testing.defectsTab.focus.closed'), count: signals.closed },
  ];

  const columns: DataTableColumn<Defect>[] = [
    {
      key: 'title',
      title: t('features.testing.defectsTab.defectTitle'),
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
      title: t('features.testing.defectsTab.severityTitle'),
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
      title: t('features.testing.defectsTab.statusTitle'),
      width: 128,
      render: (item) => (
        canManageTesting ? (
          <select
            className="form-select form-select-xs qa-inline-select"
            value={item.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void handleStatusChange(item, e.target.value)}
            aria-label={t('features.testing.defectsTab.updateStatusAria', { title: item.title })}
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
      title: t('features.testing.defectsTab.assigneeTitle'),
      width: 140,
      render: (item) => (
        <div className="qa-assignee-cell">
          <span className={item.assignee ? '' : 'is-muted'}>{item.assignee || t('features.testing.defectsTab.unassigned')}</span>
          {item.assigneeRole ? <em>{labelOf(USER_ROLE_LABELS, item.assigneeRole)}</em> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      title: t('common.actions'),
      width: 110,
      render: (item) => (
        <div className="qa-row-actions" onClick={(e) => e.stopPropagation()}>
          {canManageTesting ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setEditing(item)}>{t('common.edit')}</button>
              <button className="btn btn-text btn-xs qa-danger-btn" onClick={() => void handleDelete(item)}>{t('common.delete')}</button>
            </>
          ) : <span className="text-secondary">{t('features.testing.defectsTab.readOnly')}</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="qa-section">
      <section className="qa-signal-strip" aria-label={t('features.testing.defectsTab.signalAria')}>
        <div className="qa-signal">
          <span className="qa-signal-label"><Bug size={13} aria-hidden="true" /> {t('features.testing.defectsTab.totalLabel')}</span>
          <strong>{signals.total}</strong>
          <em>{t('features.testing.defectsTab.inFixHint', { count: signals.inFix })}</em>
        </div>
        <div className={`qa-signal ${signals.open > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><CircleDashed size={13} aria-hidden="true" /> {t('features.testing.defectsTab.openLabel')}</span>
          <strong>{signals.open}</strong>
          <em>{t('features.testing.defectsTab.openHint')}</em>
        </div>
        <div className={`qa-signal ${signals.severe > 0 ? 'is-risk' : ''}`}>
          <span className="qa-signal-label"><AlertTriangle size={13} aria-hidden="true" /> {t('features.testing.defectsTab.severeLabel')}</span>
          <strong>{signals.severe}</strong>
          <em>{t('features.testing.defectsTab.severeHint')}</em>
        </div>
        <div className={`qa-signal ${signals.unassigned > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><UserRound size={13} aria-hidden="true" /> {t('features.testing.defectsTab.unassignedLabel')}</span>
          <strong>{signals.unassigned}</strong>
          <em>{t('features.testing.defectsTab.unassignedHint')}</em>
        </div>
        <div className="qa-signal">
          <span className="qa-signal-label"><CheckCircle2 size={13} aria-hidden="true" /> {t('features.testing.defectsTab.closedLabel')}</span>
          <strong>{signals.closed}</strong>
          <em>{t('features.testing.defectsTab.closedHint')}</em>
        </div>
      </section>

      <Panel
        className="qa-pool-panel"
        title={t('features.testing.defectsTab.panelTitle')}
        subtitle={t('features.testing.defectsTab.showingCount', { shown: visible.length, total: defects.length })}
        toolbar={(
          <div className="qa-pool-toolbar">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={reload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" /> {t('features.testing.defectsTab.refresh')}
            </button>
            {canManageTesting ? (
              <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
                <Plus size={14} aria-hidden="true" /> {t('features.testing.defectsTab.newDefect')}
              </button>
            ) : null}
          </div>
        )}
      >
        <div className="qa-focus-row" role="group" aria-label={t('features.testing.defectsTab.focusAria')}>
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
                placeholder={t('features.testing.defectsTab.searchPlaceholder')}
                value={filters.keyword ?? ''}
                onChange={(e) => setFilter('keyword', e.target.value)}
                aria-label={t('features.testing.defectsTab.searchAria')}
              />
            </div>
            <select
              className="form-select"
              value={filters.status ?? ''}
              onChange={(e) => setFilter('status', e.target.value)}
              aria-label={t('features.testing.defectsTab.statusFilterAria')}
            >
              <option value="">{t('features.testing.defectsTab.allStatus')}</option>
              {DEFECT_STATUSES.map((item) => (
                <option key={item} value={item}>{labelOf(DEFECT_STATUS_LABELS, item)}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.severity ?? ''}
              onChange={(e) => setFilter('severity', e.target.value)}
              aria-label={t('features.testing.defectsTab.severityFilterAria')}
            >
              <option value="">{t('features.testing.defectsTab.allSeverities')}</option>
              {DEFECT_SEVERITIES.map((item) => (
                <option key={item} value={item}>{labelOf(DEFECT_SEVERITY_LABELS, item)}</option>
              ))}
            </select>
            <select
              className="form-select filter-project"
              value={filters.projectId ?? ''}
              onChange={(e) => setFilter('projectId', e.target.value)}
              aria-label={t('features.testing.defectsTab.projectFilterAria')}
            >
              <option value="">{t('features.testing.defectsTab.allProjects')}</option>
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
            emptyText={t('features.testing.defectsTab.empty')}
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
