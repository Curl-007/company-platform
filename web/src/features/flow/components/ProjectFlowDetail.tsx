import { fetchProjectFlow } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import FlowPipeline from '../../../components/common/FlowPipeline';
import DefectFunnel from '../../../components/common/DefectFunnel';
import type { ProjectFlow } from '../../../types';

export default function ProjectFlowDetail({ projectId }: { projectId: string }) {
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
