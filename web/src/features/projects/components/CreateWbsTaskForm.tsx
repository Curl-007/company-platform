import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createWbsTask, type CreateWbsTaskInput } from '../../tasks/api';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';

export default function CreateWbsTaskForm({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError(t('features.projects.createWbsTaskForm.titleRequired'));

    setSubmitting(true);
    try {
      const input: CreateWbsTaskInput = {
        title: title.trim(),
        assigneeId: assigneeId.trim() || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('task-create'),
          payload,
        };
      }
      await createWbsTask(projectId, input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.projects.createWbsTaskForm.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.projects.createWbsTaskForm.title')} subtitle={t('features.projects.createWbsTaskForm.subtitle')}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">{t('features.projects.createWbsTaskForm.titleLabel')}</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('features.projects.createWbsTaskForm.titlePlaceholder')} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.projects.createWbsTaskForm.ownerLabel')}</label>
            <input className="form-input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} placeholder={t('features.projects.createWbsTaskForm.ownerPlaceholder')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.projects.createWbsTaskForm.estimatedHoursLabel')}</label>
            <input className="form-input" type="number" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('features.projects.createWbsTaskForm.creating') : t('features.projects.createWbsTaskForm.create')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
