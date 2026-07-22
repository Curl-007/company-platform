import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Plus, RefreshCw, Users } from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';
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
  const overviewAsync = useAsync(() => fetchCapacityOverview({ periodStart, periodEnd }), [periodStart, periodEnd]);
  const membersAsync = useAsync<TeamMemberOverview[]>(fetchTeamMembers, []);
  const projectsAsync = useAsync<Project[]>(fetchProjects, []);
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
      toast.success('超配例外已审批，保留在容量风险视图中供持续跟踪。');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '审批超配例外失败');
    } finally {
      setApprovingAllocationId(null);
    }
  }
  async function removeAllocation(id: string, projectName: string, allocationPercent: number) {
    const confirmed = await confirm({
      title: '删除项目投入分配？',
      description: `${projectName} 的 ${allocationPercent}% 项目投入将被删除，并重新计算成员负载。`,
      confirmText: '删除分配',
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      await deleteProjectAllocation(id);
      await overviewAsync.reload();
      toast.success('项目投入分配已删除，容量数据已更新');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除项目投入分配失败');
    }
  }
  return (
    <div className="page capacity-page">
      <PageHeader
        title="团队容量"
        description="基于有效容量与项目投入识别资源风险；该页面不生成个人绩效评分。"
        actions={<div className="flex gap-2"><button className="btn btn-secondary btn-sm" onClick={overviewAsync.reload}><RefreshCw size={15} /> 刷新</button>{user?.role === 'admin' ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingThresholds(true)}>风险阈值</button> : null}<button className="btn btn-secondary btn-sm" onClick={() => setEditingCalendar(true)}>工作日历</button><button className="btn btn-primary btn-sm" onClick={() => { setEditingAllocation(null); setAllocating(true); }}><Plus size={15} /> 分配项目投入</button></div>}
      />

      <Panel title="规划周期" icon={<CalendarDays size={18} />}>
        <div className="flex gap-3" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="form-field"><span>开始日期</span><input className="form-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label className="form-field"><span>结束日期</span><input className="form-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { const period = weekRange(); setPeriodStart(period.periodStart); setPeriodEnd(period.periodEnd); }}>本周</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { const period = weekRange(1); setPeriodStart(period.periodStart); setPeriodEnd(period.periodEnd); }}>下周</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { const period = weekRange(1, 2); setPeriodStart(period.periodStart); setPeriodEnd(period.periodEnd); }}>未来两周</button>
          </div>
          <span className="text-secondary">有效容量会扣除会议、培训、支持和值班等非项目投入。</span>
        </div>
      </Panel>

      <div className="metric-grid" style={{ marginTop: 16 }}>
        <Panel title="团队成员" icon={<Users size={18} />}><strong className="metric-value">{summary.memberCount}</strong><div className="text-secondary">已配置 {summary.configuredCount} 人</div></Panel>
        <Panel title="有效容量"><strong className="metric-value">{summary.totalEffectiveHours.toFixed(1)}h</strong><div className="text-secondary">周期内可用于交付的工时</div></Panel>
        <Panel title="计划投入"><strong className="metric-value">{summary.totalPlannedHours.toFixed(1)}h</strong><div className="text-secondary">项目分配后的总计划工时</div></Panel>
        <Panel title="实际投入"><strong className="metric-value">{summary.totalActualHours.toFixed(1)}h</strong><div className="text-secondary">员工自主记录的实际投入，仅用于计划偏差核对</div></Panel>
        <Panel title="临时工作"><strong className="metric-value">{summary.totalUnplannedActualHours.toFixed(1)}h</strong><div className="text-secondary">已分类实际工时 {summary.totalClassifiedActualHours.toFixed(1)}h；未分类历史记录不参与占比</div></Panel>
        <Panel title="资源风险" icon={<AlertTriangle size={18} />}><strong className="metric-value">{summary.overloadedCount + summary.attentionCount}</strong><div className="text-secondary">过载 {summary.overloadedCount} 人，关注 {summary.attentionCount} 人；碎片化风险 {summary.highFragmentationCount} 人；待超配审批 {summary.pendingOverrideCount} 项</div></Panel>
      </div>

      <Panel title="成员负载" subtitle={`低负载仅提示核对分配，不代表低绩效。当前阈值：平衡 ≥ ${Math.round(overview.thresholds.balancedMin * 100)}%，关注 ≥ ${Math.round(overview.thresholds.attentionMin * 100)}%，过载 > ${Math.round(overview.thresholds.overloadedAbove * 100)}%。`} style={{ marginTop: 16 }}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>成员</th><th>角色</th><th>有效容量</th><th>计划投入</th><th>实际投入</th><th>临时工作</th><th>当前 WIP</th><th>项目碎片化</th><th>负载率</th><th>项目分配</th><th>风险</th><th>操作</th></tr></thead><tbody>
          {overview.members.map((member) => {
            const loadPercent = member.loadRatio === null ? 0 : Math.min(100, Math.round(member.loadRatio * 100));
            return <tr key={member.userId}><td>{member.userName}</td><td>{member.role}</td><td>{member.effectiveHours.toFixed(1)}h</td><td>{member.plannedHours.toFixed(1)}h</td><td>{member.actualHours.toFixed(1)}h</td><td>{member.unplannedActualHours.toFixed(1)}h <span className="text-secondary">{member.unplannedRatio === null ? '待分类' : `(${Math.round(member.unplannedRatio * 100)}%)`}</span></td><td>{member.currentWipCount}</td><td>{member.projectFragmentationCount} {member.fragmentationRisk ? <span className="text-danger">· 关注</span> : null}</td><td style={{ minWidth: 140 }}><ProgressBar percent={loadPercent} height={6} /><span className="text-secondary">{percentage(member.loadRatio)}</span></td><td>{member.allocations.length ? member.allocations.map((item) => <div key={item.id}>{item.projectName} {item.allocationPercent}%{item.approvalStatus === 'pending' ? <span className="text-danger"> · 待超配审批</span> : null}{item.overloadReason ? <small className="text-secondary"> · {item.overloadReason}</small> : null}{user?.role === 'admin' && item.approvalStatus === 'pending' && item.updatedBy !== user.id ? <button className="btn btn-text btn-sm" disabled={approvingAllocationId === item.id} onClick={() => approveOverride(item.id)}>审批</button> : null}{user?.role === 'admin' && item.approvalStatus === 'pending' && item.updatedBy === user.id ? <small className="text-secondary"> · 不可自审批</small> : null}{canManageProjectAllocations ? <button className="btn btn-text btn-sm" onClick={() => { setEditingAllocation(item); setAllocating(true); }}>编辑</button> : null}{canManageProjectAllocations ? <button className="btn btn-text btn-sm" onClick={() => void removeAllocation(item.id, item.projectName, item.allocationPercent)}>删除</button> : null}</div>) : '暂无分配'}</td><td><StatusBadge label={member.risk.label} variant={RISK_VARIANT[member.risk.code]} /></td><td><button className="btn btn-text btn-sm" onClick={() => setEditingMember(member)}>配置容量</button></td></tr>;
          })}
        </tbody></table></div>
      </Panel>

      {editingMember ? <CapacityPlanForm member={editingMember} periodStart={periodStart} periodEnd={periodEnd} onClose={() => setEditingMember(null)} onSaved={() => { setEditingMember(null); overviewAsync.reload(); toast.success('容量计划已保存'); }} /> : null}
      {allocating ? <AllocationForm allocation={editingAllocation ?? undefined} preferredProjectId={requestedProjectId || undefined} periodStart={periodStart} periodEnd={periodEnd} members={membersAsync.data ?? []} capacityMembers={overview.members} projects={projectsAsync.data ?? []} onClose={() => { setAllocating(false); setEditingAllocation(null); }} onConfigureCapacity={(member) => { setAllocating(false); setEditingAllocation(null); setEditingMember(member); }} onSaved={() => { const isEditing = Boolean(editingAllocation); setAllocating(false); setEditingAllocation(null); overviewAsync.reload(); toast.success(isEditing ? '项目投入已更新' : '项目投入已保存'); }} /> : null}
      {editingCalendar ? <WorkCalendarOverlay periodStart={periodStart} periodEnd={periodEnd} onClose={() => setEditingCalendar(false)} onChanged={overviewAsync.reload} /> : null}
      {editingThresholds && user?.role === 'admin' ? <WorkloadThresholdsOverlay initial={overview.thresholds} onClose={() => setEditingThresholds(false)} onSaved={() => { setEditingThresholds(false); overviewAsync.reload(); toast.success('容量风险阈值已更新'); }} /> : null}
    </div>
  );
}
