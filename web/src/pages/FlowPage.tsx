import { useEffect, useMemo, useState } from 'react';
import { fetchFlowOverview, fetchProjectFlow } from '../features/projects/api';
import {
  cloneWorkflowTemplate,
  createWorkflowTemplate,
  fetchWorkflowTemplates,
  publishWorkflowTemplate,
  updateWorkflowTemplate,
} from '../features/workflow/api';
import { useAsync } from '../hooks/useAsync';
import { getSessionUser } from '../services/auth';
import { canOperate } from '../constants/roles';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import FlowPipeline from '../components/common/FlowPipeline';
import DefectFunnel from '../components/common/DefectFunnel';
import type { FlowOverviewItem, ProjectFlow, GateState, WorkflowStage, WorkflowTemplate } from '../types';

const DEFAULT_STAGE_LABELS: Record<string, string> = {
  initiation: '立项',
  requirement: '需求',
  design: '设计',
  development: '开发',
  testing: '测试',
  acceptance: '验收',
  release: '发布',
};

const STATE_DOT: Record<GateState, string> = {
  done: 'var(--color-success, #16a34a)',
  passed: 'var(--color-success, #16a34a)',
  in_progress: 'var(--color-info, #2563eb)',
  blocked: 'var(--color-risk, #dc2626)',
  pending: 'var(--color-border, #cbd5e1)',
};

const DEFAULT_STAGE_ORDER = ['initiation', 'requirement', 'design', 'development', 'testing', 'acceptance', 'release'];

type EditableStage = {
  key: string;
  id: string;
  label: string;
  description: string;
};

