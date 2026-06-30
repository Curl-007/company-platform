import { useEffect, useMemo, useState } from 'react';
import {
  createDefect,
  createTestCase,
  createTestRun,
  deleteDefect,
  deleteTestCase,
  fetchDefects,
  fetchProjects,
  fetchTestCases,
  sendAiChat,
  updateDefect,
  updateDefectStatus,
  updateTestCase,
  updateTestCaseStatus,
  type CreateTestCaseInput,
  type DefectFilters,
  type UpdateDefectInput,
  type UpdateTestCaseInput,
} from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import { getSessionUser } from '../services/auth';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import FilterBar from '../components/common/FilterBar';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import BusinessAdvicePanel from '../components/common/BusinessAdvicePanel';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import type { Defect, Project, TestCase, TestRunInput } from '../types';
import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  TEST_CASE_STATUSES,
  TEST_CASE_STATUS_LABELS,
  TEST_RUN_RESULTS,
  TEST_RUN_RESULT_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../constants/enums';
import { canOperate } from '../constants/roles';

type Tab = 'cases' | 'defects';

function clearTestingFocusFromHash() {
  const hash = window.location.hash;
  const [pathPart, queryPart] = hash.split('?');
  if (!queryPart) return;
  const params = new URLSearchParams(queryPart);
  if (!params.has('focus')) return;
  params.delete('focus');
  const nextQuery = params.toString();
  window.location.hash = nextQuery ? `${pathPart}?${nextQuery}` : pathPart;
}

function TestingPage() {
  const [routeState, setRouteState] = useState<{ tab: Tab; focusId: string | null }>({ tab: 'cases', focusId: null });
  const [tab, setTab] = useState<Tab>('cases');
  const sessionUser = getSessionUser();
  const canUseAi = canOperate(sessionUser, 'ai:analyze');

  useEffect(() => {
    const syncRouteState = () => {
      const hash = window.location.hash;
      const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const params = new URLSearchParams(query);
      const nextTab: Tab = params.get('tab') === 'defects' ? 'defects' : 'cases';
      const focusId = params.get('focus');
      setRouteState({ tab: nextTab, focusId });
      setTab(nextTab);
    };

    syncRouteState();
    window.addEventListener('hashchange', syncRouteState);
    return () => window.removeEventListener('hashchange', syncRouteState);
  }, []);

  useEffect(() => {
    setTab(routeState.tab);
  }, [routeState.tab]);

  function handleClearFocus() {
    setRouteState((prev) => ({ ...prev, focusId: null }));
    clearTestingFocusFromHash();
  }

  return (
    <div>
      <PageHeader title="测试管理" description="集中管理测试用例、测试执行和缺陷闭环，支撑测试与开发之间的交接流转。" />
      {canUseAi ? <TestingQualityAiPanel /> : null}
      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        <button className={`nav-tab ${tab === 'cases' ? 'active' : ''}`} onClick={() => setTab('cases')}>测试用例</button>
        <button className={`nav-tab ${tab === 'defects' ? 'active' : ''}`} onClick={() => setTab('defects')}>缺陷列表</button>
      </div>
      {tab === 'cases'
        ? <TestCasesTab focusId={tab === 'cases' ? routeState.focusId : null} onClearFocus={handleClearFocus} />
        : <DefectsTab focusId={tab === 'defects' ? routeState.focusId : null} onClearFocus={handleClearFocus} />}
    </div>
  );
}

function passRate(testCase: TestCase): number {
  return testCase.totalCases > 0 ? Math.round((testCase.passedCases / testCase.totalCases) * 100) : 0;
}

function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function formatCounts(counts: Record<string, number>, labels: Record<string, string>): string {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([key, count]) => `${labelOf(labels, key)} ${count}`).join('、') : '无';
}

