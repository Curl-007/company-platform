import { useState } from 'react';
import { fetchFlowOverview, fetchProjectFlow } from '../features/projects/api';
import { fetchWorkflowTemplates } from '../features/workflow/api';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import FlowPipeline from '../components/common/FlowPipeline';
import DefectFunnel from '../components/common/DefectFunnel';
import type { FlowOverviewItem, ProjectFlow, GateState, WorkflowTemplate } from '../types';

const STAGE_LABELS: Record<string, string> = {
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

const STAGE_ORDER = ['initiation', 'requirement', 'design', 'development', 'testing', 'acceptance', 'release'];

function FlowPage() {
  const { data: overview, loading, error, reload } = useAsync<FlowOverviewItem[]>(fetchFlowOverview, []);
  const { data: templateCatalog, loading: templateLoading, error: templateError, reload: reloadTemplates } = useAsync(fetchWorkflowTemplates, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeTemplate = templateCatalog?.templates[0] ?? null;

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
        template={activeTemplate}
        loading={templateLoading}
        error={templateError}
        onRetry={reloadTemplates}
      />

      <Panel title="项目阶段矩阵" subtitle="点击项目行可展开查看详细流程" className="mt-12">
        <div className="flow-matrix">
          <div className="flow-matrix-row flow-matrix-header">
            <div className="flow-matrix-cell flow-matrix-project">项目</div>
            {STAGE_ORDER.map((stage) => (
              <div key={stage} className="flow-matrix-cell flow-matrix-stage-head">{STAGE_LABELS[stage]}</div>
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
                  <div className="flow-matrix-cell flow-matrix-project font-medium">{item.projectName}</div>
                  {STAGE_ORDER.map((stage) => {
                    const gate = item.gates.find((entry) => entry.stage === stage);
                    return (
                      <div key={stage} className="flow-matrix-cell flow-matrix-stage">
                        <span className="flow-matrix-dot" style={{ background: gate ? STATE_DOT[gate.state] : STATE_DOT.pending }} title={gate ? gate.state : ''} />
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
  template,
  loading,
  error,
  onRetry,
}: {
  template: WorkflowTemplate | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <Panel title="流程模板" subtitle="正在读取后端固定模板契约..." className="mt-12">
        <p className="text-secondary">加载中...</p>
      </Panel>
    );
  }

  if (error || !template) {
    return (
      <Panel
        title="流程模板"
        subtitle="模板目录加载失败，不影响项目阶段矩阵查看。"
        className="mt-12"
      >
        <p className="form-error">{error ?? '暂无流程模板'}</p>
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>重试</button>
      </Panel>
    );
  }

  const visibleResources = template.resources.filter((item) => ['project', 'requirement', 'task', 'sprint'].includes(item.resource));

  return (
    <Panel
      title="流程模板"
      subtitle={`${template.name} · ${template.mode === 'fixed' ? '固定模板' : template.mode} · v${template.version}`}
      className="mt-12"
    >
      <p className="text-secondary" style={{ marginTop: 0 }}>{template.description}</p>
      <div className="flow-stepper" style={{ marginTop: 12 }}>
        {template.stages.map((stage, index) => (
          <div key={stage.id} className="flow-step">
            <span className="flow-step-node">{index + 1}</span>
            <span className="flow-step-label" title={stage.description}>{stage.label}</span>
            {index < template.stages.length - 1 && <span className="flow-step-connector filled" />}
          </div>
        ))}
      </div>
      <div className="grid-2 mt-12">
        <div>
          <div className="section-title">状态流转契约</div>
          <div className="mt-8" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleResources.map((resource) => (
              <div key={resource.resource} className="panel-soft" style={{ padding: 10 }}>
                <div className="font-medium">{resource.label}</div>
                <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  {Object.entries(resource.transitions)
                    .filter(([, next]) => next.length > 0)
                    .map(([from, next]) => `${from} → ${next.join('/')}`)
                    .join('；')}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="section-title">治理边界</div>
          <ul className="text-secondary" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {template.guardrails.map((item) => <li key={item}>{item}</li>)}
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
