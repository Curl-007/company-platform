import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import {
  deleteTestCase,
  fetchTestCases,
  updateTestCaseStatus,
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
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { summarizeDependencies } from '../../../utils/dependencySummary';
import type { Project, TestCase } from '../../../types';
import {
  TEST_CASE_STATUSES,
  TEST_CASE_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import { passRate } from './testingHelpers';
import TestCaseForm from './TestCaseForm';
import TestExecutionForm from './TestExecutionForm';

type CaseFocus = 'all' | 'risky' | 'failed' | 'blocked' | 'passed';

export default function TestCasesTab({
  focusId,
  onClearFocus,
}: {
  focusId?: string | null;
  onClearFocus: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageTesting = canOperate(sessionUser, 'testing:manage');
  const canUseAi = canOperate(sessionUser, 'ai:analyze');
  const { data, loading, error, reload } = useAsync<TestCase[]>(fetchTestCases, [], { cacheKey: 'test-cases:list' });
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [executing, setExecuting] = useState<TestCase | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [focus, setFocus] = useState<CaseFocus>('all');
  const tests = data ?? [];
  const projectMap = useMemo(
    () => new Map((projects ?? []).map((item) => [item.id, item.name])),
    [projects],
  );

  const signals = useMemo(() => {
    const total = tests.length;
    const totalRuns = tests.reduce((sum, item) => sum + item.totalCases, 0);
    const passedRuns = tests.reduce((sum, item) => sum + item.passedCases, 0);
    const failedRuns = tests.reduce((sum, item) => sum + item.failedCases, 0);
    const blockedRuns = tests.reduce((sum, item) => sum + item.blockedCases, 0);
    const overallPass = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
    const risky = tests.filter((item) => item.failedCases > 0 || item.blockedCases > 0 || passRate(item) < 80).length;
    const failed = tests.filter((item) => item.status === 'failed' || item.failedCases > 0).length;
    const blocked = tests.filter((item) => item.status === 'blocked' || item.blockedCases > 0).length;
    const passed = tests.filter((item) => item.status === 'passed' || (item.totalCases > 0 && passRate(item) === 100)).length;
    return { total, overallPass, failedRuns, blockedRuns, risky, failed, blocked, passed };
  }, [tests]);

  const visible = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return tests.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (projectFilter && item.projectId !== projectFilter) return false;
      if (q) {
        const hay = `${item.id} ${item.name} ${item.owner ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (focus === 'risky') return item.failedCases > 0 || item.blockedCases > 0 || passRate(item) < 80;
      if (focus === 'failed') return item.status === 'failed' || item.failedCases > 0;
      if (focus === 'blocked') return item.status === 'blocked' || item.blockedCases > 0;
      if (focus === 'passed') return item.status === 'passed' || (item.totalCases > 0 && passRate(item) === 100);
      return true;
    });
  }, [tests, keyword, statusFilter, projectFilter, focus]);

  useEffect(() => {
    if (!canManageTesting || !focusId || tests.length === 0 || editing?.id === focusId || executing?.id === focusId) return;
    const matched = tests.find((item) => item.id === focusId);
    if (matched) setEditing(matched);
  }, [canManageTesting, focusId, tests, editing, executing]);

  function handleCloseEditing() {
    onClearFocus();
    setEditing(null);
  }

  function handleDoneEditing() {
    onClearFocus();
    setEditing(null);
    reload();
  }

  function handleCloseExecuting() {
    onClearFocus();
    setExecuting(null);
  }

  function handleDoneExecuting() {
    onClearFocus();
    setExecuting(null);
    reload();
  }

  async function handleDelete(item: TestCase) {
    if (!canManageTesting) {
      toast.error(t('features.testing.testCasesTab.noPermissionDelete'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.testing.testCasesTab.deleteConfirm', { name: item.name }),
      description: t('features.testing.testCasesTab.deleteConfirmDesc'),
      confirmText: t('features.testing.testCasesTab.deleteCase'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteTestCase(item.id);
      toast.success(t('features.testing.testCasesTab.deleted', { name: item.name }));
      reload();
    } catch (err) {
      // 409 = has dependencies; offer cascade delete on explicit confirmation.
      if (err instanceof ApiError && err.status === 409) {
        const summary = summarizeDependencies((err.body as { details?: { dependencies?: Record<string, unknown> } })?.details?.dependencies);
        const cascade = await confirm({
          title: summary ? t('features.testing.testCasesTab.hasRelatedRecords') : t('features.testing.testCasesTab.hasRelatedRecordsFallback'),
          description: summary
            ? t('features.testing.testCasesTab.cascadeConfirmWithSummary', { name: item.name, summary })
            : t('features.testing.testCasesTab.cascadeConfirm', { name: item.name }),
          confirmText: t('features.testing.testCasesTab.cascadeDelete'),
          tone: 'danger',
        });
        if (!cascade) return;
        try {
          await deleteTestCase(item.id, true);
          toast.success(t('features.testing.testCasesTab.deletedCascade', { name: item.name }));
          reload();
        } catch (cascadeErr) {
          toast.error(cascadeErr instanceof ApiError ? cascadeErr.message : t('features.testing.testCasesTab.cascadeDeleteFailed'));
        }
        return;
      }
      toast.error(err instanceof ApiError ? err.message : t('features.testing.testCasesTab.deleteFailed'));
    }
  }

  async function handleStatusChange(item: TestCase, nextStatus: string) {
    try {
      await updateTestCaseStatus(item.id, nextStatus);
      toast.success(t('features.testing.testCasesTab.statusUpdated'));
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('features.testing.testCasesTab.statusUpdateFailed'));
    }
  }

  const focusButtons: { key: CaseFocus; label: string; count: number }[] = [
    { key: 'all', label: t('features.testing.testCasesTab.focus.all'), count: signals.total },
    { key: 'risky', label: t('features.testing.testCasesTab.focus.risky'), count: signals.risky },
    { key: 'failed', label: t('features.testing.testCasesTab.focus.failed'), count: signals.failed },
    { key: 'blocked', label: t('features.testing.testCasesTab.focus.blocked'), count: signals.blocked },
    { key: 'passed', label: t('features.testing.testCasesTab.focus.passed'), count: signals.passed },
  ];

  const columns: DataTableColumn<TestCase>[] = [
    {
      key: 'name',
      title: t('features.testing.testCasesTab.caseTitle'),
      render: (item) => (
        <div className="qa-title-cell">
          <div className="qa-title-main">
            <span className="qa-id text-mono">{item.id}</span>
            <strong className="qa-title-text" title={item.name}>{item.name}</strong>
          </div>
          <span className="qa-title-meta">
            {projectMap.get(item.projectId) ?? item.projectId}
            {item.owner ? ` · ${item.owner}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      title: t('features.testing.testCasesTab.roleTitle'),
      width: 96,
      render: (item) => (
        <span className="qa-meta-text">
          {item.assigneeRole ? labelOf(USER_ROLE_LABELS, item.assigneeRole) : t('features.testing.testCasesTab.defaultRole')}
        </span>
      ),
    },
    {
      key: 'status',
      title: t('features.testing.testCasesTab.statusTitle'),
      width: 128,
      render: (item) => (
        canManageTesting ? (
          <select
            className="form-select form-select-xs qa-inline-select"
            value={item.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void handleStatusChange(item, e.target.value)}
            aria-label={t('features.testing.testCasesTab.updateStatusAria', { name: item.name })}
          >
            {TEST_CASE_STATUSES.map((status) => (
              <option key={status} value={status}>{labelOf(TEST_CASE_STATUS_LABELS, status)}</option>
            ))}
          </select>
        ) : (
          <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
        )
      ),
    },
    {
      key: 'runs',
      title: t('features.testing.testCasesTab.runsTitle'),
      width: 120,
      render: (item) => (
        <div className="qa-run-cell">
          <span>{t('features.testing.testCasesTab.totalRuns', { count: item.totalCases })}</span>
          <em>
            {t('features.testing.testCasesTab.passedRuns', { count: item.passedCases })}
            {item.failedCases > 0 ? t('features.testing.testCasesTab.failedRunsSuffix', { count: item.failedCases }) : ''}
            {item.blockedCases > 0 ? t('features.testing.testCasesTab.blockedRunsSuffix', { count: item.blockedCases }) : ''}
          </em>
        </div>
      ),
    },
    {
      key: 'passed',
      title: t('features.testing.testCasesTab.passRateTitle'),
      width: 150,
      render: (item) => {
        const rate = passRate(item);
        return (
          <div className="qa-pass-cell">
            <ProgressBar percent={rate} height={6} showPercent={false} />
            <span className="text-mono">{rate}%</span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: t('common.actions'),
      width: 140,
      render: (item) => (
        <div className="qa-row-actions" onClick={(e) => e.stopPropagation()}>
          {canManageTesting ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setExecuting(item)}>{t('features.testing.testCasesTab.execute')}</button>
              <button className="btn btn-text btn-xs" onClick={() => setEditing(item)}>{t('common.edit')}</button>
              <button className="btn btn-text btn-xs qa-danger-btn" onClick={() => void handleDelete(item)}>{t('common.delete')}</button>
            </>
          ) : <span className="text-secondary">{t('features.testing.testCasesTab.readOnly')}</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="qa-section">
      <section className="qa-signal-strip" aria-label={t('features.testing.testCasesTab.signalAria')}>
        <div className="qa-signal">
          <span className="qa-signal-label"><CircleDashed size={13} aria-hidden="true" /> {t('features.testing.testCasesTab.totalCasesLabel')}</span>
          <strong>{signals.total}</strong>
          <em>{t('features.testing.testCasesTab.overallPass', { rate: signals.overallPass })}</em>
        </div>
        <div className={`qa-signal ${signals.risky > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><AlertTriangle size={13} aria-hidden="true" /> {t('features.testing.testCasesTab.riskyLabel')}</span>
          <strong>{signals.risky}</strong>
          <em>{t('features.testing.testCasesTab.riskyHint')}</em>
        </div>
        <div className={`qa-signal ${signals.failed > 0 ? 'is-risk' : ''}`}>
          <span className="qa-signal-label"><XCircle size={13} aria-hidden="true" /> {t('features.testing.testCasesTab.failedRelated')}</span>
          <strong>{signals.failed}</strong>
          <em>{t('features.testing.testCasesTab.failedRunsHint', { count: signals.failedRuns })}</em>
        </div>
        <div className={`qa-signal ${signals.blocked > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><CircleDashed size={13} aria-hidden="true" /> {t('features.testing.testCasesTab.blockedRelated')}</span>
          <strong>{signals.blocked}</strong>
          <em>{t('features.testing.testCasesTab.blockedRunsHint', { count: signals.blockedRuns })}</em>
        </div>
        <div className="qa-signal">
          <span className="qa-signal-label"><CheckCircle2 size={13} aria-hidden="true" /> {t('features.testing.testCasesTab.passedRelated')}</span>
          <strong>{signals.passed}</strong>
          <em>{t('features.testing.testCasesTab.passedHint')}</em>
        </div>
      </section>

      <Panel
        className="qa-pool-panel"
        title={t('features.testing.testCasesTab.panelTitle')}
        subtitle={t('features.testing.testCasesTab.showingCount', { shown: visible.length, total: tests.length })}
        toolbar={(
          <div className="qa-pool-toolbar">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={reload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" /> {t('features.testing.testCasesTab.refresh')}
            </button>
            {canManageTesting ? (
              <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
                <Plus size={14} aria-hidden="true" /> {t('features.testing.testCasesTab.newCase')}
              </button>
            ) : null}
          </div>
        )}
      >
        <div className="qa-focus-row" role="group" aria-label={t('features.testing.testCasesTab.focusAria')}>
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
                placeholder={t('features.testing.testCasesTab.searchPlaceholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                aria-label={t('features.testing.testCasesTab.searchAria')}
              />
            </div>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('features.testing.testCasesTab.statusFilterAria')}
            >
              <option value="">{t('features.testing.testCasesTab.allStatus')}</option>
              {TEST_CASE_STATUSES.map((status) => (
                <option key={status} value={status}>{labelOf(TEST_CASE_STATUS_LABELS, status)}</option>
              ))}
            </select>
            <select
              className="form-select filter-project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label={t('features.testing.testCasesTab.projectFilterAria')}
            >
              <option value="">{t('features.testing.testCasesTab.allProjects')}</option>
              {(projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
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
            emptyText={t('features.testing.testCasesTab.empty')}
            pageSize={10}
            onRowClick={canManageTesting ? (item) => setEditing(item) : undefined}
          />
        )}
      </Panel>

      {creating && canManageTesting ? (
        <TestCaseForm
          mode="create"
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
      {editing && canManageTesting ? (
        <TestCaseForm
          mode="edit"
          item={editing}
          onClose={handleCloseEditing}
          onDone={handleDoneEditing}
          canUseAi={canUseAi}
        />
      ) : null}
      {executing && canManageTesting ? (
        <TestExecutionForm item={executing} onClose={handleCloseExecuting} onDone={handleDoneExecuting} />
      ) : null}
    </div>
  );
}
