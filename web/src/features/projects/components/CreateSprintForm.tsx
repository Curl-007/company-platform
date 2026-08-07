import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createSprint, type CreateSprintInput } from '../../tasks/api';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';

export default function CreateSprintForm({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError(t('features.projects.createSprintForm.nameRequired'));

    setSubmitting(true);
    try {
      const input: CreateSprintInput = {
        name: name.trim(),
        goal: goal.trim() || undefined,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('sprint-create'),
          payload,
        };
      }
      await createSprint(projectId, input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.projects.createSprintForm.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.projects.createSprintForm.title')} subtitle={t('features.projects.createSprintForm.subtitle')}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">{t('features.projects.createSprintForm.nameLabel')}</label>
          <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('features.projects.createSprintForm.namePlaceholder')} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.projects.createSprintForm.goalLabel')}</label>
          <input className="form-input" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder={t('features.projects.createSprintForm.goalPlaceholder')} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('features.projects.createSprintForm.creating') : t('features.projects.createSprintForm.create')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
