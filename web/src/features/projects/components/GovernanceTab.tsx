import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createProjectDecision,
  createProjectRisk,
  fetchProjectDecisions,
  fetchProjectMembers,
  fetchProjectRisks,
  type CreateProjectDecisionInput,
  type CreateProjectRiskInput,
  type UpdateProjectRiskInput,
  updateProjectRisk,
} from '../api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { ProjectDecision, ProjectMember, ProjectRisk } from '../../../types';

interface GovernanceTabProps {
  projectId: string;
  canManageProject: boolean;
  onProjectReload: () => void;
}

export default function GovernanceTab({ projectId, canManageProject, onProjectReload }: GovernanceTabProps) {
  const { t } = useTranslation();
  const risksAsync = useAsync<ProjectRisk[]>(() => fetchProjectRisks(projectId), [projectId], { cacheKey: 'projects:risks' });
  const decisionsAsync = useAsync<ProjectDecision[]>(() => fetchProjectDecisions(projectId), [projectId], { cacheKey: 'projects:decisions' });
  const membersAsync = useAsync<ProjectMember[]>(() => fetchProjectMembers(projectId), [projectId], { cacheKey: 'projects:members' });
  const [creatingRisk, setCreatingRisk] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null);
  const [creatingDecision, setCreatingDecision] = useState(false);

  function refreshGovernance() {
    void risksAsync.reload();
    void decisionsAsync.reload();
    onProjectReload();
  }

  const risks = risksAsync.data ?? [];
  const decisions = decisionsAsync.data ?? [];
  const openRisks = risks.filter((item) => item.status === 'open' || item.status === 'monitoring').length;
  const highRisks = risks.filter((item) => item.severity === 'high' || item.severity === 'critical').length;

  return (
    <div className="pd-tab pd-gov-tab">
      <section className="pd-gov-summary">
        <div className="pd-gov-stat">
          <span>{t('features.projects.governanceTab.totalRisks')}</span>
          <strong>{risks.length}</strong>
        </div>
        <div className={`pd-gov-stat ${openRisks > 0 ? 'is-risk' : ''}`}>
          <span>{t('features.projects.governanceTab.openRisks')}</span>
          <strong>{openRisks}</strong>
        </div>
        <div className={`pd-gov-stat ${highRisks > 0 ? 'is-warning' : ''}`}>
          <span>{t('features.projects.governanceTab.severeRisks')}</span>
          <strong>{highRisks}</strong>
        </div>
        <div className="pd-gov-stat">
          <span>{t('features.projects.governanceTab.decisions')}</span>
          <strong>{decisions.length}</strong>
        </div>
      </section>

      <div className="pd-gov-grid">
        <Panel
          title={t('features.projects.governanceTab.risksTitle')}
          subtitle={t('features.projects.governanceTab.risksSubtitle')}
          className="pd-gov-panel"
          noPadding
          toolbar={canManageProject ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreatingRisk(true)}>{t('features.projects.governanceTab.addRisk')}</button>
          ) : undefined}
        >
          {risksAsync.loading ? (
            <div className="pd-empty pd-empty-pad">{t('features.projects.governanceTab.loadingRisks')}</div>
          ) : risksAsync.error ? (
            <div className="form-error pd-empty-pad">{risksAsync.error}</div>
          ) : risks.length ? (
            <div className="pd-gov-list">
              {risks.map((risk) => (
                <article key={risk.id} className="pd-gov-item">
                  <div className="pd-gov-item-head">
                    <strong className="truncate" title={risk.title}>{risk.title}</strong>
                    <div className="pd-gov-item-actions">
                      <StatusBadge status={risk.severity} label={`${risk.severity} · ${risk.status}`} />
                      {canManageProject ? (
                        <button className="btn btn-secondary btn-xs" onClick={() => setEditingRisk(risk)}>{t('common.edit')}</button>
                      ) : null}
                    </div>
                  </div>
                  <div className="pd-gov-item-meta">
                    <span>{risk.ownerName || t('features.projects.governanceTab.noOwner')}</span>
                    {risk.dueDate ? <span>{t('features.projects.governanceTab.dueDate', { date: risk.dueDate })}</span> : null}
                  </div>
                  {risk.mitigationPlan ? <p className="pd-gov-item-note">{risk.mitigationPlan}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="pd-empty pd-empty-pad">{t('features.projects.governanceTab.noRisks')}</div>
          )}
        </Panel>

        <Panel
          title={t('features.projects.governanceTab.decisionsTitle')}
          subtitle={t('features.projects.governanceTab.decisionsSubtitle')}
          className="pd-gov-panel"
          noPadding
          toolbar={canManageProject ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreatingDecision(true)}>{t('features.projects.governanceTab.addDecision')}</button>
          ) : undefined}
        >
          {decisionsAsync.loading ? (
            <div className="pd-empty pd-empty-pad">{t('features.projects.governanceTab.loadingDecisions')}</div>
          ) : decisionsAsync.error ? (
            <div className="form-error pd-empty-pad">{decisionsAsync.error}</div>
          ) : decisions.length ? (
            <div className="pd-gov-list">
              {decisions.map((decision) => (
                <article key={decision.id} className="pd-gov-item">
                  <div className="pd-gov-item-head">
                    <strong className="truncate" title={decision.title}>{decision.title}</strong>
                    <StatusBadge status={decision.status} label={decision.status} />
                  </div>
                  <p className="pd-gov-item-note">{decision.decision || decision.context || t('features.projects.governanceTab.noDecisionConclusion')}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="pd-empty pd-empty-pad">{t('features.projects.governanceTab.noDecisions')}</div>
          )}
        </Panel>
      </div>

      {creatingRisk && canManageProject ? (
        <ProjectRiskForm
          projectId={projectId}
          members={membersAsync.data ?? []}
          onClose={() => setCreatingRisk(false)}
          onSaved={() => {
            setCreatingRisk(false);
            refreshGovernance();
          }}
        />
      ) : null}
      {editingRisk && canManageProject ? (
        <ProjectRiskForm
          projectId={projectId}
          risk={editingRisk}
          members={membersAsync.data ?? []}
          onClose={() => setEditingRisk(null)}
          onSaved={() => {
            setEditingRisk(null);
            refreshGovernance();
          }}
        />
      ) : null}
      {creatingDecision && canManageProject ? (
        <ProjectDecisionForm
          projectId={projectId}
          onClose={() => setCreatingDecision(false)}
          onSaved={() => {
            setCreatingDecision(false);
            refreshGovernance();
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectRiskForm({
  projectId,
  risk,
  members,
  onClose,
  onSaved,
}: {
  projectId: string;
  risk?: ProjectRisk;
  members: ProjectMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(risk?.title ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [severity, setSeverity] = useState<ProjectRisk['severity']>(risk?.severity ?? 'medium');
  const [status, setStatus] = useState<ProjectRisk['status']>(risk?.status ?? 'open');
  const [ownerId, setOwnerId] = useState(risk?.ownerId ?? '');
  const [mitigationPlan, setMitigationPlan] = useState(risk?.mitigationPlan ?? '');
  const [dueDate, setDueDate] = useState(risk?.dueDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError(t('features.projects.governanceTab.riskTitleRequired'));
    if ((severity === 'high' || severity === 'critical') && !ownerId) {
      return setFormError(t('features.projects.governanceTab.riskOwnerRequired'));
    }
    const owner = members.find((member) => member.userId === ownerId);
    const input = {
      title: title.trim(),
      description: description.trim(),
      severity,
      status,
      ownerId: ownerId || undefined,
      ownerName: owner?.userName ?? '',
      mitigationPlan: mitigationPlan.trim(),
      dueDate: dueDate || undefined,
    };
    setSubmitting(true);
    try {
      if (risk) await updateProjectRisk(projectId, risk.id, input as UpdateProjectRiskInput);
      else await createProjectRisk(projectId, input as CreateProjectRiskInput);
      onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.projects.governanceTab.riskSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={risk ? t('features.projects.governanceTab.riskFormAriaEdit') : t('features.projects.governanceTab.riskFormAriaAdd')}>
      <Panel title={risk ? t('features.projects.governanceTab.riskFormTitleEdit') : t('features.projects.governanceTab.riskFormTitleAdd')} subtitle={t('features.projects.governanceTab.riskFormSubtitle')}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.riskTitleLabel')}</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.riskDescLabel')}</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.projects.governanceTab.severityLabel')}</label>
            <select className="form-select" value={severity} onChange={(event) => setSeverity(event.target.value as ProjectRisk['severity'])}>
              {['low', 'medium', 'high', 'critical'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.projects.governanceTab.statusLabel')}</label>
            <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value as ProjectRisk['status'])}>
              {['open', 'monitoring', 'mitigated', 'closed'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.projects.governanceTab.ownerLabel')}{severity === 'high' || severity === 'critical' ? t('features.projects.governanceTab.ownerRequiredSuffix') : ''}</label>
            <select className="form-select" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">{t('features.projects.governanceTab.noOwnerSelected')}</option>
              {members.filter((member) => member.userId).map((member) => (
                <option key={member.id} value={member.userId ?? ''}>{member.userName} · {member.role}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.projects.governanceTab.dueDateLabel')}</label>
            <input className="form-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.mitigationLabel')}</label>
          <textarea className="form-textarea" rows={3} value={mitigationPlan} onChange={(event) => setMitigationPlan(event.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? t('features.projects.governanceTab.saving') : t('common.save')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function ProjectDecisionForm({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [decision, setDecision] = useState('');
  const [status, setStatus] = useState<CreateProjectDecisionInput['status']>('proposed');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError(t('features.projects.governanceTab.decisionTitleRequired'));
    setSubmitting(true);
    try {
      await createProjectDecision(projectId, {
        title: title.trim(),
        context: context.trim(),
        decision: decision.trim(),
        status,
      });
      onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.projects.governanceTab.decisionSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={t('features.projects.governanceTab.decisionFormAria')}>
      <Panel title={t('features.projects.governanceTab.decisionFormTitle')} subtitle={t('features.projects.governanceTab.decisionFormSubtitle')}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.decisionTitleLabel')}</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.decisionContextLabel')}</label>
          <textarea className="form-textarea" rows={3} value={context} onChange={(event) => setContext(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.decisionConclusionLabel')}</label>
          <textarea className="form-textarea" rows={3} value={decision} onChange={(event) => setDecision(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('features.projects.governanceTab.decisionStatusLabel')}</label>
          <select
            className="form-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as CreateProjectDecisionInput['status'])}
          >
            {['proposed', 'approved', 'rejected', 'superseded'].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? t('features.projects.governanceTab.saving') : t('features.projects.governanceTab.saveDecision')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
