import { useMemo, useState } from 'react';
import { fetchFlowOverview, fetchProjectFlow } from '../features/projects/api';
import { fetchWorkflowTemplates } from '../features/workflow/api';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import FlowPipeline from '../components/common/FlowPipeline';
import DefectFunnel from '../components/common/DefectFunnel';
import type { FlowOverviewItem, GateState, ProjectFlow, WorkflowTemplate } from '../types';

const STATE_DOT: Record<GateState, string> = {
  done: 'var(--color-success, #16a34a)',
  passed: 'var(--color-success, #16a34a)',
  in_progress: 'var(--color-info, #2563eb)',
  blocked: 'var(--color-risk, #dc2626)',
  pending: 'var(--color-border, #cbd5e1)',
};

function FlowPage() {
  const { data: overview, loading, error, reload } = useAsync<FlowOverviewItem[]>(fetchFlowOverview, []);
  const {
    data: templateCatalog,
    loading: templateLoading,
    error: templateError,
    reload: reloadTemplates,
  } = useAsync(() => fetchWorkflowTemplates(false), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const templates = templateCatalog?.templates ?? [];
  const activeTemplate = useMemo(() => {
    if (!templates.length) return null;
    if (selectedTemplateId) return templates.find((item) => item.id === selectedTemplateId) || templates[0];
    return templates[0];
  }, [templates, selectedTemplateId]);

  const stageOrder = activeTemplate?.stages?.map((stage) => stage.id) ?? [];
  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    (activeTemplate?.stages || []).forEach((stage) => {
      map[stage.id] = stage.label || stage.id;
    });
    return map;
  }, [activeTemplate]);

  const matrixStyle = {
    ['--flow-stage-count' as string]: String(Math.max(stageOrder.length, 1)),
  };

  if (loading || error || !overview) {
    return (
      <div className="flow-page">
        <PageHeader title="研发流程" description="查看跨项目阶段门禁和交付流转概览。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !overview} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="flow-page">
      <PageHeader
        title="研发流程"
        description={`只保留两个模板：固定交付 / 轻量交付 · 共 ${overview.length} 个项目`}
        actions={(
          <button className="btn btn-secondary btn-sm" onClick={() => { reload(); reloadTemplates(); }}>
            刷新
          </button>
        )}
      />

      <div className="flow-legend-bar">
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.passed }} />已通过</span>
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.in_progress }} />进行中</span>
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.blocked }} />阻塞</span>
        <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.pending }} />未开始</span>
      </div>

      <Panel
        title="流程模板（二选一）"
        subtitle="系统只提供固定交付与轻量交付；项目在详情页绑定其一。此处预览阶段列顺序。"
        className="flow-template-panel"
      >
        {templateLoading && <p className="text-secondary">加载模板中...</p>}
        {templateError && <p className="form-error">{templateError}</p>}
        {!templateLoading && !templateError && (
          <>
            <div className="flow-template-grid">
              {templates.map((template: WorkflowTemplate) => {
                const active = activeTemplate?.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`flow-template-card ${active ? 'is-active' : ''}`}
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <div className="flow-template-card-head">
                      <strong>{template.name}</strong>
                      <span className="flow-template-badge">{template.stages?.length || 0} 阶段</span>
                    </div>
                    <p>{template.description || '系统内置交付模板'}</p>
                  </button>
                );
              })}
            </div>

            {activeTemplate ? (
              <div className="flow-template-preview">
                <div className="flow-stepper">
                  {activeTemplate.stages.map((stage, index) => (
                    <div key={stage.id} className="flow-step">
                      <span className="flow-step-node">{index + 1}</span>
                      <span className="flow-step-label" title={stage.description}>{stage.label}</span>
                      {index < activeTemplate.stages.length - 1 ? <span className="flow-step-connector filled" /> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Panel
        title="项目阶段矩阵"
        subtitle="点击项目行展开详情；列顺序跟随上方选中的模板预览"
        className="flow-matrix-panel"
      >
        <div className="flow-matrix" style={matrixStyle}>
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
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(isOpen ? null : item.projectId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flow-matrix-cell flow-matrix-project font-medium">
                    {item.projectName}
                    {item.workflow?.templateName ? (
                      <div className="flow-matrix-template-tag">{item.workflow.templateName}</div>
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
                {isOpen ? <ProjectFlowDetail projectId={item.projectId} /> : null}
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
      {data.workflow?.templateName ? (
        <p className="flow-detail-binding">
          当前绑定：{data.workflow.templateName}
          {data.workflow.templateVersion ? ` · ${data.workflow.templateVersion}` : ''}
        </p>
      ) : null}
      <FlowPipeline gates={data.gates} />
      <div className="grid-2 flow-detail-grid">
        <div>
          <div className="section-title">缺陷闭环</div>
          <DefectFunnel data={data.defectFunnel} />
        </div>
        <div>
          <div className="section-title">工时与规模</div>
          <div className="metric-grid flow-detail-metrics">
            <div className="metric-card"><div className="metric-card-label">预估</div><div className="metric-card-value">{data.hours.estimated}h</div></div>
            <div className="metric-card"><div className="metric-card-label">已消耗</div><div className="metric-card-value">{data.hours.consumed}h</div></div>
            <div className="metric-card"><div className="metric-card-label">剩余</div><div className="metric-card-value">{data.hours.remaining}h</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowPage;
