import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  CheckCircle2,
  ListTree,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { fetchAiBusinessAdvice } from '../../ai/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import type { AiBusinessAdvice, Project, Requirement } from '../../../types';
import {
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import { updateRequirement, updateRequirementStatus } from '../api';

const ASSIGNMENT_STATUS_OPTIONS = [
  { value: 'unassigned', label: 'features.requirements.requirementDetail.assignmentUnassigned' },
  { value: 'assigned', label: 'features.requirements.requirementDetail.assignmentAssigned' },
  { value: 'in_progress', label: 'features.requirements.requirementDetail.assignmentInProgress' },
  { value: 'ready_for_test', label: 'features.requirements.requirementDetail.assignmentReadyForTest' },
  { value: 'verified', label: 'features.requirements.requirementDetail.assignmentVerified' },
];

const EXEC_ROLE_OPTIONS = [
  { value: 'dev', label: 'features.requirements.requirementDetail.roleDev' },
  { value: 'qa', label: 'features.requirements.requirementDetail.roleQa' },
];

interface RequirementDetailProps {
  requirement: Requirement;
  projects: Project[];
  allRequirements: Requirement[];
  canManage: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function AdviceList({ title, items }: { title: string; items?: string[] }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="requirement-ai-advice-block">
      <strong>{title}</strong>
      <ul>{list.map((item) => <li key={`${title}-${item}`}>{item}</li>)}</ul>
    </div>
  );
}

export default function RequirementDetail({
  requirement,
  projects,
  allRequirements,
  onClose,
  onUpdated,
  canManage,
}: RequirementDetailProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(requirement.title);
  const [description, setDescription] = useState(requirement.description ?? '');
  const [priority, setPriority] = useState(requirement.priority);
  const [status, setStatus] = useState(requirement.status);
  const [assignee, setAssignee] = useState(requirement.assignee ?? '');
  const [assigneeRole, setAssigneeRole] = useState(requirement.assigneeRole ?? 'dev');
  const [assignmentStatus, setAssignmentStatus] = useState(
    requirement.assignmentStatus ?? (requirement.assignee ? 'assigned' : 'unassigned'),
  );
  const [completion, setCompletion] = useState(String(requirement.completion ?? 0));
  const [criteria, setCriteria] = useState((requirement.acceptanceCriteria ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiAdvice, setAiAdvice] = useState<AiBusinessAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const projectName = projects.find((item) => item.id === requirement.projectId)?.name ?? requirement.projectId;
  const childCount = allRequirements.filter((item) => item.parentId === requirement.id).length;
  const linkedTaskCount = requirement.linkedTasks?.length ?? 0;
  const completionNum = Math.max(0, Math.min(100, Number(completion) || 0));
  const canUseAi = canOperate(getSessionUser(), 'ai:analyze');
  const assignmentLabel = ASSIGNMENT_STATUS_OPTIONS.find((item) => item.value === assignmentStatus)?.label
    ?? assignmentStatus;

  async function handleSave() {
    if (!canManage) return setFormError(t('features.requirements.requirementDetail.noPermissionUpdate'));
    setSubmitting(true);
    setFormError(null);
    try {
      let version = requirement.version;
      if (status !== requirement.status) {
        const statusUpdated = await updateRequirementStatus(requirement.id, status, version);
        version = statusUpdated.version;
      }
      await updateRequirement(requirement.id, {
        version,
        title: title.trim(),
        description: description.trim(),
        priority,
        assignee: assignee.trim() || null,
        assigneeRole: assignee.trim() ? assigneeRole : null,
        assignmentStatus,
        completion: Number(completion) || 0,
        acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
      });
      onUpdated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.requirements.requirementDetail.updateFailed'));
      setSubmitting(false);
    }
  }

  async function handleAiAdvice() {
    setAiError(null);
    setAiLoading(true);
    try {
      const advice = await fetchAiBusinessAdvice({
        targetType: 'requirement',
        targetId: requirement.id,
        question: t('features.requirements.requirementDetail.aiQuestion'),
        draft: {
          title: title.trim() || requirement.title,
          description: description.trim(),
          status,
          priority,
          assignee: assignee.trim() || null,
          assigneeRole: assignee.trim() ? assigneeRole : null,
          assignmentStatus,
          completion: Number(completion) || 0,
          acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
        },
      });
      setAiAdvice(advice);
    } catch (error) {
      setAiError(error instanceof ApiError ? error.message : t('features.requirements.requirementDetail.aiAnalyzeFailed'));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={760} ariaLabel={t('features.requirements.requirementDetail.ariaLabel', { title: requirement.title })}>
      <Panel
        className="req-detail-panel"
        title={requirement.title}
        subtitle={`${requirement.id} · ${projectName}`}
        toolbar={(
          <div className="req-detail-toolbar">
            {canUseAi ? (
              <button
                className="btn btn-secondary btn-sm btn-with-icon"
                onClick={handleAiAdvice}
                disabled={aiLoading}
              >
                <Sparkles size={14} aria-hidden="true" />
                {aiLoading ? t('features.requirements.requirementDetail.analyzing') : t('common.aiAnalyze')}
              </button>
            ) : null}
            <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label={t('common.close')}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      >
        <div className="req-detail-body">
          <section className="req-detail-summary" aria-label={t('features.requirements.requirementDetail.summaryAriaLabel')}>
            <div className="req-detail-badges">
              <StatusBadge status={priority} label={labelOf(PRIORITY_LABELS, priority)} showDot={false} />
              <StatusBadge status={status} label={labelOf(REQUIREMENT_STATUS_LABELS, status)} />
              <span className="req-detail-chip">{t(assignmentLabel)}</span>
            </div>

            <div className="req-detail-metrics">
              <div className="req-detail-metric">
                <span><UserRound size={13} aria-hidden="true" /> {t('features.requirements.requirementDetail.ownerLabel')}</span>
                <strong>{requirement.owner || t('enums.unset')}</strong>
              </div>
              <div className="req-detail-metric">
                <span><UserRound size={13} aria-hidden="true" /> {t('features.requirements.requirementDetail.assigneeLabel')}</span>
                <strong>
                  {requirement.assignee || t('features.requirements.requirementDetail.unassigned')}
                  {requirement.assigneeRole
                    ? ` · ${labelOf(USER_ROLE_LABELS, requirement.assigneeRole)}`
                    : ''}
                </strong>
              </div>
              <div className="req-detail-metric">
                <span><ListTree size={13} aria-hidden="true" /> {t('features.requirements.requirementDetail.childCountLabel')}</span>
                <strong>{childCount}</strong>
              </div>
              <div className="req-detail-metric">
                <span><CheckCircle2 size={13} aria-hidden="true" /> {t('features.requirements.requirementDetail.linkedTasksLabel')}</span>
                <strong>{linkedTaskCount}</strong>
              </div>
            </div>

            <div className="req-detail-progress">
              <div className="req-detail-progress-head">
                <span>{t('features.requirements.requirementDetail.completionLabel')}</span>
                <strong className="text-mono">{completionNum}%</strong>
              </div>
              <ProgressBar percent={completionNum} height={7} showPercent={false} />
            </div>
          </section>

          {formError ? <div className="form-error req-detail-error">{formError}</div> : null}

          {(aiAdvice || aiLoading || aiError) ? (
            <section className="requirement-ai-advice-panel req-detail-ai">
              <div className="requirement-ai-advice-head">
                <div>
                  <div className="section-title req-ai-title">
                    <Bot size={14} aria-hidden="true" />
                    {aiAdvice?.title || t('features.requirements.requirementDetail.aiTitle')}
                  </div>
                  <div className="body-text">
                    {t('features.requirements.requirementDetail.aiAdviceBasis')}
                    {aiAdvice?.modelUsed ? ` · ${aiAdvice.modelUsed}` : ''}
                    {aiAdvice?.fallback ? t('common.ruleFallback') : ''}
                  </div>
                </div>
                {aiAdvice ? (
                  <button className="btn btn-secondary btn-xs" onClick={handleAiAdvice} disabled={aiLoading}>
                    {t('common.reanalyze')}
                  </button>
                ) : null}
              </div>
              {aiLoading ? <div className="body-text">{t('features.requirements.requirementDetail.aiAnalyzing')}</div> : null}
              {aiError ? <div className="form-error">{aiError}</div> : null}
              {aiAdvice ? (
                <div className="requirement-ai-advice-content">
                  <p>{aiAdvice.summary}</p>
                  <AdviceList title={t('common.risks')} items={aiAdvice.risks} />
                  <AdviceList title={t('common.suggestions')} items={aiAdvice.suggestions} />
                  <AdviceList title={t('common.nextSteps')} items={aiAdvice.nextActions} />
                  <AdviceList title={t('common.missingInfo')} items={aiAdvice.missingInfo} />
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="req-detail-form" aria-label={t('features.requirements.requirementDetail.editAriaLabel')}>
            <div className="form-group">
              <label className="form-label">{t('features.requirements.requirementDetail.titleLabel')}</label>
              <input
                className="form-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!canManage}
              />
            </div>

            <div className="req-form-grid">
              <div className="form-group">
                <label className="form-label">{t('features.requirements.requirementDetail.statusLabel')}</label>
                <select
                  className="form-select"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  disabled={!canManage}
                >
                  {REQUIREMENT_STATUSES.map((item) => (
                    <option key={item} value={item}>{labelOf(REQUIREMENT_STATUS_LABELS, item)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('features.requirements.requirementDetail.priorityLabel')}</label>
                <select
                  className="form-select"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  disabled={!canManage}
                >
                  {REQUIREMENT_PRIORITIES.map((item) => (
                    <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('features.requirements.requirementDetail.assigneeLabel')}</label>
                <input
                  className="form-input"
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  disabled={!canManage}
                  placeholder={t('features.requirements.requirementDetail.assigneePlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('features.requirements.requirementDetail.assigneeRoleLabel')}</label>
                <select
                  className="form-select"
                  value={assigneeRole}
                  onChange={(event) => setAssigneeRole(event.target.value)}
                  disabled={!canManage}
                >
                  {EXEC_ROLE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{t(item.label)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('features.requirements.requirementDetail.assignmentStatusLabel')}</label>
                <select
                  className="form-select"
                  value={assignmentStatus}
                  onChange={(event) => setAssignmentStatus(event.target.value)}
                  disabled={!canManage}
                >
                  {ASSIGNMENT_STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{t(item.label)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('features.requirements.requirementDetail.completionLabel')}</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={100}
                  value={completion}
                  onChange={(event) => setCompletion(event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('features.requirements.requirementDetail.descriptionLabel')}</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canManage}
                placeholder={t('features.requirements.requirementDetail.descriptionPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('features.requirements.requirementDetail.criteriaLabel')}</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={criteria}
                onChange={(event) => setCriteria(event.target.value)}
                disabled={!canManage}
                placeholder={t('features.requirements.requirementDetail.criteriaPlaceholder')}
              />
            </div>
          </section>

          <div className="req-detail-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            {canManage ? (
              <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSave} disabled={submitting}>
                <Save size={14} aria-hidden="true" />
                {submitting ? t('features.requirements.requirementDetail.saving') : t('common.save')}
              </button>
            ) : null}
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
