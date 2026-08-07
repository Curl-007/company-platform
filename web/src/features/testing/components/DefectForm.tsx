import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, X } from 'lucide-react';
import {
  createDefect,
  updateDefect,
  type UpdateDefectInput,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import type { Defect, Project } from '../../../types';
import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

export default function DefectForm({
  mode,
  item,
  onClose,
  onDone,
  canUseAi = false,
}: {
  mode: 'create' | 'edit';
  item?: Defect | null;
  onClose: () => void;
  onDone: () => void;
  canUseAi?: boolean;
}) {
  const { t } = useTranslation();
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const [title, setTitle] = useState(item?.title ?? '');
  const [projectId, setProjectId] = useState(item?.projectId ?? '');
  const [severity, setSeverity] = useState(item?.severity ?? 'medium');
  const [status, setStatus] = useState(item?.status ?? 'new');
  const [assignee, setAssignee] = useState(item?.assignee ?? '');
  const [assigneeRole, setAssigneeRole] = useState(item?.assigneeRole ?? 'dev');
  const [description, setDescription] = useState(item?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) return setFormError(t('features.testing.defectForm.titleRequired'));
    if (!projectId) return setFormError(t('features.testing.defectForm.projectRequired'));
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: UpdateDefectInput & { title: string; projectId?: string; severity: string; assigneeRole: string } = {
        version: item?.version ?? 1,
        title: title.trim(),
        projectId,
        severity,
        status,
        assignee: assignee.trim() || undefined,
        assigneeRole,
        description: description.trim() || undefined,
      };
      if (mode === 'create') await createDefect({ ...payload, projectId });
      else if (item) await updateDefect(item.id, payload);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : (mode === 'create' ? t('features.testing.defectForm.createFailed') : t('features.testing.defectForm.updateFailed')));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={mode === 'create' ? t('features.testing.defectForm.createTitle') : t('features.testing.defectForm.editTitle')}>
      <Panel
        className="qa-form-panel"
        title={mode === 'create' ? t('features.testing.defectForm.createTitle') : t('features.testing.defectForm.editTitle')}
        subtitle={item?.id ?? t('features.testing.defectForm.subtitle')}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="qa-form-body">
          {formError ? <div className="form-error qa-form-error">{formError}</div> : null}

          {canUseAi && item ? (
            <BusinessAdvicePanel
              targetType="defect"
              targetId={item.id}
              title={t('features.testing.defectForm.aiAdviceTitle')}
              description={t('features.testing.defectForm.aiAdviceDesc')}
              buttonText={t('features.testing.defectForm.aiAnalyzeDefect')}
              question={t('features.testing.defectForm.aiAdviceQuestion')}
              draft={() => ({
                title: title.trim(),
                severity,
                status,
                assignee: assignee.trim() || null,
                assigneeRole,
                description: description.trim(),
              })}
            />
          ) : null}

          {mode === 'edit' && item ? (
            <div className="qa-form-summary">
              <StatusBadge status={item.severity} label={labelOf(DEFECT_SEVERITY_LABELS, item.severity)} showDot={false} />
              <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} />
              {item.requirementId ? <span className="qa-form-summary-meta">{t('features.testing.defectForm.relatedRequirement', { id: item.requirementId })}</span> : null}
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label">{t('features.testing.defectForm.titleLabel')}</label>
            <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('features.testing.defectForm.titlePlaceholder')} />
          </div>

          <div className="qa-form-grid">
            <div className="form-group">
              <label className="form-label">{t('features.testing.defectForm.projectLabel')}</label>
              <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t('features.testing.defectForm.selectProject')}</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.testing.defectForm.severityLabel')}</label>
              <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {DEFECT_SEVERITIES.map((value) => (
                  <option key={value} value={value}>{labelOf(DEFECT_SEVERITY_LABELS, value)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.testing.defectForm.assigneeLabel')}</label>
              <input
                className="form-input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder={t('features.testing.defectForm.assigneePlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.testing.defectForm.assigneeRoleLabel')}</label>
              <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
                <option value="dev">{t('features.testing.defectForm.roleDevFix')}</option>
                <option value="qa">{t('features.testing.defectForm.roleQaVerify')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.testing.defectForm.statusLabel')}</label>
              <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {DEFECT_STATUSES.map((value) => (
                  <option key={value} value={value}>{labelOf(DEFECT_STATUS_LABELS, value)}</option>
                ))}
              </select>
            </div>
            <div className="form-group qa-form-spacer" aria-hidden="true" />
          </div>

          <div className="form-group">
            <label className="form-label">{t('features.testing.defectForm.descriptionLabel')}</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('features.testing.defectForm.descriptionPlaceholder')}
            />
          </div>

          <div className="qa-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting}>
              <Save size={14} aria-hidden="true" />
              {submitting ? t('features.testing.defectForm.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
