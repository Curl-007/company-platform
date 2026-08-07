import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProjectDeliveryData } from '../detailModel';
import CreateSprintForm from './CreateSprintForm';
import type { ProjectDeliveryData } from '../deliveryModel';
import ProjectDeliveryPanel from './ProjectDeliveryPanel';
import SprintBurndownRow from './SprintBurndownRow';
import { useAsync } from '../../../hooks/useAsync';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { ProjectDetail } from '../../../types';
import { MILESTONE_STATUS_LABELS, labelOf } from '../../../constants/enums';

export default function OverviewTab({
  project,
  projectId,
  onReload,
  canManageProject,
}: {
  project: ProjectDetail;
  projectId: string;
  onReload: () => void;
  canManageProject: boolean;
}) {
  const { t } = useTranslation();
  const [creatingSprint, setCreatingSprint] = useState(false);
  const {
    data: delivery,
    loading: deliveryLoading,
    error: deliveryError,
    reload: reloadDelivery,
  } = useAsync<ProjectDeliveryData>(
    () => fetchProjectDeliveryData(project),
    [project.id, project.productId ?? ''],
    { cacheKey: 'projects:delivery' },
  );

  return (
    <div className="pd-tab pd-overview-tab">
      <ProjectDeliveryPanel
        project={project}
        data={delivery}
        loading={deliveryLoading}
        error={deliveryError}
        onRetry={reloadDelivery}
      />

      <div className="pd-side-grid">
        <Panel
          title={t('features.projects.overviewTab.milestoneTitle')}
          subtitle={project.milestones.length ? t('features.projects.overviewTab.milestoneCount', { count: project.milestones.length }) : t('features.projects.overviewTab.none')}
          className="pd-side-panel"
          noPadding
        >
          {project.milestones.length === 0 ? (
            <div className="pd-empty pd-empty-pad">{t('features.projects.overviewTab.noMilestones')}</div>
          ) : (
            <div className="pd-side-list">
              {project.milestones.map((milestone, index) => (
                <div key={`${milestone.name}-${index}`} className="pd-side-row">
                  <div className="min-w-0">
                    <div className="pd-side-name truncate">{milestone.name}</div>
                    <div className="pd-side-meta text-mono">{milestone.date || t('features.projects.overviewTab.noDate')}</div>
                  </div>
                  <StatusBadge label={labelOf(MILESTONE_STATUS_LABELS, milestone.status)} status={milestone.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t('features.projects.overviewTab.sprintTitle')}
          subtitle={t('features.projects.overviewTab.sprintCount', { count: project.sprints.length })}
          className="pd-side-panel"
          noPadding
          toolbar={canManageProject ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreatingSprint(true)}>{t('features.projects.overviewTab.newSprint')}</button>
          ) : undefined}
        >
          {project.sprints.length === 0 ? (
            <div className="pd-empty pd-empty-pad">{t('features.projects.overviewTab.noSprints')}</div>
          ) : (
            <div className="pd-side-list">
              {project.sprints.map((sprint) => (
                <div key={sprint.id} className="pd-sprint-row">
                  <SprintBurndownRow sprint={sprint} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {creatingSprint && canManageProject ? (
        <CreateSprintForm
          projectId={projectId}
          onClose={() => setCreatingSprint(false)}
          onCreated={() => {
            setCreatingSprint(false);
            onReload();
          }}
        />
      ) : null}
    </div>
  );
}
