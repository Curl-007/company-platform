import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
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
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import FilterBar from '../../../components/common/FilterBar';
import TreeTable, { type TreeTableColumn } from '../../../components/common/TreeTable';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { summarizeDependencies } from '../../../utils/dependencySummary';
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

type FocusFilter = 'all' | 'open' | 'high' | 'unassigned' | 'done';

const DONE_STATUSES = new Set(['accepted', 'closed', 'cancelled']);
const OPEN_STATUSES = new Set(['draft', 'reviewing', 'approved', 'in_dev', 'testing']);

export function RequirementCompletionCell({ completion }: { completion?: number | null }) {
  const percent = completion ?? 0;

  return (
    <div
      className="requirement-completion-cell req-completion"
      style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
    >
      <div className="requirement-completion-bar req-completion-bar" style={{ flex: '1 1 auto', minWidth: 0 }}>
        <ProgressBar percent={percent} height={6} showPercent={false} />
      </div>
      <span className="text-mono req-completion-num" style={{ minWidth: 42 }}>{percent}%</span>
    </div>
  );
}

function matchesFocus(item: Requirement, focus: FocusFilter) {
  if (focus === 'all') return true;
  if (focus === 'open') return OPEN_STATUSES.has(item.status);
  if (focus === 'high') return item.priority === 'high' && !DONE_STATUSES.has(item.status);
  if (focus === 'unassigned') return !item.assignee && !DONE_STATUSES.has(item.status);
  if (focus === 'done') return DONE_STATUSES.has(item.status);
  return true;
}

