import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProposedAction, Project } from '../../../types';
import { PRIORITY_LABELS, REQUIREMENT_PRIORITIES, labelOf } from '../../../constants/enums';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import { createRequirement } from '../../requirements/api';
import { navigateTo } from '../../team/components/teamMeta';

export default function AiRequirementDraftCard({
  action,
  projects,
  canCreate,
  onCreated,
}: {
  action: AiProposedAction;
  projects: Project[];
  canCreate: boolean;
  onCreated?: (requirementId: string) => void;
}) {
  const { t } = useTranslation();
  const liveProjects = useMemo(
    () => projects.filter((item) => !['archived', 'done'].includes(String(item.status || ''))),
    [projects],
  );
  const [title, setTitle] = useState(action.title || '');
  const [projectId, setProjectId] = useState(action.projectId || liveProjects[0]?.id || '');
  const [priority, setPriority] = useState(action.priority || 'medium');
  const [description, setDescription] = useState(action.description || '');
  const [criteria, setCriteria] = useState((action.acceptanceCriteria || []).join('\n'));
  const [assignee, setAssignee] = useState(action.assignee || '');
  const [assigneeRole, setAssigneeRole] = useState(action.assigneeRole || 'dev');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    setTitle(action.title || '');
    setProjectId(action.projectId || liveProjects[0]?.id || '');
    setPriority(action.priority || 'medium');
    setDescription(action.description || '');
    setCriteria((action.acceptanceCriteria || []).join('\n'));
    setAssignee(action.assignee || '');
    setAssigneeRole(action.assigneeRole || 'dev');
    setCreatedId(null);
    setError(null);
  }, [action, liveProjects]);

  async function handleCreate() {
    if (!canCreate) {
      setError(t('features.ai.aiRequirementDraftCard.noPermissionCreateRequirement'));
      return;
    }
    if (!title.trim()) {
      setError(t('features.ai.aiRequirementDraftCard.titleRequired'));
      return;
    }
    if (!projectId) {
      setError(t('features.ai.aiRequirementDraftCard.projectRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createRequirement(
        {
          title: title.trim(),
          projectId,
          priority: String(priority || 'medium'),
          description: description.trim() || undefined,
          acceptanceCriteria: criteria
            .split(/\n+/)
            .map((item) => item.trim())
            .filter(Boolean),
          assignee: assignee.trim() || undefined,
          assigneeRole: assignee.trim() ? assigneeRole : undefined,
        },
        createIdempotencyKey('ai-chat-requirement'),
      );
      setCreatedId(created.id);
      onCreated?.(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('features.ai.aiRequirementDraftCard.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (createdId) {
    return (
      <div className="ai-action-card ai-action-card-success">
        <div className="ai-action-card-title">{t('features.ai.aiRequirementDraftCard.requirementCreated')}</div>
        <div className="body-text">
          {t('features.ai.aiRequirementDraftCard.writtenViaApi')}：<span className="text-mono">{createdId}</span>
        </div>
        <div className="ai-action-card-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateTo('requirements', { focus: createdId })}>
            {t('features.ai.aiRequirementDraftCard.openRequirementDetail')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-action-card">
      <div className="ai-action-card-title">{t('features.ai.aiRequirementDraftCard.draftTitle')}</div>
      <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        {t('features.ai.aiRequirementDraftCard.draftHint')}
      </div>
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}
      <div className="form-group">
        <label className="form-label">{t('features.ai.aiRequirementDraftCard.title')}</label>
        <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canCreate || submitting} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiRequirementDraftCard.project')}</label>
          <select className="form-select" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!canCreate || submitting}>
            <option value="">{t('features.ai.aiRequirementDraftCard.selectProject')}</option>
            {liveProjects.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiRequirementDraftCard.priority')}</label>
          <select className="form-select" value={priority} onChange={(event) => setPriority(event.target.value)} disabled={!canCreate || submitting}>
            {REQUIREMENT_PRIORITIES.map((item) => (
              <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">{t('features.ai.aiRequirementDraftCard.description')}</label>
        <textarea className="form-textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canCreate || submitting} />
      </div>
      <div className="form-group">
        <label className="form-label">{t('features.ai.aiRequirementDraftCard.criteriaOnePerLine')}</label>
        <textarea className="form-textarea" rows={3} value={criteria} onChange={(event) => setCriteria(event.target.value)} disabled={!canCreate || submitting} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiRequirementDraftCard.assigneeOptional')}</label>
          <input className="form-input" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!canCreate || submitting} placeholder={t('features.ai.aiRequirementDraftCard.assigneePlaceholder')} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiRequirementDraftCard.assigneeRole')}</label>
          <select className="form-select" value={assigneeRole} onChange={(event) => setAssigneeRole(event.target.value)} disabled={!canCreate || submitting || !assignee.trim()}>
            <option value="dev">{t('features.ai.aiRequirementDraftCard.roleDev')}</option>
            <option value="qa">{t('features.ai.aiRequirementDraftCard.roleQa')}</option>
          </select>
        </div>
      </div>
      <div className="ai-action-card-toolbar">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { void handleCreate(); }} disabled={!canCreate || submitting}>
          {submitting ? t('features.ai.aiRequirementDraftCard.creating') : t('features.ai.aiRequirementDraftCard.confirmCreate')}
        </button>
        {!canCreate ? <span className="text-secondary" style={{ fontSize: 12 }}>{t('features.ai.aiRequirementDraftCard.readOnlyHint')}</span> : null}
      </div>
    </div>
  );
}
