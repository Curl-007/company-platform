import { useEffect, useState } from 'react';
import {
  deleteTestCase,
  fetchTestCases,
  updateTestCaseStatus,
} from '../api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { TestCase } from '../../../types';
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
  const { data, loading, error, reload } = useAsync<TestCase[]>(fetchTestCases, []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [executing, setExecuting] = useState<TestCase | null>(null);
  const tests = data ?? [];

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
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除测试用例失败');
    }
  }

  const columns: DataTableColumn<TestCase>[] = [
    { key: 'name', title: '用例名称', render: (item) => <span className="font-medium">{item.name}</span> },
    { key: 'owner', title: '负责人', render: (item) => item.owner || '-' },
    { key: 'role', title: '执行角色', render: (item) => item.assigneeRole ? labelOf(USER_ROLE_LABELS, item.assigneeRole) : '测试' },
    {
      key: 'status',
      title: '状态',
      render: (item) => (
        canManageTesting ? (
          <select className="form-select" value={item.status} onClick={(e) => e.stopPropagation()} onChange={async (e) => {
            await updateTestCaseStatus(item.id, e.target.value);
            toast.success('测试状态已更新');
            reload();
          }}>
            {TEST_CASE_STATUSES.map((status) => <option key={status} value={status}>{labelOf(TEST_CASE_STATUS_LABELS, status)}</option>)}
          </select>
        ) : <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
      ),
    },
    { key: 'passed', title: '通过率', render: (item) => <ProgressBar percent={passRate(item)} height={6} /> },
    {
      key: 'actions',
      title: '操作',
      render: (item) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canManageTesting ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setExecuting(item)}>执行</button>
              <button className="btn btn-text btn-xs" onClick={() => setEditing(item)}>编辑</button>
              <button className="btn btn-text btn-xs" style={{ color: 'var(--color-red, #dc2626)' }} onClick={() => void handleDelete(item)}>删除</button>
            </>
          ) : <span className="text-secondary">只读</span>}
        </div>
      ),
    },
  ];

  return (
    <Panel title="测试用例" subtitle={`共 ${tests.length} 条`} toolbar={canManageTesting ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建测试用例</button> : undefined}>
      {loading || error ? (
        <PageState loading={loading} error={error} onRetry={reload} />
      ) : (
        <DataTable columns={columns} data={tests} rowKey="id" emptyText="暂无测试用例。" />
      )}

      {creating && canManageTesting ? <TestCaseForm mode="create" onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} /> : null}
      {editing && canManageTesting ? <TestCaseForm mode="edit" item={editing} onClose={handleCloseEditing} onDone={handleDoneEditing} canUseAi={canUseAi} /> : null}
      {executing && canManageTesting ? <TestExecutionForm item={executing} onClose={handleCloseExecuting} onDone={handleDoneExecuting} /> : null}
    </Panel>
  );
}
