import { fetchProjectFlow } from '../api';
import { useAsync } from '../../../hooks/useAsync';
import PageState from '../../../components/common/PageState';
import Panel from '../../../components/common/Panel';
import FlowPipeline from '../../../components/common/FlowPipeline';
import DefectFunnel from '../../../components/common/DefectFunnel';
import type { ProjectFlow } from '../../../types';

export default function FlowTab({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useAsync<ProjectFlow>(() => fetchProjectFlow(projectId), [projectId]);

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="研发流程门禁" subtitle={`${data.projectName} · 按阶段自动评估，绿色表示通过，红色表示阻塞`}>
        <FlowPipeline gates={data.gates} />
      </Panel>

      <div className="grid-2">
        <Panel title="缺陷闭环" subtitle="缺陷状态漏斗与关闭转化情况">
          <DefectFunnel data={data.defectFunnel} />
        </Panel>
        <Panel title="工时与规模" subtitle="预估 / 消耗 / 剩余 三类工时数据">
          <div className="metric-grid" style={{ marginBottom: 12 }}>
            <div className="metric-card"><div className="metric-card-label">预估工时</div><div className="metric-card-value">{data.hours.estimated}<span className="metric-card-unit">h</span></div></div>
            <div className="metric-card"><div className="metric-card-label">已消耗</div><div className="metric-card-value">{data.hours.consumed}<span className="metric-card-unit">h</span></div></div>
            <div className="metric-card"><div className="metric-card-label">剩余工时</div><div className="metric-card-value">{data.hours.remaining}<span className="metric-card-unit">h</span></div></div>
          </div>
          <div className="text-secondary" style={{ fontSize: 13 }}>需求 {data.counts.requirements} · 任务 {data.counts.tasks} · 缺陷 {data.counts.defects} · 测试用例 {data.counts.testCases}</div>
        </Panel>
      </div>
    </div>
  );
}
