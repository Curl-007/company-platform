import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import type { Task } from '../../../types';
import { TASK_STATUS_LABELS, labelOf } from '../../../constants/enums';

export default function TaskDetailView({ task, onClose }: { task: Task; onClose: () => void; onUpdated: () => void }) {
  const { t } = useTranslation();

  const metaFields: Array<{ label: string; value: React.ReactNode; wide?: boolean }> = [
    { label: t('features.projects.taskDetailView.codeLabel'), value: <span className="text-mono">{task.wbsCode}</span> },
    { label: t('features.projects.taskDetailView.ownerLabel'), value: task.owner || '-' },
    {
      label: t('features.projects.taskDetailView.statusLabel'),
      value: <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
    },
    { label: t('features.projects.taskDetailView.estimatedHoursLabel'), value: `${task.estimatedHours ?? '-'}h` },
    { label: t('features.projects.taskDetailView.remainingHoursLabel'), value: `${task.remainingHours ?? 0}h` },
    { label: t('features.projects.taskDetailView.dueDateLabel'), value: task.dueDate || '-' },
    {
      label: t('features.projects.taskDetailView.progressLabel'),
      value: (
        <div className="flex min-w-0 items-center gap-2">
          <ProgressBar percent={task.progress ?? 0} height={8} className="min-w-0 flex-1" />
          <span className="text-mono">{task.progress ?? 0}%</span>
        </div>
      ),
      wide: true,
    },
    {
      label: t('features.projects.taskDetailView.descriptionLabel'),
      value: task.description || t('features.projects.taskDetailView.noDescription'),
      wide: true,
    },
  ];

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={task.title}>
      <Panel
        title={task.title}
        subtitle={task.wbsCode}
        toolbar={
          <button
            type="button"
            className="topbar-icon-button"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        }
      >
        <div className="detail-grid">
          {metaFields.map((field) => (
            <div
              key={field.label}
              className="detail-field"
              style={field.wide ? { gridColumn: '1 / -1' } : undefined}
            >
              <span className="detail-label">{field.label}</span>
              {field.value}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-4">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('common.close')}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