function buildTestingQualityAiPrompt(testCases: TestCase[], defects: Defect[], projects: Project[]): string {
  const projectNameMap = new Map(projects.map((project) => [project.id, project.name]));
  const caseStatusCounts = countBy(testCases.map((item) => item.status));
  const defectStatusCounts = countBy(defects.map((item) => item.status));
  const defectSeverityCounts = countBy(defects.map((item) => item.severity));
  const openDefects = defects.filter((item) => item.status !== 'closed');
  const seriousDefects = defects.filter((item) => ['critical', 'high', 'blocker'].includes(item.severity) && item.status !== 'closed');
  const riskyCases = [...testCases]
    .filter((item) => item.failedCases > 0 || item.blockedCases > 0 || passRate(item) < 80)
    .sort((a, b) => passRate(a) - passRate(b))
    .slice(0, 8)
    .map((item) => `${item.id} ${item.name} / ${projectNameMap.get(item.projectId) ?? item.projectId} / ${labelOf(TEST_CASE_STATUS_LABELS, item.status)} / 通过率 ${passRate(item)}% / 失败 ${item.failedCases} / 阻塞 ${item.blockedCases}`);
  const keyDefects = [...openDefects]
    .sort((a, b) => {
      const rank: Record<string, number> = { blocker: 5, critical: 4, high: 3, medium: 2, low: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    })
    .slice(0, 10)
    .map((item) => `${item.id} ${item.title} / ${projectNameMap.get(item.projectId) ?? item.projectId} / ${labelOf(DEFECT_SEVERITY_LABELS, item.severity)} / ${labelOf(DEFECT_STATUS_LABELS, item.status)} / ${item.assignee || '未分配'}`);
  const totalRuns = testCases.reduce((sum, item) => sum + item.totalCases, 0);
  const passedRuns = testCases.reduce((sum, item) => sum + item.passedCases, 0);
  const failedRuns = testCases.reduce((sum, item) => sum + item.failedCases, 0);
  const blockedRuns = testCases.reduce((sum, item) => sum + item.blockedCases, 0);
  const overallPassRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

  return [
    '请作为项目测试质量 AI 助手，基于下面的测试用例和缺陷快照给出质量分析。',
    '请控制在 900 字以内，输出：1. 当前质量判断 2. 主要风险 3. 回归/验证重点 4. 缺陷闭环建议 5. 需要补齐的数据。',
    '建议必须可执行，尽量指出具体用例、缺陷、项目和责任协作点。',
    '',
    `测试用例总数：${testCases.length}`,
    `执行总数：${totalRuns}，通过：${passedRuns}，失败：${failedRuns}，阻塞：${blockedRuns}，整体通过率：${overallPassRate}%`,
    `用例状态分布：${formatCounts(caseStatusCounts, TEST_CASE_STATUS_LABELS)}`,
    `缺陷总数：${defects.length}，未关闭缺陷：${openDefects.length}，高严重未关闭：${seriousDefects.length}`,
    `缺陷状态分布：${formatCounts(defectStatusCounts, DEFECT_STATUS_LABELS)}`,
    `缺陷严重级别分布：${formatCounts(defectSeverityCounts, DEFECT_SEVERITY_LABELS)}`,
    '',
    '高风险测试用例：',
    riskyCases.length ? riskyCases.join('\n') : '暂无失败、阻塞或低通过率用例',
    '',
    '重点未关闭缺陷：',
    keyDefects.length ? keyDefects.join('\n') : '暂无未关闭缺陷',
  ].join('\n');
}

function TestingQualityAiPanel() {
  const { data, loading, error, reload } = useAsync<{ testCases: TestCase[]; defects: Defect[]; projects: Project[] }>(
    () => Promise.all([fetchTestCases(), fetchDefects(), fetchProjects()]).then(([testCases, defects, projects]) => ({
      testCases,
      defects,
      projects,
    })),
    [],
  );
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const snapshot = data ?? { testCases: [], defects: [], projects: [] };
      const reply = await sendAiChat({
        messages: [
          {
            role: 'user',
            content: buildTestingQualityAiPrompt(snapshot.testCases, snapshot.defects, snapshot.projects),
          },
        ],
        scope: 'testing-quality-advice',
        currentPage: 'testing',
      });
      setAiAdvice(reply.content);
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : 'AI 质量分析生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  const testCases = data?.testCases ?? [];
  const defects = data?.defects ?? [];
  const openDefects = defects.filter((item) => item.status !== 'closed').length;
  const blockedCases = testCases.reduce((sum, item) => sum + item.blockedCases, 0);

  return (
    <section className="testing-ai-panel">
      <div className="testing-ai-main">
        <div>
          <div className="section-title">AI 质量驾驶舱</div>
          <div className="body-text">汇总测试用例、执行结果和缺陷闭环，生成回归重点与风险建议。</div>
        </div>
        <div className="testing-ai-stats">
          <span>用例 {testCases.length}</span>
          <span>未关闭缺陷 {openDefects}</span>
          <span>阻塞执行 {blockedCases}</span>
        </div>
      </div>
      <div className="testing-ai-actions">
        {loading || error ? (
          <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            {loading ? '加载质量数据...' : '重新加载质量数据'}
          </button>
        ) : null}
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={loading || aiLoading || Boolean(error)}>
          {aiLoading ? 'AI 分析中...' : aiAdvice ? '重新分析质量' : 'AI 质量建议'}
        </button>
      </div>
      {error ? <div className="form-error">质量数据加载失败，暂时无法生成 AI 建议。</div> : null}
      {(aiAdvice || aiLoading || aiError) ? (
        <div className="testing-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析测试通过率、阻塞用例和缺陷闭环，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="testing-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function TestCasesTab({ focusId, onClearFocus }: { focusId?: string | null; onClearFocus: () => void }) {
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

function TestCaseForm({
  mode,
  item,
  onClose,
  onDone,
  canUseAi = false,
}: {
  mode: 'create' | 'edit';
  item?: TestCase;
  onClose: () => void;
  onDone: () => void;
  canUseAi?: boolean;
}) {
  const { data: projects } = useAsync<Project[]>(fetchProjects, []);
  const [name, setName] = useState(item?.name ?? '');
  const [projectId, setProjectId] = useState(item?.projectId ?? '');
  const [owner, setOwner] = useState(item?.owner ?? '');
  const [assigneeRole, setAssigneeRole] = useState(item?.assigneeRole ?? 'qa');
  const [description, setDescription] = useState(item?.description ?? '');
  const [expectedResult, setExpectedResult] = useState(item?.expectedResult ?? '');
  const [stepsText, setStepsText] = useState((item?.steps ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return setFormError('请输入测试用例名称。');
    if (!projectId) return setFormError('请选择所属项目。');
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: CreateTestCaseInput & UpdateTestCaseInput = {
        name: name.trim(),
        projectId,
        owner: owner.trim() || undefined,
        assigneeRole,
        description: description.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean),
      };
      if (mode === 'create') await createTestCase(payload);
      else if (item) await updateTestCase(item.id, payload);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : `${mode === 'create' ? '创建' : '更新'}测试用例失败`);
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={mode === 'create' ? '新建测试用例' : '编辑测试用例'} subtitle={item?.id ?? '按项目创建并指派给测试或开发'}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        {canUseAi && item ? (
          <BusinessAdvicePanel
            targetType="test_case"
            targetId={item.id}
            title="AI 测试建议"
            description="基于后端测试用例、执行记录、关联需求、关联缺陷和同步任务生成。"
            buttonText="AI 分析用例"
            question="请分析该测试用例的覆盖充分性、失败/阻塞风险、缺陷关联和下一步验证动作。"
            draft={() => ({
              name: name.trim(),
              projectId,
              owner: owner.trim(),
              assigneeRole,
              steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean),
              expectedResult: expectedResult.trim(),
              description: description.trim(),
            })}
          />
        ) : null}
        <div className="form-group">
          <label className="form-label">用例名称</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">请选择项目</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">执行角色</label>
            <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
              <option value="qa">测试</option>
              <option value="dev">开发联调</option>
            </select>
          </div>
          {mode === 'edit' && item ? (
            <div className="form-group">
              <label className="form-label">当前状态</label>
              <div style={{ paddingTop: 10 }}>
                <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="form-group">
          <label className="form-label">步骤（每行一条）</label>
          <textarea className="form-textarea" rows={5} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">预期结果</label>
          <textarea className="form-textarea" rows={3} value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">说明</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}

function TestExecutionForm({ item, onClose, onDone }: { item: TestCase; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<'passed' | 'failed' | 'blocked'>('passed');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    setSubmitting(true);
    try {
      await createTestRun({ testCaseId: item.id, result, notes: notes.trim() || undefined } as TestRunInput);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '执行记录失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="记录测试执行" subtitle={item.name}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">执行结果</label>
          <div className="flex items-center gap-4" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {TEST_RUN_RESULTS.map((value) => (
              <label key={value} className="flex items-center gap-1">
                <input type="radio" checked={result === value} onChange={() => setResult(value)} />
                {labelOf(TEST_RUN_RESULT_LABELS, value)}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">执行备注</label>
          <textarea className="form-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '提交'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}

function DefectsTab({ focusId, onClearFocus }: { focusId?: string | null; onClearFocus: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageTesting = canOperate(sessionUser, 'testing:manage');
  const canUseAi = canOperate(sessionUser, 'ai:analyze');
  const [filters, setFilters] = useState<DefectFilters>({});
  const { data, loading, error, reload } = useAsync<Defect[]>(() => fetchDefects(filters), [filters.keyword, filters.status, filters.severity, filters.projectId]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Defect | null>(null);
  const defects = data ?? [];
  const { data: projects } = useAsync<Project[]>(fetchProjects, []);

  useEffect(() => {
    if (!canManageTesting || !focusId || defects.length === 0 || editing?.id === focusId) return;
    const matched = defects.find((item) => item.id === focusId);
    if (matched) setEditing(matched);
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
      {loading || error ? <PageState loading={loading} error={error} onRetry={reload} /> : <DataTable columns={columns} data={defects} rowKey="id" emptyText="暂无缺陷。" />}
      {creating && canManageTesting ? <DefectForm mode="create" onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} /> : null}
      {editing && canManageTesting ? <DefectForm mode="edit" item={editing} onClose={handleCloseEditing} onDone={handleDoneEditing} canUseAi={canUseAi} /> : null}
    </Panel>
  );
}

function DefectForm({
  mode,
  item,
  onClose,
  onDone,
  canUseAi = false,
}: {
  mode: 'create' | 'edit';
  item?: Defect;
  onClose: () => void;
  onDone: () => void;
  canUseAi?: boolean;
}) {
  const { data: projects } = useAsync<Project[]>(fetchProjects, []);
  const [title, setTitle] = useState(item?.title ?? '');
  const [projectId, setProjectId] = useState(item?.projectId ?? '');
  const [severity, setSeverity] = useState(item?.severity ?? 'medium');
  const [status, setStatus] = useState(item?.status ?? 'new');
  const [assignee, setAssignee] = useState(item?.assignee ?? '');
  const [assigneeRole, setAssigneeRole] = useState(item?.assigneeRole ?? 'dev');
  const [description, setDescription] = useState(item?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) return setFormError('请输入缺陷标题。');
    if (!projectId) return setFormError('请选择所属项目。');
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: UpdateDefectInput & { title: string; projectId?: string; severity: string; assigneeRole: string } = {
        title: title.trim(),
        projectId,
        severity,
        status,
        assignee: assignee.trim() || undefined,
        assigneeRole,
        description: description.trim() || undefined,
      };
      if (mode === 'create') await createDefect({ ...payload, projectId });
      else if (item) await updateDefect(item.id, payload);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : `${mode === 'create' ? '创建' : '更新'}缺陷失败`);
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={mode === 'create' ? '新建缺陷' : '编辑缺陷'} subtitle={item?.id ?? '支持测试指派开发修复，开发再指回测试验证'}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        {canUseAi && item ? (
          <BusinessAdvicePanel
            targetType="defect"
            targetId={item.id}
            title="AI 缺陷分析"
            description="基于后端缺陷、关联需求、关联构建和修复任务生成。"
            buttonText="AI 分析缺陷"
            question="请分析该缺陷的修复优先级、验证风险、责任协作和下一步动作。"
            draft={() => ({
              title: title.trim(),
              severity,
              status,
              assignee: assignee.trim() || null,
              assigneeRole,
              description: description.trim(),
            })}
          />
        ) : null}
        <div className="form-group">
          <label className="form-label">缺陷标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">请选择项目</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">严重级别</label>
            <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {DEFECT_SEVERITIES.map((value) => <option key={value} value={value}>{labelOf(DEFECT_SEVERITY_LABELS, value)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">当前处理人</label>
            <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="测试可指派给开发，开发可再指回测试" />
          </div>
          <div className="form-group">
            <label className="form-label">处理角色</label>
            <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
              <option value="dev">开发修复</option>
              <option value="qa">测试验证</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">状态</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {DEFECT_STATUSES.map((value) => <option key={value} value={value}>{labelOf(DEFECT_STATUS_LABELS, value)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">缺陷描述</label>
          <textarea className="form-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}

export default TestingPage;
