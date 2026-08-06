import { useMemo, useState } from 'react';
import { fetchFlowOverview } from '../../projects/api';
import { fetchWorkflowTemplates } from '../../workflow/api';
import { useAsync } from '../../../hooks/useAsync';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import type { FlowOverviewItem, GateState, WorkflowTemplate } from '../../../types';
import ProjectFlowDetail from './ProjectFlowDetail';

const STATE_DOT: Record<GateState, string> = {
  done: 'var(--color-success, #16a34a)',
  passed: 'var(--color-success, #16a34a)',
  in_progress: 'var(--color-info, #2563eb)',
  blocked: 'var(--color-risk, #dc2626)',
  pending: 'var(--color-border, #cbd5e1)',
};

type SignalTone = '' | 'is-success' | 'is-warn' | 'is-risk' | 'is-info';

interface FlowSignal {
  label: string;
  value: number;
  caption: string;
  tone: SignalTone;
}

export default function FlowView() {
  const { data: overview, loading, error, reload } = useAsync<FlowOverviewItem[]>(
    fetchFlowOverview,
    [],
    { cacheKey: 'flow:overview' },
  );
  const {
    data: templateCatalog,
    loading: templateLoading,
    error: templateError,
    reload: reloadTemplates,
  } = useAsync(() => fetchWorkflowTemplates(false), [], { cacheKey: 'workflow:templates' });

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

  // Aggregate gate states across all projects for the KPI signal strip.
  // done/passed both count as "已通过"; in_progress / blocked / pending map 1:1.
  const signals = useMemo<FlowSignal[]>(() => {
    if (!overview) return [];
    const gates = overview.flatMap((item) => item.gates);
    const passed = gates.filter((gate) => gate.state === 'done' || gate.state === 'passed').length;
    const inProgress = gates.filter((gate) => gate.state === 'in_progress').length;
    const blocked = gates.filter((gate) => gate.state === 'blocked').length;
    const pending = gates.filter((gate) => gate.state === 'pending').length;
    return [
      { label: '项目总数', value: overview.length, caption: '当前流程范围', tone: '' },
      { label: '已通过门禁', value: passed, caption: 'done / passed', tone: 'is-success' },
      { label: '进行中门禁', value: inProgress, caption: '当前推进阶段', tone: 'is-info' },
      { label: '阻塞门禁', value: blocked, caption: blocked > 0 ? '需介入处理' : '无阻塞', tone: blocked > 0 ? 'is-risk' : '' },
      { label: '未开始门禁', value: pending, caption: '尚未启动', tone: pending > 0 ? 'is-warn' : '' },
    ];
  }, [overview]);

  if (loading || error || !overview) {
    return (
      <div className="flow-workbench flow-page">
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !overview} onRetry={reload} />
      </div>
    );
  }

  const handleRefresh = () => { reload(); reloadTemplates(); };

  return (
    <div className="flow-workbench flow-page">
      <div className="flow-toolbar">
        <p className="flow-toolbar-summary">
          只保留两个模板：固定交付 / 轻量交付 · 共 {overview.length} 个项目
        </p>
        <div className="flow-toolbar-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh}>
            刷新
          </button>
        </div>
      </div>

      <section className="flow-signal-strip" aria-label="研发流程概况">
        {signals.map((item) => (
          <div key={item.label} className={`flow-signal ${item.tone}`.trim()}>
            <span className="flow-signal-label">{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.caption}</em>
          </div>
        ))}
      </section>

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
        <div className="flow-legend-bar">
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.passed }} />已通过</span>
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.in_progress }} />进行中</span>
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.blocked }} />阻塞</span>
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.pending }} />未开始</span>
        </div>
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
