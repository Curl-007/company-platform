import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import type { CapacityMemberOverview, Project, ProjectAllocation, TeamMemberOverview } from '../../../types';
import { upsertProjectAllocation } from '../api';

export default function AllocationForm({
  allocation,
  preferredProjectId,
  periodStart,
  periodEnd,
  members,
  capacityMembers,
  projects,
  onClose,
  onConfigureCapacity,
  onSaved,
}: {
  allocation?: ProjectAllocation | null;
  preferredProjectId?: string;
  periodStart: string;
  periodEnd: string;
  members: TeamMemberOverview[];
  capacityMembers: CapacityMemberOverview[];
  projects: Project[];
  onClose: () => void;
  onConfigureCapacity: (member: CapacityMemberOverview) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(allocation?.userId ?? members[0]?.id ?? '');
  const [projectId, setProjectId] = useState(allocation?.projectId ?? preferredProjectId ?? projects[0]?.id ?? '');
  const [allocationPercent, setAllocationPercent] = useState(allocation ? String(allocation.allocationPercent) : '20');
  const [plannedHours, setPlannedHours] = useState(allocation?.configuredPlannedHours == null ? '' : String(allocation.configuredPlannedHours));
  const [notes, setNotes] = useState(allocation?.notes ?? '');
  const [overloadReason, setOverloadReason] = useState(allocation?.overloadReason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedMember = capacityMembers.find((member) => member.userId === userId);
  const projectedAllocationPercent = (selectedMember?.allocations
    .filter((item) => allocation ? item.id !== allocation.id : item.projectId !== projectId)
    .reduce((sum, item) => sum + item.allocationPercent, 0) ?? 0) + (Number(allocationPercent) || 0);
  const requiresOverride = projectedAllocationPercent > 100;
  const requiresCapacityPlan = Boolean(userId) && !selectedMember?.plan;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (requiresCapacityPlan) {
      setError(t('features.capacity.allocationForm.capacityPlanRequired'));
      return;
    }
    if (requiresOverride && !overloadReason.trim()) {
      setError(t('features.capacity.allocationForm.overrideReasonRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertProjectAllocation({
        userId,
        projectId,
        periodStart,
        periodEnd,
        allocationPercent: Number(allocationPercent),
        plannedHours: plannedHours ? Number(plannedHours) : undefined,
        notes,
        overloadReason: overloadReason.trim() || undefined,
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('features.capacity.allocationForm.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={allocation ? t('features.capacity.allocationForm.editTitle') : t('features.capacity.allocationForm.createTitle')} subtitle={t('features.capacity.allocationForm.subtitle')}>
        <form className="form-stack" onSubmit={submit} style={{ minWidth: 480 }}>
          <label className="form-field"><span>{t('features.capacity.allocationForm.member')}</span><select className="form-select" value={userId} disabled={Boolean(allocation)} onChange={(event) => setUserId(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="form-field"><span>{t('features.capacity.allocationForm.project')}</span><select className="form-select" value={projectId} disabled={Boolean(allocation)} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <div className="form-grid form-grid-2">
            <label className="form-field"><span>{t('features.capacity.allocationForm.allocationPercent')}</span><input className="form-input" type="number" min="0" max="200" value={allocationPercent} onChange={(event) => setAllocationPercent(event.target.value)} /></label>
            <label className="form-field"><span>{t('features.capacity.allocationForm.plannedHours')}</span><input className="form-input" type="number" min="0" value={plannedHours} onChange={(event) => setPlannedHours(event.target.value)} /></label>
          </div>
          <div className={requiresOverride ? 'form-error' : 'text-secondary'}>
            {t('features.capacity.allocationForm.allocationSummary', {
              current: selectedMember?.allocationPercent ?? 0,
              projected: projectedAllocationPercent,
              suffix: requiresOverride ? t('features.capacity.allocationForm.overrideNote') : t('features.capacity.allocationForm.periodEnd'),
            })}
          </div>
          {requiresCapacityPlan && selectedMember ? (
            <div className="form-error">
              {t('features.capacity.allocationForm.noPlanHint')}
              <button className="btn btn-text btn-sm" type="button" onClick={() => onConfigureCapacity(selectedMember)}>{t('features.capacity.allocationForm.configurePlanFirst')}</button>
            </div>
          ) : null}
          {requiresOverride ? <label className="form-field"><span>{t('features.capacity.allocationForm.overloadReason')}</span><textarea className="form-textarea" value={overloadReason} onChange={(event) => setOverloadReason(event.target.value)} placeholder={t('features.capacity.allocationForm.overloadReasonPlaceholder')} /></label> : null}
          <label className="form-field"><span>{t('features.capacity.allocationForm.notes')}</span><textarea className="form-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" type="button" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={saving || !userId || !projectId || requiresCapacityPlan}>{saving ? t('features.capacity.allocationForm.saving') : t('features.capacity.allocationForm.saveAllocation')}</button></div>
        </form>
      </Panel>
    </Overlay>
  );
}
