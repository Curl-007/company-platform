import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTimeEntry, updateTimeEntry } from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import type { Project, TimeEntry } from '../../../types';
import { businessDateKey } from '../../../utils/businessDate';

export default function TimeEntryForm({ entry, onClose, onSaved }: { entry?: TimeEntry; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(entry?.projectId ?? '');
  const [workDate, setWorkDate] = useState(entry?.workDate ?? businessDateKey());
  const [hours, setHours] = useState(entry ? String(entry.hours) : '1');
  const [category, setCategory] = useState<'delivery' | 'support' | 'meeting' | 'training' | 'other'>(
    entry && ['delivery', 'support', 'meeting', 'training', 'other'].includes(entry.category)
      ? entry.category as 'delivery' | 'support' | 'meeting' | 'training' | 'other'
      : 'delivery',
  );
  const [workNature, setWorkNature] = useState<'planned' | 'unplanned'>(entry?.workNature === 'unplanned' ? 'unplanned' : 'planned');
  const createRequest = useRef<{ key: string; payload: string } | null>(null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!projectId || !Number(hours) || Number(hours) <= 0 || Number(hours) > 24) {
      setFormError(t('features.timeEntries.timeEntryForm.validateError'));
      return;
    }
    setSubmitting(true);
    try {
      const input = { projectId, workDate, hours: Number(hours), category, workNature, note: note.trim() };
      if (entry) {
        await updateTimeEntry(entry.id, input);
      } else {
        const payload = JSON.stringify(input);
        if (!createRequest.current || createRequest.current.payload !== payload) {
          createRequest.current = { key: createIdempotencyKey('time-entry-create'), payload };
        }
        await createTimeEntry(input, createRequest.current.key);
      }
      await onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.timeEntries.timeEntryForm.saveFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={entry ? t('features.timeEntries.timeEntryForm.editTitle') : t('features.timeEntries.timeEntryForm.createTitle')} subtitle={t('features.timeEntries.timeEntryForm.subtitle')}>
        <form className="form-stack" onSubmit={handleSubmit}>
          {formError ? <div className="form-error">{formError}</div> : null}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('features.timeEntries.timeEntryForm.dateLabel')}</label>
              <input className="form-input" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.timeEntries.timeEntryForm.hoursLabel')}</label>
              <input className="form-input" type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.timeEntries.timeEntryForm.projectLabel')}</label>
            <select className="form-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{t('features.timeEntries.timeEntryForm.selectProject')}</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.timeEntries.timeEntryForm.categoryLabel')}</label>
            <select className="form-select" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              <option value="delivery">{t('features.timeEntries.timeEntryForm.categoryDelivery')}</option>
              <option value="support">{t('features.timeEntries.timeEntryForm.categorySupport')}</option>
              <option value="meeting">{t('features.timeEntries.timeEntryForm.categoryMeeting')}</option>
              <option value="training">{t('features.timeEntries.timeEntryForm.categoryTraining')}</option>
              <option value="other">{t('features.timeEntries.timeEntryForm.categoryOther')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.timeEntries.timeEntryForm.workNatureLabel')}</label>
            <select className="form-select" value={workNature} onChange={(event) => setWorkNature(event.target.value as typeof workNature)}>
              <option value="planned">{t('features.timeEntries.timeEntryForm.naturePlanned')}</option>
              <option value="unplanned">{t('features.timeEntries.timeEntryForm.natureUnplanned')}</option>
            </select>
            <small className="text-secondary">{t('features.timeEntries.timeEntryForm.natureHint')}</small>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.timeEntries.timeEntryForm.noteLabel')}</label>
            <textarea className="form-textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" disabled={submitting}>{submitting ? t('features.timeEntries.timeEntryForm.saving') : entry ? t('features.timeEntries.timeEntryForm.updateButton') : t('features.timeEntries.timeEntryForm.saveButton')}</button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
