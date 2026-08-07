import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarDays, Plus, RefreshCw, Users } from 'lucide-react';
import PageState from '../../../components/common/PageState';
import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import StatusBadge from '../../../components/common/StatusBadge';
import { useAsync } from '../../../hooks/useAsync';
import {
  approveProjectAllocation,
  deleteProjectAllocation,
  fetchCapacityOverview,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { fetchTeamMembers } from '../../team/api';
import { ApiError } from '../../../services/api';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { CapacityMemberOverview, Project, ProjectAllocation, SessionUser, TeamMemberOverview } from '../../../types';
import { canOperate } from '../../../constants/roles';
import { currentWeek, percentage, RISK_VARIANT, weekRange } from './capacityHelpers';
import CapacityPlanForm from './CapacityPlanForm';
import AllocationForm from './AllocationForm';
import WorkCalendarOverlay from './WorkCalendarOverlay';
import WorkloadThresholdsOverlay from './WorkloadThresholdsOverlay';

export default function CapacityView({ user }: { user?: SessionUser | null }) {
  const { t } = useTranslation();
  const routeParams = useMemo(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''), []);
  const initialPeriod = useMemo(() => {
    const fallback = currentWeek();
    const periodStart = routeParams.get('periodStart') ?? fallback.periodStart;
    const periodEnd = routeParams.get('periodEnd') ?? fallback.periodEnd;
    return /^\d{4}-\d{2}-\d{2}$/.test(periodStart) && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
      ? { periodStart, periodEnd }
      : fallback;
  }, [routeParams]);
  const requestedProjectId = routeParams.get('projectId') ?? '';
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [editingMember, setEditingMember] = useState<CapacityMemberOverview | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<ProjectAllocation | null>(null);
  const [editingCalendar, setEditingCalendar] = useState(false);
  const [approvingAllocationId, setApprovingAllocationId] = useState<string | null>(null);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [handledProjectRequest, setHandledProjectRequest] = useState(!requestedProjectId);
  const toast = useToast();
  const confirm = useConfirm();
  const canManageProjectAllocations = canOperate(user, 'projects:manage');
  const overviewAsync = useAsync(
    () => fetchCapacityOverview({ periodStart, periodEnd }),
    [periodStart, periodEnd],
    { cacheKey: 'capacity:overview' },
  );
  const membersAsync = useAsync<TeamMemberOverview[]>(fetchTeamMembers, [], { cacheKey: 'team:members' });
  const projectsAsync = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const overview = overviewAsync.data;

  useEffect(() => {
    if (handledProjectRequest || !requestedProjectId || projectsAsync.loading) return;
    setHandledProjectRequest(true);
    if ((projectsAsync.data ?? []).some((project) => project.id === requestedProjectId) && canManageProjectAllocations) {
      setEditingAllocation(null);
      setAllocating(true);
    }
  }, [canManageProjectAllocations, handledProjectRequest, projectsAsync.data, projectsAsync.loading, requestedProjectId]);

  if (overviewAsync.loading || overviewAsync.error || !overview) {
    return <PageState loading={overviewAsync.loading} error={overviewAsync.error} isEmpty={!overviewAsync.loading && !overviewAsync.error && !overview} onRetry={overviewAsync.reload} />;
  }

  const { summary } = overview;
  async function approveOverride(id: string) {
    setApprovingAllocationId(id);
    try {
      await approveProjectAllocation(id);
      overviewAsync.reload();
      toast.success(t('features.capacity.capacityView.overrideApproved'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.capacity.capacityView.approveOverrideFailed'));
    } finally {
      setApprovingAllocationId(null);
    }
  }
  async function removeAllocation(id: string, projectName: string, allocationPercent: number) {
    const confirmed = await confirm({
      title: t('features.capacity.capacityView.deleteAllocationTitle'),
      description: t('features.capacity.capacityView.deleteAllocationDesc', { projectName, percent: allocationPercent }),
      confirmText: t('features.capacity.capacityView.deleteAllocation'),
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      await deleteProjectAllocation(id);
      await overviewAsync.reload();
      toast.success(t('features.capacity.capacityView.allocationDeleted'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.capacity.capacityView.deleteAllocationFailed'));
    }
  }
  return (
    <div className="page capacity-page">
      <div className="page-inline-actions mb-4 flex flex-wrap justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={overviewAsync.reload}><RefreshCw size={15} /> {t('features.capacity.capacityView.refresh')}</button>
        {user?.role === 'admin' ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingThresholds(true)}>{t('features.capacity.capacityView.riskThresholds')}</button> : null}
        <button className="btn btn-secondary btn-sm" onClick={() => setEditingCalendar(true)}>{t('features.capacity.capacityView.workCalendar')}</button>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingAllocation(null); setAllocating(true); }}><Plus size={15} /> {t('features.capacity.capacityView.allocateProjectInput')}</button>
      </div>

      <Panel title={t('features.capacity.capacityView.planningPeriod')} icon={<CalendarDays size={18} />}>
        <div className="flex gap-3" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="form-field"><span>{t('features.capacity.capacityView.startDate')}</span><input className="form-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label className="form-field"><span>{t('features.capacity.capacityView.endDate')}</span><input className="form-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { const period = weekRange(); setPeriodStart(period.periodStart); setPeriodEnd(period.periodEnd); }}>{t('features.capacity.capacityView.thisWeek')}</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { const period = weekRange(1); setPeriodStart(period.periodStart); setPeriodEnd(period.periodEnd); }}>{t('features.capacity.capacityView.nextWeek')}</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { const period = weekRange(1, 2); setPeriodStart(period.periodStart); setPeriodEnd(period.periodEnd); }}>{t('features.capacity.capacityView.nextTwoWeeks')}</button>
          </div>
          <span className="text-secondary">{t('features.capacity.capacityView.effectiveCapacityHint')}</span>
        </div>
      </Panel>

      <div className="metric-grid" style={{ marginTop: 16 }}>
        <Panel title={t('features.capacity.capacityView.teamMembers')} icon={<Users size={18} />}><strong className="metric-value">{summary.memberCount}</strong><div className="text-secondary">{t('features.capacity.capacityView.configuredCount', { count: summary.configuredCount })}</div></Panel>
        <Panel title={t('features.capacity.capacityView.effectiveCapacity')}><strong className="metric-value">{summary.totalEffectiveHours.toFixed(1)}h</strong><div className="text-secondary">{t('features.capacity.capacityView.effectiveCapacityHint2')}</div></Panel>
        <Panel title={t('features.capacity.capacityView.plannedInput')}><strong className="metric-value">{summary.totalPlannedHours.toFixed(1)}h</strong><div className="text-secondary">{t('features.capacity.capacityView.plannedInputHint')}</div></Panel>
        <Panel title={t('features.capacity.capacityView.actualInput')}><strong className="metric-value">{summary.totalActualHours.toFixed(1)}h</strong><div className="text-secondary">{t('features.capacity.capacityView.actualInputHint')}</div></Panel>
        <Panel title={t('features.capacity.capacityView.unplannedWork')}><strong className="metric-value">{summary.totalUnplannedActualHours.toFixed(1)}h</strong><div className="text-secondary">{t('features.capacity.capacityView.classifiedHours', { hours: summary.totalClassifiedActualHours.toFixed(1) })}</div></Panel>
        <Panel title={t('features.capacity.capacityView.resourceRisk')} icon={<AlertTriangle size={18} />}><strong className="metric-value">{summary.overloadedCount + summary.attentionCount}</strong><div className="text-secondary">{t('features.capacity.capacityView.riskHint', { overloaded: summary.overloadedCount, attention: summary.attentionCount, fragmentation: summary.highFragmentationCount, pending: summary.pendingOverrideCount })}</div></Panel>
      </div>

      <Panel title={t('features.capacity.capacityView.memberLoad')} subtitle={t('features.capacity.capacityView.thresholdsSubtitle', { balanced: Math.round(overview.thresholds.balancedMin * 100), attention: Math.round(overview.thresholds.attentionMin * 100), overloaded: Math.round(overview.thresholds.overloadedAbove * 100) })} style={{ marginTop: 16 }}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('features.capacity.capacityView.member')}</th><th>{t('features.capacity.capacityView.role')}</th><th>{t('features.capacity.capacityView.effectiveCapacity')}</th><th>{t('features.capacity.capacityView.plannedInput')}</th><th>{t('features.capacity.capacityView.actualInput')}</th><th>{t('features.capacity.capacityView.unplannedWork')}</th><th>{t('features.capacity.capacityView.currentWip')}</th><th>{t('features.capacity.capacityView.fragmentation')}</th><th>{t('features.capacity.capacityView.loadRatio')}</th><th>{t('features.capacity.capacityView.projectAllocations')}</th><th>{t('features.capacity.capacityView.risk')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
          {overview.members.map((member) => {
            const loadPercent = member.loadRatio === null ? 0 : Math.min(100, Math.round(member.loadRatio * 100));
            return <tr key={member.userId}><td>{member.userName}</td><td>{member.role}</td><td>{member.effectiveHours.toFixed(1)}h</td><td>{member.plannedHours.toFixed(1)}h</td><td>{member.actualHours.toFixed(1)}h</td><td>{member.unplannedActualHours.toFixed(1)}h <span className="text-secondary">{member.unplannedRatio === null ? t('features.capacity.capacityView.unclassified') : t('features.capacity.capacityView.ratioValue', { percent: Math.round(member.unplannedRatio * 100) })}</span></td><td>{member.currentWipCount}</td><td>{member.projectFragmentationCount} {member.fragmentationRisk ? <span className="text-danger">{t('features.capacity.capacityView.attention')}</span> : null}</td><td style={{ minWidth: 140 }}><ProgressBar percent={loadPercent} height={6} /><span className="text-secondary">{percentage(member.loadRatio)}</span></td><td>{member.allocations.length ? member.allocations.map((item) => <div key={item.id}>{item.projectName} {item.allocationPercent}%{item.approvalStatus === 'pending' ? <span className="text-danger"> · {t('features.capacity.capacityView.pendingOverride')}</span> : null}{item.overloadReason ? <small className="text-secondary"> · {item.overloadReason}</small> : null}{user?.role === 'admin' && item.approvalStatus === 'pending' && item.updatedBy !== user.id ? <button className="btn btn-text btn-sm" disabled={approvingAllocationId === item.id} onClick={() => approveOverride(item.id)}>{t('features.capacity.capacityView.approve')}</button> : null}{user?.role === 'admin' && item.approvalStatus === 'pending' && item.updatedBy === user.id ? <small className="text-secondary"> · {t('features.capacity.capacityView.cannotSelfApprove')}</small> : null}{canManageProjectAllocations ? <button className="btn btn-text btn-sm" onClick={() => { setEditingAllocation(item); setAllocating(true); }}>{t('common.edit')}</button> : null}{canManageProjectAllocations ? <button className="btn btn-text btn-sm" onClick={() => void removeAllocation(item.id, item.projectName, item.allocationPercent)}>{t('common.delete')}</button> : null}</div>) : t('features.capacity.capacityView.noAllocations')}</td><td><StatusBadge label={member.risk.label} variant={RISK_VARIANT[member.risk.code]} /></td><td><button className="btn btn-text btn-sm" onClick={() => setEditingMember(member)}>{t('features.capacity.capacityView.configureCapacity')}</button></td></tr>;
          })}
        </tbody></table></div>
      </Panel>

      {editingMember ? <CapacityPlanForm member={editingMember} periodStart={periodStart} periodEnd={periodEnd} onClose={() => setEditingMember(null)} onSaved={() => { setEditingMember(null); overviewAsync.reload(); toast.success(t('features.capacity.capacityView.capacityPlanSaved')); }} /> : null}
      {allocating ? <AllocationForm allocation={editingAllocation ?? undefined} preferredProjectId={requestedProjectId || undefined} periodStart={periodStart} periodEnd={periodEnd} members={membersAsync.data ?? []} capacityMembers={overview.members} projects={projectsAsync.data ?? []} onClose={() => { setAllocating(false); setEditingAllocation(null); }} onConfigureCapacity={(member) => { setAllocating(false); setEditingAllocation(null); setEditingMember(member); }} onSaved={() => { const isEditing = Boolean(editingAllocation); setAllocating(false); setEditingAllocation(null); overviewAsync.reload(); toast.success(isEditing ? t('features.capacity.capacityView.allocationUpdated') : t('features.capacity.capacityView.allocationSaved')); }} /> : null}
      {editingCalendar ? <WorkCalendarOverlay periodStart={periodStart} periodEnd={periodEnd} onClose={() => setEditingCalendar(false)} onChanged={overviewAsync.reload} /> : null}
      {editingThresholds && user?.role === 'admin' ? <WorkloadThresholdsOverlay initial={overview.thresholds} onClose={() => setEditingThresholds(false)} onSaved={() => { setEditingThresholds(false); overviewAsync.reload(); toast.success(t('features.capacity.capacityView.thresholdsUpdated')); }} /> : null}
    </div>
  );
}
