import { useTranslation } from 'react-i18next';
import type { Project } from '../../../types';
import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITIES,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  labelOf,
} from '../../../constants/enums';
import {
  aiActionDraftFormState,
  aiActionIdPlaceholder,
  aiActionStatusOptions,
  type AiActionDraft,
  type AiActionDraftField,
} from '../aiActionDraftModel';

export interface AiActionDraftFormProps {
  actionType: string;
  actionLabel: string;
  draft: AiActionDraft;
  liveProjects: Project[];
  canWrite: boolean;
  submitting: boolean;
  error: string | null;
  onChange: (field: AiActionDraftField, value: string) => void;
  onObjectiveChange: (value: string) => void;
  onExecute: () => Promise<void>;
}

export default function AiActionDraftForm({
  actionType,
  actionLabel,
  draft,
  liveProjects,
  canWrite,
  submitting,
  error,
  onChange,
  onObjectiveChange,
  onExecute,
}: AiActionDraftFormProps) {
  const { t } = useTranslation();
  const form = aiActionDraftFormState(actionType);
  const disabled = !canWrite || submitting;
  const statusOptions = aiActionStatusOptions(actionType);

  return (
    <div className={`ai-action-card ${form.isDelete ? 'ai-action-card-danger' : ''}`}>
      <div className="ai-action-card-title">{t('features.ai.aiActionDraftCard.confirmTitle', { label: actionLabel })}</div>
      <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        {t('features.ai.aiActionDraftCard.draftOnlyHint')}
      </div>
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}

      {form.showTargetId ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.targetId')}</label>
          <input
            className="form-input"
            value={draft.resourceId}
            onChange={(event) => onChange('resourceId', event.target.value)}
            placeholder={aiActionIdPlaceholder(actionType)}
            disabled={disabled}
          />
        </div>
      ) : null}

      {form.showTitle ? (
        <div className="form-group">
          <label className="form-label">
            {form.isWorkLog ? t('features.ai.aiActionDraftCard.summaryOrTitle') : t('features.ai.aiActionDraftCard.titleOrName')}
          </label>
          <input className="form-input" value={draft.title} onChange={(event) => onChange('title', event.target.value)} disabled={disabled} />
        </div>
      ) : null}

      {form.showProject ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.project')}</label>
          <select className="form-select" value={draft.projectId} onChange={(event) => onChange('projectId', event.target.value)} disabled={disabled}>
            <option value="">{t('features.ai.aiActionDraftCard.selectProject')}</option>
            {liveProjects.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
          </select>
        </div>
      ) : null}

      {form.showReleaseReferences ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.productIdOptional')}</label>
            <input className="form-input" value={draft.productId} onChange={(event) => onChange('productId', event.target.value)} disabled={disabled} placeholder="PROD-xxx" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.buildIdOptional')}</label>
            <input className="form-input" value={draft.buildId} onChange={(event) => onChange('buildId', event.target.value)} disabled={disabled} placeholder="BLD-xxx" />
          </div>
        </div>
      ) : null}

      {form.showStatus ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.targetStatus')}</label>
          {statusOptions.length ? (
            <select className="form-select" value={draft.status} onChange={(event) => onChange('status', event.target.value)} disabled={disabled}>
              <option value="">{t('features.ai.aiActionDraftCard.selectPlaceholder')}</option>
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.labelKey ? t(item.labelKey) : item.value}</option>
              ))}
            </select>
          ) : (
            <input className="form-input" value={draft.status} onChange={(event) => onChange('status', event.target.value)} disabled={disabled} />
          )}
        </div>
      ) : null}

      {form.showRequirementDetails ? (
        <>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.priority')}</label>
            <select className="form-select" value={draft.priority} onChange={(event) => onChange('priority', event.target.value)} disabled={disabled}>
              {REQUIREMENT_PRIORITIES.map((item) => <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.description')}</label>
            <textarea className="form-textarea" rows={3} value={draft.description} onChange={(event) => onChange('description', event.target.value)} disabled={disabled} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.acceptanceCriteriaOnePerLine')}</label>
            <textarea className="form-textarea" rows={2} value={draft.criteria} onChange={(event) => onChange('criteria', event.target.value)} disabled={disabled} />
          </div>
        </>
      ) : null}

      {form.showDefectOrRiskDetails ? (
        <>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.severity')}</label>
            <select className="form-select" value={draft.severity} onChange={(event) => onChange('severity', event.target.value)} disabled={disabled}>
              {DEFECT_SEVERITIES.map((item) => <option key={item} value={item}>{labelOf(DEFECT_SEVERITY_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.description')}</label>
            <textarea className="form-textarea" rows={3} value={draft.description} onChange={(event) => onChange('description', event.target.value)} disabled={disabled} />
          </div>
        </>
      ) : null}

      {form.showTaskDetails ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.taskType')}</label>
            <select className="form-select" value={draft.taskType} onChange={(event) => onChange('taskType', event.target.value)} disabled={disabled}>
              {TASK_TYPES.map((item) => <option key={item} value={item}>{labelOf(TASK_TYPE_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.estimatedHours')}</label>
            <input className="form-input" value={draft.estimatedHours} onChange={(event) => onChange('estimatedHours', event.target.value)} disabled={disabled} />
          </div>
        </div>
      ) : null}

      {form.showVersion ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.version')}</label>
          <input className="form-input" value={draft.version} onChange={(event) => onChange('version', event.target.value)} disabled={disabled} placeholder="1.0.0" />
        </div>
      ) : null}

      {form.showOwner ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.owner')}</label>
          <input className="form-input" value={draft.owner} onChange={(event) => onChange('owner', event.target.value)} disabled={disabled} />
        </div>
      ) : null}

      {form.showObjective ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.objectiveOrNotes')}</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={draft.objective || draft.description}
            onChange={(event) => onObjectiveChange(event.target.value)}
            disabled={disabled}
          />
        </div>
      ) : null}

      {form.showContent ? (
        <div className="form-group">
          <label className="form-label">
            {actionType === 'create_work_log' ? t('features.ai.aiActionDraftCard.workLogContent') : t('features.ai.aiActionDraftCard.documentBody')}
          </label>
          <textarea className="form-textarea" rows={4} value={draft.content} onChange={(event) => onChange('content', event.target.value)} disabled={disabled} />
        </div>
      ) : null}

      {form.showTimeEntry ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.hours')}</label>
            <input className="form-input" value={draft.hours} onChange={(event) => onChange('hours', event.target.value)} disabled={disabled} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.date')}</label>
            <input className="form-input" type="date" value={draft.workDate} onChange={(event) => onChange('workDate', event.target.value)} disabled={disabled} />
          </div>
        </div>
      ) : null}

      {form.showAssignee ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.assignee')}</label>
            <input className="form-input" value={draft.assignee} onChange={(event) => onChange('assignee', event.target.value)} disabled={disabled} />
          </div>
          {!actionType.includes('task') ? (
            <div className="form-group">
              <label className="form-label">{t('features.ai.aiActionDraftCard.role')}</label>
              <select className="form-select" value={draft.assigneeRole} onChange={(event) => onChange('assigneeRole', event.target.value)} disabled={disabled || !draft.assignee.trim()}>
                <option value="dev">{t('features.ai.aiActionDraftCard.roleDev')}</option>
                <option value="qa">{t('features.ai.aiActionDraftCard.roleQa')}</option>
              </select>
            </div>
          ) : <div />}
        </div>
      ) : null}

      {form.isDelete ? <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>{t('features.ai.aiActionDraftCard.deleteIrreversibleHint')}</div> : null}

      <div className="ai-action-card-toolbar">
        <button type="button" className={`btn btn-sm ${form.isDelete ? 'btn-danger' : 'btn-primary'}`} onClick={() => { void onExecute(); }} disabled={disabled}>
          {submitting ? t('features.ai.aiActionDraftCard.executing') : form.isDelete ? t('features.ai.aiActionDraftCard.confirmDelete') : t('features.ai.aiActionDraftCard.confirmExecute')}
        </button>
        {!canWrite ? <span className="text-secondary" style={{ fontSize: 12 }}>{t('features.ai.aiActionDraftCard.roleNoWritePermission')}</span> : null}
      </div>
    </div>
  );
}
