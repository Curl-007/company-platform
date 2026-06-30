import { useState } from 'react';
import { fetchFlowOverview, fetchProjectFlow } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import FlowPipeline from '../components/common/FlowPipeline';
import DefectFunnel from '../components/common/DefectFunnel';
import type { FlowOverviewItem, ProjectFlow, GateState } from '../types';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