function toEditableStages(stages: WorkflowStage[] | undefined): EditableStage[] {
  return (stages || []).map((stage, index) => ({
    key: `${stage.id || 'stage'}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    id: stage.id || `stage_${index + 1}`,
    label: stage.label || stage.id || `阶段${index + 1}`,
    description: stage.description || '',
  }));
}

function FlowPage() {
  const sessionUser = getSessionUser();
  const canAdmin = canOperate(sessionUser, 'admin:*') || sessionUser?.role === 'admin';

  const { data: overview, loading, error, reload } = useAsync<FlowOverviewItem[]>(fetchFlowOverview, []);
  const {
    data: templateCatalog,
    loading: templateLoading,
    error: templateError,
    reload: reloadTemplates,
  } = useAsync(() => fetchWorkflowTemplates(canAdmin), [canAdmin]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  // editable draft fields
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStages, setEditStages] = useState<EditableStage[]>([]);
  const [dirty, setDirty] = useState(false);

  const templates = templateCatalog?.templates ?? [];
  const activeTemplate = useMemo(() => {
    if (!templates.length) return null;
    if (selectedTemplateId) return templates.find((item) => item.id === selectedTemplateId) || templates[0];
    return templates[0];
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!activeTemplate) return;
    setEditName(activeTemplate.name || '');
    setEditDescription(activeTemplate.description || '');
    setEditStages(toEditableStages(activeTemplate.stages));
    setDirty(false);
  }, [activeTemplate?.id, activeTemplate?.updatedAt, activeTemplate?.version, activeTemplate?.status]);

  const stageOrder = (dirty ? editStages.map((s) => s.id) : activeTemplate?.stages?.map((stage) => stage.id))
    ?? DEFAULT_STAGE_ORDER;
  const stageLabels = useMemo(() => {
    const map = { ...DEFAULT_STAGE_LABELS };
    const source = dirty ? editStages : (activeTemplate?.stages || []);
    source.forEach((stage) => {
      map[stage.id] = stage.label || stage.id;
    });
    return map;
  }, [activeTemplate, editStages, dirty]);

  const canEditCurrent = Boolean(canAdmin && activeTemplate && !activeTemplate.builtin && activeTemplate.status === 'draft');

  async function runAction(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await fn();
      setActionOk(label);
      await reloadTemplates();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBlankDraft() {
    if (!canAdmin) return;
    await runAction('已创建空白草稿', async () => {
      const created = await createWorkflowTemplate({
        name: '新流程草稿',
        description: '可编辑阶段名称、顺序与说明，保存后发布并绑定到项目。',
        stages: [
          { id: 'initiation', label: '启动', description: '' },
          { id: 'development', label: '开发', description: '' },
          { id: 'testing', label: '测试', description: '' },
          { id: 'release', label: '发布', description: '' },
        ],
        guardrails: ['工作日志/工时/容量不用于个人绩效评价。'],
      });
      setSelectedTemplateId(created.id);
      setDirty(false);
    });
  }

  async function handleCloneCurrent() {
    if (!canAdmin || !activeTemplate) return;
    await runAction('已复制为可编辑草稿', async () => {
      const cloned = await cloneWorkflowTemplate(activeTemplate.id, {
        name: `${activeTemplate.name}（可编辑副本）`,
        description: activeTemplate.description,
        stages: activeTemplate.stages,
        guardrails: activeTemplate.guardrails,
        processModes: activeTemplate.processModes,
      });
      setSelectedTemplateId(cloned.id);
      setDirty(false);
    });
  }

  async function handleSaveDraft() {
    if (!canEditCurrent || !activeTemplate) return;
    const stages = editStages
      .map((stage) => ({
        id: stage.id.trim(),
        label: stage.label.trim(),
        description: stage.description.trim(),
      }))
      .filter((stage) => stage.id && stage.label);
    if (!stages.length) {
      setActionError('至少保留一个有效阶段（ID + 名称）');
      return;
    }
    const ids = stages.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      setActionError('阶段 ID 不能重复');
      return;
    }
    await runAction('草稿已保存', async () => {
      await updateWorkflowTemplate(activeTemplate.id, {
        name: editName.trim() || activeTemplate.name,
        description: editDescription,
        stages,
        guardrails: activeTemplate.guardrails || [],
        processModes: activeTemplate.processModes || [],
      });
      setDirty(false);
    });
  }

  async function handlePublish() {
    if (!canEditCurrent || !activeTemplate) return;
    if (dirty) {
      setActionError('请先保存草稿，再发布');
      return;
    }
    await runAction(`已发布 ${activeTemplate.name}`, async () => {
      const published = await publishWorkflowTemplate(activeTemplate.id);
      setSelectedTemplateId(published.id);
    });
  }

  function updateStage(key: string, patch: Partial<EditableStage>) {
    setEditStages((prev) => prev.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)));
    setDirty(true);
    setActionOk(null);
  }

  function moveStage(key: string, direction: -1 | 1) {
    setEditStages((prev) => {
      const index = prev.findIndex((stage) => stage.key === key);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDirty(true);
    setActionOk(null);
  }

  function removeStage(key: string) {
    setEditStages((prev) => (prev.length <= 1 ? prev : prev.filter((stage) => stage.key !== key)));
    setDirty(true);
    setActionOk(null);
  }

  function addStage() {
    const n = editStages.length + 1;
    setEditStages((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${n}`,
        id: `stage_${n}`,
        label: `新阶段${n}`,
        description: '',
      },
    ]);
    setDirty(true);
    setActionOk(null);
  }

  if (loading || error || !overview) {
    return (
      <div>
        <PageHeader title="研发流程" description="查看跨项目阶段门禁和交付流转概览。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !overview} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="研发流程"
        description={`跨项目阶段门禁总览 · 共 ${overview.length} 个项目`}
        actions={<button className="btn btn-secondary btn-sm" onClick={reload}>刷新</button>}
      />

      <div className="flow-legend-bar">
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.passed }} />已通过</span>
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.in_progress }} />进行中</span>
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.blocked }} />阻塞</span>
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.pending }} />未开始</span>
      </div>

      <Panel
        title="流程模板（可编辑）"
        subtitle={activeTemplate
          ? `${activeTemplate.name} · ${activeTemplate.builtin ? '内置' : (activeTemplate.status || 'custom')} · ${activeTemplate.version}${dirty ? ' · 未保存' : ''}`
          : '加载模板中'}
        className="mt-12"
      >
        {templateLoading && <p className="text-secondary">正在读取模板...</p>}
        {templateError && <p className="form-error">{templateError}</p>}

        {activeTemplate && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <label className="text-secondary" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                当前模板
                <select
                  className="form-input"
                  style={{ minWidth: 280 }}
                  value={activeTemplate.id}
                  disabled={busy}
                  onChange={(event) => {
                    setSelectedTemplateId(event.target.value);
                    setActionError(null);
                    setActionOk(null);
                  }}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.builtin ? '（内置）' : ''}
                      {template.status ? ` · ${template.status}` : ''}
                      {template.version ? ` · ${template.version}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {canAdmin && (
                <>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleCreateBlankDraft}>新建空白草稿</button>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleCloneCurrent}>复制为可编辑草稿</button>
                  {canEditCurrent && (
                    <>
                      <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={handleSaveDraft}>
                        {busy ? '处理中...' : '保存草稿'}
                      </button>
                      <button className="btn btn-primary btn-sm" disabled={busy || dirty} onClick={handlePublish}>
                        发布草稿
                      </button>
                    </>
                  )}
                </>
              )}
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reloadTemplates()}>刷新模板</button>
            </div>

            {actionError && <p className="form-error">{actionError}</p>}
            {actionOk && <p className="text-secondary" style={{ color: 'var(--color-success, #16a34a)' }}>{actionOk}</p>}

            {!canAdmin && (
              <p className="text-secondary">当前账号只读。管理员可复制内置模板为草稿后，直接改阶段名称/顺序并发布。</p>
            )}

            {canAdmin && !canEditCurrent && (
              <p className="text-secondary">
                内置或已发布模板不可直接改。请点「复制为可编辑草稿」，改完再「保存草稿」并「发布草稿」，然后到项目详情绑定。
              </p>
            )}

            <div className="grid-2" style={{ gap: 12 }}>
              <label className="text-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                模板名称
                <input
                  className="form-input"
                  value={editName}
                  disabled={!canEditCurrent || busy}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setDirty(true);
                    setActionOk(null);
                  }}
                />
              </label>
              <label className="text-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                模板说明
                <input
                  className="form-input"
                  value={editDescription}
                  disabled={!canEditCurrent || busy}
                  onChange={(e) => {
                    setEditDescription(e.target.value);
                    setDirty(true);
                    setActionOk(null);
                  }}
                />
              </label>
            </div>

            <div className="section-title" style={{ marginTop: 16 }}>阶段列表（可增删改排序）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {editStages.map((stage, index) => (
                <div key={stage.key} className="panel-soft" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span className="text-mono" style={{ minWidth: 28 }}>{index + 1}</span>
                    <input
                      className="form-input"
                      style={{ width: 140 }}
                      placeholder="阶段ID"
                      value={stage.id}
                      disabled={!canEditCurrent || busy}
                      onChange={(e) => updateStage(stage.key, { id: e.target.value })}
                    />
                    <input
                      className="form-input"
                      style={{ width: 160 }}
                      placeholder="阶段名称"
                      value={stage.label}
                      disabled={!canEditCurrent || busy}
                      onChange={(e) => updateStage(stage.key, { label: e.target.value })}
                    />
                    <input
                      className="form-input"
                      style={{ flex: 1, minWidth: 180 }}
                      placeholder="阶段说明（可选）"
                      value={stage.description}
                      disabled={!canEditCurrent || busy}
                      onChange={(e) => updateStage(stage.key, { description: e.target.value })}
                    />
                    {canEditCurrent && (
                      <>
                        <button className="btn btn-secondary btn-sm" disabled={busy || index === 0} onClick={() => moveStage(stage.key, -1)}>上移</button>
                        <button className="btn btn-secondary btn-sm" disabled={busy || index === editStages.length - 1} onClick={() => moveStage(stage.key, 1)}>下移</button>
                        <button className="btn btn-secondary btn-sm" disabled={busy || editStages.length <= 1} onClick={() => removeStage(stage.key)}>删除</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canEditCurrent && (
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={addStage}>新增阶段</button>
              </div>
            )}

            <div className="flow-stepper" style={{ marginTop: 16 }}>
              {editStages.map((stage, index) => (
                <div key={`preview-${stage.key}`} className="flow-step">
                  <span className="flow-step-node">{index + 1}</span>
                  <span className="flow-step-label" title={stage.description}>{stage.label || stage.id}</span>
                  {index < editStages.length - 1 && <span className="flow-step-connector filled" />}
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel title="项目阶段矩阵" subtitle="点击项目行可展开详情；列顺序跟随当前选中模板" className="mt-12">
        <div className="flow-matrix">
          <div className="flow-matrix-row flow-matrix-header">
            <div className="flow-matrix-cell flow-matrix-project">项目</div>
            {stageOrder.map((stage) => (
              <div key={stage} className="flow-matrix-cell flow-matrix-stage-head">{stageLabels[stage] || stage}</div>
            ))}
            <div className="flow-matrix-cell flow-matrix-health">健康度</div>
          </div>

          {overview.map((item) => {
            const isOpen = selectedId === item.projectId;
            return (
              <div key={item.projectId}>
                <div
                  className={`flow-matrix-row ${isOpen ? 'flow-matrix-row-active' : ''}`}
                  onClick={() => setSelectedId(isOpen ? null : item.projectId)}
                >
                  <div className="flow-matrix-cell flow-matrix-project font-medium">
                    {item.projectName}
                    {item.workflow?.templateName ? (
                      <div className="text-secondary" style={{ fontSize: 11 }}>{item.workflow.templateName}</div>
                    ) : null}
                  </div>
                  {stageOrder.map((stage) => {
                    const gate = item.gates.find((entry) => entry.stage === stage);
                    return (
                      <div key={stage} className="flow-matrix-cell flow-matrix-stage">
                        <span
                          className="flow-matrix-dot"
                          style={{ background: gate ? STATE_DOT[gate.state] : STATE_DOT.pending }}
                          title={gate ? `${gate.label || stage}: ${gate.state}` : stage}
                        />
                      </div>
                    );
                  })}
                  <div className="flow-matrix-cell flow-matrix-health text-mono">{item.healthScore}</div>
                </div>
                {isOpen && <ProjectFlowDetail projectId={item.projectId} />}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function ProjectFlowDetail({ projectId }: { projectId: string }) {
  const { data, loading, error } = useAsync<ProjectFlow>(() => fetchProjectFlow(projectId), [projectId]);
  if (loading) return <div className="flow-detail"><p className="text-secondary">正在加载流程详情...</p></div>;
  if (error || !data) return <div className="flow-detail"><p className="form-error">{error ?? '加载失败'}</p></div>;

  return (
    <div className="flow-detail">
      {data.workflow?.templateName && (
        <p className="text-secondary" style={{ marginTop: 0 }}>
          绑定模板：{data.workflow.templateName}
          {data.workflow.templateVersion ? ` · ${data.workflow.templateVersion}` : ''}
          {data.workflow.mode ? ` · ${data.workflow.mode}` : ''}
        </p>
      )}
      <FlowPipeline gates={data.gates} />
      <div className="grid-2 mt-12">
        <div>
          <div className="section-title">缺陷闭环</div>
          <DefectFunnel data={data.defectFunnel} />
        </div>
        <div>
          <div className="section-title">工时与规模</div>
          <div className="metric-grid" style={{ marginTop: 8 }}>
            <div className="metric-card"><div className="metric-card-label">预估</div><div className="metric-card-value">{data.hours.estimated}h</div></div>
            <div className="metric-card"><div className="metric-card-label">已消耗</div><div className="metric-card-value">{data.hours.consumed}h</div></div>
            <div className="metric-card"><div className="metric-card-label">剩余</div><div className="metric-card-value">{data.hours.remaining}h</div></div>
          </div>
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>
            需求 {data.counts.requirements} · 任务 {data.counts.tasks} · 缺陷 {data.counts.defects} · 用例 {data.counts.testCases}
          </p>
        </div>
      </div>
    </div>
  );
}

export default FlowPage;
