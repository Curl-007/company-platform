import { useMemo, useState } from 'react';
import { fetchFlowOverview, fetchProjectFlow } from '../features/projects/api';
import {
  createWorkflowTemplate,
  fetchWorkflowTemplates,
  publishWorkflowTemplate,
} from '../features/workflow/api';
import { useAsync } from '../hooks/useAsync';
import { getSessionUser } from '../services/auth';
import { canOperate } from '../constants/roles';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import FlowPipeline from '../components/common/FlowPipeline';
import DefectFunnel from '../components/common/DefectFunnel';
import type { FlowOverviewItem, ProjectFlow, GateState, WorkflowTemplate } from '../types';

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
  const [creating, setCreating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('自定义轻量交付');

  const templates = templateCatalog?.templates ?? [];
  const activeTemplate = useMemo(() => {
    if (!templates.length) return null;
    if (selectedTemplateId) return templates.find((item) => item.id === selectedTemplateId) || templates[0];
    return templates[0];
  }, [templates, selectedTemplateId]);

  const stageOrder = activeTemplate?.stages?.map((stage) => stage.id) ?? DEFAULT_STAGE_ORDER;
  const stageLabels = useMemo(() => {
    const map = { ...DEFAULT_STAGE_LABELS };
    activeTemplate?.stages?.forEach((stage) => {
      map[stage.id] = stage.label || stage.id;
    });
    return map;
  }, [activeTemplate]);

  async function handleCreateDraft() {
    if (!canAdmin) return;
    setCreating(true);
    setActionError(null);
    setActionOk(null);
    try {
      const created = await createWorkflowTemplate({
        name: draftName.trim() || '自定义流程模板',
        description: '从流程页创建的可配置模板草稿，可再发布并绑定到项目。',
        stages: [
          { id: 'initiation', label: '启动' },
          { id: 'development', label: '开发' },
          { id: 'testing', label: '测试' },
          { id: 'release', label: '发布' },
        ],
        guardrails: ['工作日志/工时/容量不用于个人绩效评价。'],
      });
      setActionOk(`已创建草稿 ${created.id}`);
      setSelectedTemplateId(created.id);
      await reloadTemplates();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(templateId: string) {
    if (!canAdmin) return;
    setPublishingId(templateId);
    setActionError(null);
    setActionOk(null);
    try {
      const published = await publishWorkflowTemplate(templateId);
      setActionOk(`已发布 ${published.name}（${published.version}）`);
      await reloadTemplates();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setPublishingId(null);
    }
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

      <WorkflowTemplatePanel
        templates={templates}
        activeTemplate={activeTemplate}
        loading={templateLoading}
        error={templateError}
        canAdmin={canAdmin}
        draftName={draftName}
        creating={creating}
        publishingId={publishingId}
        actionError={actionError}
        actionOk={actionOk}
        onDraftNameChange={setDraftName}
        onSelectTemplate={setSelectedTemplateId}
        onCreateDraft={handleCreateDraft}
        onPublish={handlePublish}
        onRetry={reloadTemplates}
      />

      <Panel title="项目阶段矩阵" subtitle="点击项目行可展开查看详细流程；列顺序跟随当前选中模板" className="mt-12">
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

function WorkflowTemplatePanel({
  templates,
  activeTemplate,
  loading,
  error,
  canAdmin,
  draftName,
  creating,
  publishingId,
  actionError,
  actionOk,
  onDraftNameChange,
  onSelectTemplate,
  onCreateDraft,
  onPublish,
  onRetry,
}: {
  templates: WorkflowTemplate[];
  activeTemplate: WorkflowTemplate | null;
  loading: boolean;
  error: string | null;
  canAdmin: boolean;
  draftName: string;
  creating: boolean;
  publishingId: string | null;
  actionError: string | null;
  actionOk: string | null;
  onDraftNameChange: (value: string) => void;
  onSelectTemplate: (id: string) => void;
  onCreateDraft: () => void;
  onPublish: (id: string) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <Panel title="流程模板" subtitle="正在读取模板目录..." className="mt-12">
        <p className="text-secondary">加载中...</p>
      </Panel>
    );
  }

  if (error || !activeTemplate) {
    return (
      <Panel title="流程模板" subtitle="模板目录加载失败，不影响项目阶段矩阵查看。" className="mt-12">
        <p className="form-error">{error ?? '暂无流程模板'}</p>
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>重试</button>
      </Panel>
    );
  }

  const visibleResources = (activeTemplate.resources || []).filter((item) =>
    ['project', 'requirement', 'task', 'sprint'].includes(item.resource),
  );

  return (
    <Panel
      title="流程模板"
      subtitle={`${activeTemplate.name} · ${activeTemplate.mode === 'fixed' ? '固定模板' : activeTemplate.mode || 'configurable'} · ${activeTemplate.version}${activeTemplate.status ? ` · ${activeTemplate.status}` : ''}`}
      className="mt-12"
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label className="text-secondary" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          查看模板
          <select
            className="form-input"
            style={{ minWidth: 260 }}
            value={activeTemplate.id}
            onChange={(event) => onSelectTemplate(event.target.value)}
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
            <input
              className="form-input"
              style={{ minWidth: 180 }}
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              placeholder="新草稿名称"
            />
            <button className="btn btn-secondary btn-sm" disabled={creating} onClick={onCreateDraft}>
              {creating ? '创建中...' : '新建草稿模板'}
            </button>
            {!activeTemplate.builtin && activeTemplate.status === 'draft' && (
              <button
                className="btn btn-primary btn-sm"
                disabled={publishingId === activeTemplate.id}
                onClick={() => onPublish(activeTemplate.id)}
              >
                {publishingId === activeTemplate.id ? '发布中...' : '发布当前草稿'}
              </button>
            )}
          </>
        )}
      </div>

      {actionError && <p className="form-error">{actionError}</p>}
      {actionOk && <p className="text-secondary" style={{ color: 'var(--color-success, #16a34a)' }}>{actionOk}</p>}

      <p className="text-secondary" style={{ marginTop: 0 }}>{activeTemplate.description}</p>
      <div className="flow-stepper" style={{ marginTop: 12 }}>
        {activeTemplate.stages.map((stage, index) => (
          <div key={stage.id} className="flow-step">
            <span className="flow-step-node">{index + 1}</span>
            <span className="flow-step-label" title={stage.description}>{stage.label}</span>
            {index < activeTemplate.stages.length - 1 && <span className="flow-step-connector filled" />}
          </div>
        ))}
      </div>
      <div className="grid-2 mt-12">
        <div>
          <div className="section-title">状态流转契约</div>
          <div className="mt-8" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleResources.length === 0 && (
              <p className="text-secondary">自定义模板可仅定义阶段目录；资源状态机默认沿用系统固定契约。</p>
            )}
            {visibleResources.map((resource) => (
              <div key={resource.resource} className="panel-soft" style={{ padding: 10 }}>
                <div className="font-medium">{resource.label}</div>
                <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  {Object.entries(resource.transitions || {})
                    .filter(([, next]) => next.length > 0)
                    .map(([from, next]) => `${from} → ${next.join('/')}`)
                    .join('；') || '无显式流转配置'}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="section-title">治理边界</div>
          <ul className="text-secondary" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {(activeTemplate.guardrails || []).map((item) => <li key={item}>{item}</li>)}
            {!(activeTemplate.guardrails || []).length && <li>无附加治理说明</li>}
          </ul>
        </div>
      </div>
    </Panel>
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
