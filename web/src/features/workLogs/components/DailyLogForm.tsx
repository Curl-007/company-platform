import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import type { Project } from '../../../types';
import { createWorkLog } from '../api';
import { businessDateKey } from '../../../utils/businessDate';

export default function DailyLogForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState('');
  const [content, setContent] = useState('');
  const [blockers, setBlockers] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [logDate, setLogDate] = useState(businessDateKey());
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const selectedProject = useMemo(
    () => (projects ?? []).find((item) => item.id === projectId) ?? null,
    [projectId, projects],
  );

  async function handleSubmit() {
    setFormError(null);
    if (!content.trim() && !file) {
      setFormError(t('features.workLogs.dailyLogForm.contentRequired'));
      return;
    }

    setSubmitting(true);
    try {
      let contentBase64: string | undefined;
      if (file) {
        contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error(t('features.workLogs.dailyLogForm.fileReadFailed')));
          reader.readAsDataURL(file);
        });
      }
      const input = {
        projectId: projectId || undefined,
        project: selectedProject?.name || '',
        content: content.trim(),
        blockers: blockers.trim(),
        nextPlan: nextPlan.trim(),
        logDate,
        fileName: file?.name,
        fileType: file?.type || file?.name.split('.').pop() || '',
        contentBase64,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = { key: createIdempotencyKey('work-log-create'), payload };
      }
      await createWorkLog(input, createRequest.current.key);
      await onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.workLogs.dailyLogForm.submitFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.workLogs.dailyLogForm.title')} subtitle={t('features.workLogs.dailyLogForm.subtitle')}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.workLogs.dailyLogForm.date')}</label>
            <input className="form-input" type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.workLogs.dailyLogForm.project')}</label>
            <select className="form-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{t('features.workLogs.dailyLogForm.unboundProject')}</option>
              {(projects ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.workLogs.dailyLogForm.content')}</label>
          <textarea className="form-textarea" rows={6} value={content} onChange={(event) => setContent(event.target.value)} placeholder={t('features.workLogs.dailyLogForm.contentPlaceholder')} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.workLogs.dailyLogForm.blockers')}</label>
          <textarea className="form-textarea" rows={3} value={blockers} onChange={(event) => setBlockers(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.workLogs.dailyLogForm.nextPlan')}</label>
          <textarea className="form-textarea" rows={3} value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.workLogs.dailyLogForm.file')}</label>
          <input className="form-input" type="file" accept=".md,.txt,.doc,.docx,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? t('features.workLogs.dailyLogForm.submitting') : t('features.workLogs.dailyLogForm.submit')}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
