import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { updateTask } from '../../tasks/api';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';
import type { Task } from '../../../types';
import { TASK_STATUS_LABELS } from '../../../constants/enums';

export default function EditTaskForm({ task, onClose, onUpdated }: { task: Task; onClose: () => void; onUpdated: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task.title);
  const [owner, setOwner] = useState(task.owner ?? '');
  const [status, setStatus] = useState(task.status);
  const [estimatedHours, setEstimatedHours] = useState(String(task.estimatedHours ?? ''));
  const [progress, setProgress] = useState(String(task.progress ?? 0));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError(t('features.projects.editTaskForm.titleRequired'));

    setSubmitting(true);
    try {
      await updateTask(task.id, {
        version: task.version,
        title: title.trim(),
        owner: owner.trim() || undefined,
        status,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        progress: Number(progress),
      });
      onUpdated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.projects.editTaskForm.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.projects.editTaskForm.title')} subtitle={task.wbsCode}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">{t('features.projects.editTaskForm.titleLabel')}</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.projects.editTaskForm.ownerLabel')}</label>
            <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.projects.editTaskForm.statusLabel')}</label>
            <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(TASK_STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>{t(value)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.projects.editTaskForm.estimatedHoursLabel')}</label>
            <input className="form-input" type="number" min={0} value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.projects.editTaskForm.progressLabel')}</label>
            <input className="form-input" type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('features.projects.editTaskForm.saving') : t('common.save')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
