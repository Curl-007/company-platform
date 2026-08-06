import { useEffect, useMemo, useState } from 'react';
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
      toast.error('当前账号无权删除测试用例。');
      return;
    }
    const confirmed = await confirm({
      title: `删除测试用例“${item.name}”？`,
      description: '删除后测试步骤、执行入口和关联记录将从测试管理中移除。',
      confirmText: '删除用例',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteTestCase(item.id);
      toast.success(`已删除测试用例：${item.name}`);
      reload();
    } catch (err) {
      // 409 = has dependencies; offer cascade delete on explicit confirmation.
      if (err instanceof ApiError && err.status === 409) {
        const summary = summarizeDependencies((err.body as { details?: { dependencies?: Record<string, unknown> } })?.details?.dependencies);
        const cascade = await confirm({
          title: summary ? '检测到关联记录' : '该用例存在关联记录',
          description: summary
            ? `“${item.name}”关联了 ${summary}。是否一并删除这些记录？此操作不可恢复。`
            : `“${item.name}”仍有关联记录。是否一并删除？此操作不可恢复。`,
          confirmText: '级联删除',
          tone: 'danger',
        });
        if (!cascade) return;
        try {
          await deleteTestCase(item.id, true);
          toast.success(`已删除测试用例及其关联记录：${item.name}`);
          reload();
        } catch (cascadeErr) {
          toast.error(cascadeErr instanceof ApiError ? cascadeErr.message : '级联删除失败');
        }
        return;
      }
      toast.error(err instanceof ApiError ? err.message : '删除测试用例失败');
    }
  }

  async function handleStatusChange(item: TestCase, nextStatus: string) {
    try {
      await updateTestCaseStatus(item.id, nextStatus);
      toast.success('测试状态已更新');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '更新测试状态失败');
    }
  }

  const focusButtons: { key: CaseFocus; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: signals.total },
    { key: 'risky', label: '风险', count: signals.risky },
    { key: 'failed', label: '失败', count: signals.failed },
    { key: 'blocked', label: '阻塞', count: signals.blocked },
    { key: 'passed', label: '通过', count: signals.passed },
  ];

  const columns: DataTableColumn<TestCase>[] = [
    {
      key: 'name',
      title: '用例',
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
      title: '执行角色',
      width: 96,
      render: (item) => (
        <span className="qa-meta-text">
          {item.assigneeRole ? labelOf(USER_ROLE_LABELS, item.assigneeRole) : '测试'}
        </span>
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
            aria-label={`更新 ${item.name} 状态`}
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
      title: '执行',
      width: 120,
      render: (item) => (
        <div className="qa-run-cell">
          <span>总 {item.totalCases}</span>
          <em>
            过 {item.passedCases}
            {item.failedCases > 0 ? ` · 败 ${item.failedCases}` : ''}
            {item.blockedCases > 0 ? ` · 阻 ${item.blockedCases}` : ''}
          </em>
        </div>
      ),
    },
    {
      key: 'passed',
      title: '通过率',
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
      title: '操作',
      width: 140,
      render: (item) => (
        <div className="qa-row-actions" onClick={(e) => e.stopPropagation()}>
          {canManageTesting ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setExecuting(item)}>执行</button>
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
      <section className="qa-signal-strip" aria-label="用例概况">
        <div className="qa-signal">
          <span className="qa-signal-label"><CircleDashed size={13} aria-hidden="true" /> 用例总数</span>
          <strong>{signals.total}</strong>
          <em>整体通过 {signals.overallPass}%</em>
        </div>
        <div className={`qa-signal ${signals.risky > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><AlertTriangle size={13} aria-hidden="true" /> 风险用例</span>
          <strong>{signals.risky}</strong>
          <em>失败 / 阻塞 / 低通过率</em>
        </div>
        <div className={`qa-signal ${signals.failed > 0 ? 'is-risk' : ''}`}>
          <span className="qa-signal-label"><XCircle size={13} aria-hidden="true" /> 失败相关</span>
          <strong>{signals.failed}</strong>
          <em>失败执行 {signals.failedRuns}</em>
        </div>
        <div className={`qa-signal ${signals.blocked > 0 ? 'is-warn' : ''}`}>
          <span className="qa-signal-label"><CircleDashed size={13} aria-hidden="true" /> 阻塞相关</span>
          <strong>{signals.blocked}</strong>
          <em>阻塞执行 {signals.blockedRuns}</em>
        </div>
        <div className="qa-signal">
          <span className="qa-signal-label"><CheckCircle2 size={13} aria-hidden="true" /> 通过相关</span>
          <strong>{signals.passed}</strong>
          <em>状态通过或 100%</em>
        </div>
      </section>

      <Panel
        className="qa-pool-panel"
        title="测试用例"
        subtitle={`显示 ${visible.length} / ${tests.length} 条`}
        toolbar={(
          <div className="qa-pool-toolbar">
            <button className="btn btn-secondary btn-sm btn-with-icon" onClick={reload} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" /> 刷新
            </button>
            {canManageTesting ? (
              <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
                <Plus size={14} aria-hidden="true" /> 新建用例
              </button>
            ) : null}
          </div>
        )}
      >
        <div className="qa-focus-row" role="group" aria-label="用例快速聚焦">
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
                placeholder="搜索用例名称 / 编号 / 负责人"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                aria-label="搜索用例"
              />
            </div>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="用例状态"
            >
              <option value="">全部状态</option>
              {TEST_CASE_STATUSES.map((status) => (
                <option key={status} value={status}>{labelOf(TEST_CASE_STATUS_LABELS, status)}</option>
              ))}
            </select>
            <select
              className="form-select filter-project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="所属项目"
            >
              <option value="">全部项目</option>
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
            emptyText="暂无匹配的测试用例。"
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
