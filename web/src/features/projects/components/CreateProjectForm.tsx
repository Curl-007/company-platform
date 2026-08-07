import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createProject, type CreateProjectInput } from '../api';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';

export default function CreateProjectForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [objective, setObjective] = useState('');
  const [processMode, setProcessMode] = useState('scrum');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError(t('features.projects.createProjectForm.nameRequired'));
    if (!owner.trim()) return setFormError(t('features.projects.createProjectForm.ownerRequired'));

    setSubmitting(true);
    try {
      const input: CreateProjectInput = { name: name.trim(), owner: owner.trim(), objective: objective.trim() || undefined, processMode };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('project-create'),
          payload,
        };
      }
      await createProject(input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.projects.createProjectForm.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel
        className="project-form-panel"
        title={t('features.projects.createProjectForm.title')}
        subtitle={t('features.projects.createProjectForm.subtitle')}
        footer={(
          <div className="project-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? t('features.projects.createProjectForm.creating') : t('features.projects.createProjectForm.create')}
            </button>
          </div>
        )}
      >
        {formError && <div className="form-error project-form-error">{formError}</div>}

        <div className="project-create-layout">
          <div className="project-form-section">
            <div className="project-form-section-title">{t('features.projects.createProjectForm.basicSection')}</div>
            <div className="form-group">
              <label className="form-label">{t('features.projects.createProjectForm.nameLabel')}</label>
              <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('features.projects.createProjectForm.namePlaceholder')} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('features.projects.createProjectForm.ownerLabel')}</label>
                <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder={t('features.projects.createProjectForm.ownerPlaceholder')} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('features.projects.createProjectForm.processModeLabel')}</label>
                <select className="form-select" value={processMode} onChange={(event) => setProcessMode(event.target.value)}>
                  <option value="scrum">Scrum</option>
                  <option value="kanban">{t('features.projects.createProjectForm.kanbanOption')}</option>
                  <option value="waterfall">{t('features.projects.createProjectForm.waterfallOption')}</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.projects.createProjectForm.objectiveLabel')}</label>
              <textarea className="form-textarea" rows={2} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={t('features.projects.createProjectForm.objectivePlaceholder')} />
            </div>
          </div>

          <div className="project-create-hint">
            <div className="project-create-hint-title">{t('features.projects.createProjectForm.afterCreateHint')}</div>
            <div className="project-create-hint-grid">
              <span>{t('features.projects.createProjectForm.hintSchedule')}</span>
              <span>{t('features.projects.createProjectForm.hintMembers')}</span>
              <span>{t('features.projects.createProjectForm.hintProduct')}</span>
              <span>{t('features.projects.createProjectForm.hintMilestone')}</span>
            </div>
          </div>
        </div>

      </Panel>
    </Overlay>
  );
}
