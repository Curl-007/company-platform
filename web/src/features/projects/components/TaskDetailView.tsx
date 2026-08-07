import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import type { Task } from '../../../types';
import { TASK_STATUS_LABELS, labelOf } from '../../../constants/enums';

export default function TaskDetailView({ task, onClose }: { task: Task; onClose: () => void; onUpdated: () => void }) {
  const { t } = useTranslation();
  return (
    <Overlay onClose={onClose}>
      <Panel title={task.title} subtitle={task.wbsCode}>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.codeLabel')}</span>
            <span className="text-mono">{task.wbsCode}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.ownerLabel')}</span>
            <span>{task.owner || '-'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.statusLabel')}</span>
            <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.estimatedHoursLabel')}</span>
            <span>{task.estimatedHours ?? '-'}h</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.remainingHoursLabel')}</span>
            <span>{task.remainingHours ?? 0}h</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.progressLabel')}</span>
            <ProgressBar percent={task.progress ?? 0} height={8} />
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.descriptionLabel')}</span>
            <span>{task.description || t('features.projects.taskDetailView.noDescription')}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.projects.taskDetailView.dueDateLabel')}</span>
            <span>{task.dueDate || '-'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('common.close')}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
