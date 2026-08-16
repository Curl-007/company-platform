import { useTranslation } from 'react-i18next';
import { fetchProjectFlow } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import FlowPipeline from '../../../components/common/FlowPipeline';
import DefectFunnel from '../../../components/common/DefectFunnel';
import SortableSectionLayout, { SortableSection } from '../../../components/common/SortableSectionLayout';
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
      <SortableSectionLayout surface="flow.project-detail" className="flow-detail-sortable">
        {data.workflow?.templateName ? (
          <SortableSection id="workflow-binding" label={t('features.flow.projectFlowDetail.binding', { name: data.workflow.templateName })} className="wide">
            <p className="flow-detail-binding">
              {t('features.flow.projectFlowDetail.binding', { name: data.workflow.templateName })}
              {data.workflow.templateVersion ? t('features.flow.projectFlowDetail.bindingVersion', { version: data.workflow.templateVersion }) : ''}
            </p>
          </SortableSection>
        ) : null}
        <SortableSection id="pipeline" label={t('features.flow.projectFlowDetail.loading')} className="wide">
          <FlowPipeline gates={data.gates} />
        </SortableSection>
        <SortableSection id="defect-funnel" label={t('features.flow.projectFlowDetail.defectFunnel')}>
        <div>
          <div className="section-title">{t('features.flow.projectFlowDetail.defectFunnel')}</div>
          <DefectFunnel data={data.defectFunnel} />
        </div>
        </SortableSection>
        <SortableSection id="hours" label={t('features.flow.projectFlowDetail.hoursTitle')}>
        <div>
          <div className="section-title">{t('features.flow.projectFlowDetail.hoursTitle')}</div>
          <div className="metric-grid flow-detail-metrics">
            <div className="metric-card"><div className="metric-card-label">{t('features.flow.projectFlowDetail.estimated')}</div><div className="metric-card-value">{data.hours.estimated}h</div></div>
            <div className="metric-card"><div className="metric-card-label">{t('features.flow.projectFlowDetail.consumed')}</div><div className="metric-card-value">{data.hours.consumed}h</div></div>
            <div className="metric-card"><div className="metric-card-label">{t('features.flow.projectFlowDetail.remaining')}</div><div className="metric-card-value">{data.hours.remaining}h</div></div>
          </div>
        </div>
        </SortableSection>
      </SortableSectionLayout>
    </div>
  );
}