export default function RequirementsView() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageRequirements = canOperate(sessionUser, 'requirements:manage');
  const [filters, setFilters] = useState<RequirementFilters>({});
  const [focus, setFocus] = useState<FocusFilter>('all');
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
  const projectMap = useMemo(
    () => new Map(projects.map((item) => [item.id, item.name])),
    [projects],
  );
  const requirements = data ?? [];

  const signals = useMemo(() => {
    const total = requirements.length;
    const open = requirements.filter((item) => OPEN_STATUSES.has(item.status)).length;
    const high = requirements.filter((item) => item.priority === 'high' && !DONE_STATUSES.has(item.status)).length;
    const unassigned = requirements.filter((item) => !item.assignee && !DONE_STATUSES.has(item.status)).length;
    const done = requirements.filter((item) => DONE_STATUSES.has(item.status)).length;
    const avgCompletion = total
      ? Math.round(requirements.reduce((sum, item) => sum + (item.completion ?? 0), 0) / total)
      : 0;
    return { total, open, high, unassigned, done, avgCompletion };
  }, [requirements]);

  const visibleRequirements = useMemo(
    () => requirements.filter((item) => matchesFocus(item, focus)),
    [requirements, focus],
  );

  const keptRequirements = useMemo(() => {
    const visibleIds = new Set(visibleRequirements.map((item) => item.id));
    // Keep ancestors so tree rows remain expandable under focus chips.
    const parentOf = new Map(requirements.map((item) => [item.id, item.parentId ?? null]));
    const keep = new Set(visibleIds);
    for (const id of visibleIds) {
      let current = parentOf.get(id) ?? null;
      while (current) {
        keep.add(current);
        current = parentOf.get(current) ?? null;
      }
    }
    return requirements.filter((item) => keep.has(item.id));
  }, [requirements, visibleRequirements]);

  const rootCount = useMemo(
    () => keptRequirements.filter((item) => !item.parentId).length,
    [keptRequirements],
  );

  const childrenMap = useMemo(() => {
    const map: Record<string, Requirement[]> = {};
    keptRequirements.forEach((item) => {
      if (!item.parentId) return;
      if (!map[item.parentId]) map[item.parentId] = [];
      map[item.parentId].push(item);
    });
    return map;
  }, [keptRequirements]);

  const depthMap = useMemo(() => {
    const map = new Map<string, number>();
    const byId = new Map(requirements.map((item) => [item.id, item]));
    for (const item of requirements) {
      let depth = 0;
      let current = item.parentId;
      while (current) {
        depth += 1;
        current = byId.get(current)?.parentId ?? null;
        if (depth > 20) break;
      }
      map.set(item.id, depth);
    }
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

  function setFilter(key: keyof RequirementFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function handleDelete(requirement: Requirement) {
    if (!canManageRequirements) {
      toast.error(t('features.requirements.requirementsView.noPermissionDelete'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.requirements.requirementsView.deleteConfirm', { title: requirement.title }),
      description: t('features.requirements.requirementsView.deleteConfirmDesc'),
      confirmText: t('features.requirements.requirementsView.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteRequirement(requirement.id);
      toast.success(t('features.requirements.requirementsView.deleted', { title: requirement.title }));
      reload();
    } catch (err) {
      // 409 = has dependencies (tasks/defects/test cases/children); offer cascade.
      if (err instanceof ApiError && err.status === 409) {
        const summary = summarizeDependencies((err.body as { details?: { dependencies?: Record<string, unknown> } })?.details?.dependencies);
        const cascade = await confirm({
          title: summary ? t('features.requirements.requirementsView.dependenciesTitle') : t('features.requirements.requirementsView.dependenciesTitleAlt'),
          description: summary
            ? t('features.requirements.requirementsView.dependenciesConfirm', { title: requirement.title, summary })
            : t('features.requirements.requirementsView.dependenciesConfirmAlt', { title: requirement.title }),
          confirmText: t('features.requirements.requirementsView.cascadeDelete'),
          tone: 'danger',
        });
        if (!cascade) return;
        try {
          await deleteRequirement(requirement.id, true);
          toast.success(t('features.requirements.requirementsView.deletedWithDependencies', { title: requirement.title }));
          reload();
        } catch (cascadeErr) {
          toast.error(cascadeErr instanceof ApiError ? cascadeErr.message : t('features.requirements.requirementsView.cascadeDeleteFailed'));
        }
        return;
      }
      toast.error(err instanceof ApiError ? err.message : t('features.requirements.requirementsView.deleteFailed'));
    }
  }

  const focusButtons: { key: FocusFilter; label: string; count: number }[] = [
    { key: 'all', label: t('features.requirements.requirementsView.focusAll'), count: signals.total },
    { key: 'open', label: t('features.requirements.requirementsView.focusOpen'), count: signals.open },
    { key: 'high', label: t('features.requirements.requirementsView.focusHigh'), count: signals.high },
    { key: 'unassigned', label: t('features.requirements.requirementsView.focusUnassigned'), count: signals.unassigned },
    { key: 'done', label: t('features.requirements.requirementsView.focusDone'), count: signals.done },
  ];

  const columns: TreeTableColumn<Requirement>[] = [
    {
      key: 'title',
      title: t('features.requirements.requirementsView.colTitle'),
      render: (item) => {
        const childCount = (childrenMap[item.id] ?? []).length;
        return (
          <div className="req-title-cell">
            <div className="req-title-main">
              <span className="req-id text-mono">{item.id}</span>
              <strong className="req-title-text" title={item.title}>{item.title}</strong>
              {childCount > 0 ? <span className="req-child-chip">{t('features.requirements.requirementsView.childCount', { count: childCount })}</span> : null}
            </div>
            {item.owner ? (
              <span className="req-title-meta">{t('features.requirements.requirementsView.ownerPrefix', { owner: item.owner })}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'project',
      title: t('features.requirements.requirementsView.colProject'),
      width: 140,
      render: (item) => (
        <span className="req-project-cell truncate" title={projectMap.get(item.projectId) ?? item.projectId}>
          {projectMap.get(item.projectId) ?? item.projectId}
        </span>
      ),
    },
    {
      key: 'priority',
      title: t('features.requirements.requirementsView.colPriority'),
      width: 88,
      align: 'center',
      render: (item) => (
        <StatusBadge
          status={item.priority}
          label={labelOf(PRIORITY_LABELS, item.priority)}
          showDot={false}
        />
      ),
    },
    {
      key: 'status',
      title: t('features.requirements.requirementsView.colStatus'),
      width: 100,
      render: (item) => (
        <StatusBadge
          status={item.status}
          label={labelOf(REQUIREMENT_STATUS_LABELS, item.status)}
        />
      ),
    },
    {
      key: 'assignment',
      title: t('features.requirements.requirementsView.colAssignment'),
      width: 150,
      render: (item) => (
        <div className="req-assignee-cell">
          <span className={item.assignee ? '' : 'is-muted'}>
            {item.assignee || t('features.requirements.requirementsView.unassigned')}
          </span>
          {item.assigneeRole ? (
            <em>{labelOf(USER_ROLE_LABELS, item.assigneeRole)}</em>
          ) : null}
        </div>
      ),
    },
    {
      key: 'completion',
      title: t('features.requirements.requirementsView.colCompletion'),
      width: 160,
      render: (item) => <RequirementCompletionCell completion={item.completion} />,
    },
    {
      key: 'actions',
      title: t('common.actions'),
      width: 72,
      align: 'right',
      render: (item) => (
        canManageRequirements ? (
          <button
            className="btn btn-text btn-xs req-delete-btn"
            onClick={(event) => {
              event.stopPropagation();
              void handleDelete(item);
            }}
          >
            {t('common.delete')}
          </button>
        ) : <span className="text-secondary">{t('features.requirements.requirementsView.readonly')}</span>
      ),
    },
  ];

  return (
    <div className="req-workbench">
      <section className="req-signal-strip" aria-label={t('features.requirements.requirementsView.ariaLabelPool')}>
        <div className="req-signal">
          <span className="req-signal-label"><ListTree size={13} aria-hidden="true" /> {t('features.requirements.requirementsView.signalTotal')}</span>
          <strong>{signals.total}</strong>
          <em>{t('features.requirements.requirementsView.signalRootCount', { count: rootCount })}</em>
        </div>
        <div className="req-signal">
          <span className="req-signal-label"><CircleDashed size={13} aria-hidden="true" /> {t('features.requirements.requirementsView.signalOpen')}</span>
          <strong>{signals.open}</strong>
          <em>{t('features.requirements.requirementsView.signalAvgCompletion', { percent: signals.avgCompletion })}</em>
        </div>
        <div className={`req-signal ${signals.high > 0 ? 'is-risk' : ''}`}>
          <span className="req-signal-label"><AlertTriangle size={13} aria-hidden="true" /> {t('features.requirements.requirementsView.signalHigh')}</span>
          <strong>{signals.high}</strong>
          <em>{t('features.requirements.requirementsView.signalHighCaption')}</em>
        </div>
        <div className={`req-signal ${signals.unassigned > 0 ? 'is-warn' : ''}`}>
          <span className="req-signal-label"><UserRound size={13} aria-hidden="true" /> {t('features.requirements.requirementsView.signalUnassigned')}</span>
          <strong>{signals.unassigned}</strong>
          <em>{t('features.requirements.requirementsView.signalUnassignedCaption')}</em>
        </div>
        <div className="req-signal">
          <span className="req-signal-label"><CheckCircle2 size={13} aria-hidden="true" /> {t('features.requirements.requirementsView.signalDone')}</span>
          <strong>{signals.done}</strong>
          <em>{t('features.requirements.requirementsView.signalDoneCaption')}</em>
        </div>
      </section>

      <Panel
        className="req-pool-panel"
        title={t('features.requirements.requirementsView.poolTitle')}
        subtitle={t('features.requirements.requirementsView.poolSubtitle', { visible: visibleRequirements.length, total: requirements.length })}
        toolbar={(
          <div className="req-pool-toolbar">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={reload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" /> {t('features.requirements.requirementsView.refresh')}
            </button>
            {canManageRequirements ? (
              <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
                <Plus size={14} aria-hidden="true" /> {t('features.requirements.requirementsView.new')}
              </button>
            ) : null}
          </div>
        )}
      >
        <div className="req-focus-row" role="group" aria-label={t('features.requirements.requirementsView.ariaLabelFocus')}>
          {focusButtons.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`req-focus-chip ${focus === item.key ? 'is-active' : ''}`}
              aria-pressed={focus === item.key}
              onClick={() => setFocus(item.key)}
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>

        <div className="req-filter-wrap">
          <FilterBar>
            <div className="input-with-icon filter-search req-search">
              <Search size={14} className="shrink-0 text-secondary" aria-hidden="true" />
              <input
                className="form-input border-0 bg-transparent shadow-none"
                placeholder={t('features.requirements.requirementsView.searchPlaceholder')}
                value={filters.keyword ?? ''}
                onChange={(e) => setFilter('keyword', e.target.value)}
                aria-label={t('features.requirements.requirementsView.searchAriaLabel')}
              />
            </div>
            <select
              className="form-select"
              value={filters.status ?? ''}
              onChange={(e) => setFilter('status', e.target.value)}
              aria-label={t('features.requirements.requirementsView.statusAriaLabel')}
            >
              <option value="">{t('features.requirements.requirementsView.allStatuses')}</option>
              {REQUIREMENT_STATUSES.map((item) => (
                <option key={item} value={item}>{labelOf(REQUIREMENT_STATUS_LABELS, item)}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.priority ?? ''}
              onChange={(e) => setFilter('priority', e.target.value)}
              aria-label={t('features.requirements.requirementsView.priorityAriaLabel')}
            >
              <option value="">{t('features.requirements.requirementsView.allPriorities')}</option>
              {REQUIREMENT_PRIORITIES.map((item) => (
                <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
              ))}
            </select>
            <select
              className="form-select filter-project"
              value={filters.projectId ?? ''}
              onChange={(e) => setFilter('projectId', e.target.value)}
              aria-label={t('features.requirements.requirementsView.projectAriaLabel')}
            >
              <option value="">{t('features.requirements.requirementsView.allProjects')}</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </FilterBar>
        </div>

        <div className="filter-bar-divider" />

        {loading || error ? (
          <PageState loading={loading} error={error} onRetry={reload} />
        ) : (
          <TreeTable
            className="req-tree-table"
            columns={columns}
            data={keptRequirements}
            getChildren={(item) => childrenMap[item.id] ?? []}
            getDepth={(item) => depthMap.get(item.id) ?? 0}
            rowKey="id"
            onRowClick={setSelected}
            emptyText={t('features.requirements.requirementsView.emptyText')}
            indentSize={18}
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
