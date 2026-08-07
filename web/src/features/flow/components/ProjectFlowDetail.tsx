import { useTranslation } from 'react-i18next';
import { fetchProjectFlow } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import FlowPipeline from '../../../components/common/FlowPipeline';
import DefectFunnel from '../../../components/common/DefectFunnel';
import type { ProjectFlow } from '../../../types';

export default function ProjectFlowDetail({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data, loading, error } = useAsync<ProjectFlow>(
    () => fetchProjectFlow(projectId),
    [projectId],
    { cacheKey: 'project:flow' },
  );
  if (loading) return <div className="flow-detail"><p className="text-secondary">{t('features.flow.projectFlowDetail.loading')}</p></div>;
  if (error || !data) return <div className="flow-detail"><p className="form-error">{error ?? t('features.flow.projectFlowDetail.loadFailed')}</p></div>;

  return (
    <div className="flow-detail">
      {data.workflow?.templateName ? (
        <p className="flow-detail-binding">
          {t('features.flow.projectFlowDetail.binding', { name: data.workflow.templateName })}
          {data.workflow.templateVersion ? t('features.flow.projectFlowDetail.bindingVersion', { version: data.workflow.templateVersion }) : ''}
        </p>
      ) : null}
      <FlowPipeline gates={data.gates} />
      <div className="grid-2 flow-detail-grid">
        <div>
          <div className="section-title">{t('features.flow.projectFlowDetail.defectFunnel')}</div>
          <DefectFunnel data={data.defectFunnel} />
        </div>
        <div>
          <div className="section-title">{t('features.flow.projectFlowDetail.hoursTitle')}</div>
          <div className="metric-grid flow-detail-metrics">
            <div className="metric-card"><div className="metric-card-label">{t('features.flow.projectFlowDetail.estimated')}</div><div className="metric-card-value">{data.hours.estimated}h</div></div>
            <div className="metric-card"><div className="metric-card-label">{t('features.flow.projectFlowDetail.consumed')}</div><div className="metric-card-value">{data.hours.consumed}h</div></div>
            <div className="metric-card"><div className="metric-card-label">{t('features.flow.projectFlowDetail.remaining')}</div><div className="metric-card-value">{data.hours.remaining}h</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
