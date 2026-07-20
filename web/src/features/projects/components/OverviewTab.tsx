import { useState } from 'react';
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
  const [creatingSprint, setCreatingSprint] = useState(false);
  const {
    data: delivery,
    loading: deliveryLoading,
    error: deliveryError,
    reload: reloadDelivery,
  } = useAsync<ProjectDeliveryData>(() => fetchProjectDeliveryData(project), [project.id, project.productId ?? '']);

  return (
    <div className="project-overview-stack">
      <ProjectDeliveryPanel
        project={project}
        data={delivery}
        loading={deliveryLoading}
        error={deliveryError}
        onRetry={reloadDelivery}
      />

      <div className="grid-2">
        <Panel title="里程碑" subtitle={project.milestones.length ? `共 ${project.milestones.length} 个` : '暂无里程碑'}>
          {project.milestones.length === 0 ? (
            <div className="text-secondary">暂未定义里程碑。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.milestones.map((milestone, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="font-medium">{milestone.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-secondary text-mono">{milestone.date}</span>
                    <StatusBadge label={labelOf(MILESTONE_STATUS_LABELS, milestone.status)} status={milestone.status} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="迭代"
          subtitle={`${project.sprints.length} 个迭代`}
          toolbar={canManageProject ? <button className="btn btn-primary btn-sm" onClick={() => setCreatingSprint(true)}>新建迭代</button> : undefined}
        >
          {project.sprints.length === 0 ? (
            <div className="text-secondary">该项目暂无迭代。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.sprints.map((sprint) => (
                <SprintBurndownRow key={sprint.id} sprint={sprint} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {creatingSprint && canManageProject && (
        <CreateSprintForm
          projectId={projectId}
          onClose={() => setCreatingSprint(false)}
          onCreated={() => {
            setCreatingSprint(false);
            onReload();
          }}
        />
      )}
    </div>
  );
}
