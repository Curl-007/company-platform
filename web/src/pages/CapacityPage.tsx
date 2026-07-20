import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Plus, RefreshCw, Users } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Overlay from '../components/common/Overlay';
import PageState from '../components/common/PageState';
import Panel from '../components/common/Panel';
import ProgressBar from '../components/common/ProgressBar';
import StatusBadge from '../components/common/StatusBadge';
import { useAsync } from '../hooks/useAsync';
import {
  approveProjectAllocation,
  deleteProjectAllocation,
  deleteWorkCalendarException,
  fetchCapacityOverview,
  fetchWorkCalendar,
  upsertCapacityPlan,
  upsertProjectAllocation,
  updateWorkloadThresholds,
  updateWorkCalendar,
  upsertWorkCalendarException,
  type UpsertCapacityPlanInput,
  type WorkloadThresholds,
} from '../features/capacity/api';
import { fetchProjects } from '../features/projects/api';
import { fetchTeamMembers } from '../features/team/api';
import { ApiError } from '../services/api';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import type { CapacityMemberOverview, Project, ProjectAllocation, SessionUser, TeamMemberOverview, WorkCalendar } from '../types';
import { canOperate } from '../constants/roles';

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function weekRange(offsetWeeks = 0, weekCount = 1) {
  const start = new Date();
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + weekCount * 7 - 1);
  return { periodStart: toDate(start), periodEnd: toDate(end) };
}

function currentWeek() {
  return weekRange();
}

const RISK_VARIANT: Record<string, 'success' | 'warning' | 'risk' | 'neutral'> = {
  balanced: 'success',
  attention: 'warning',
  overloaded: 'risk',
  underallocated: 'neutral',
  unconfigured: 'neutral',
};

const WEEKDAYS = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' }, { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 0, label: '周日' },
];

function percentage(value: number | null): string {
  return value === null ? '未配置' : `${Math.round(value * 100)}%`;
}

function CapacityPlanForm({
  member,
  periodStart,
  periodEnd,
  onClose,
  onSaved,
}: {
  member: CapacityMemberOverview;
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = member.plan;
  const [values, setValues] = useState<Required<Omit<UpsertCapacityPlanInput, 'periodStart' | 'periodEnd'>>>(() => ({
    workingDays: existing?.workingDays ?? 5,
    useCalendar: existing?.useCalendar ?? true,
    dailyHours: existing?.dailyHours ?? 8,
    meetingHours: existing?.meetingHours ?? 0,
    trainingHours: existing?.trainingHours ?? 0,
    supportHours: existing?.supportHours ?? 0,
    otherCommitmentHours: existing?.otherCommitmentHours ?? 0,
    notes: existing?.notes ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateNumber(key: Exclude<keyof typeof values, 'notes' | 'useCalendar'>, value: string) {
    setValues((current) => ({ ...current, [key]: Number(value) }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertCapacityPlan(member.userId, { ...values, periodStart, periodEnd });
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '保存容量计划失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={`配置 ${member.userName} 的有效容量`} subtitle={`${periodStart} 至 ${periodEnd}`}>
        <form className="form-stack" onSubmit={submit} style={{ minWidth: 520 }}>
          <div className="form-grid form-grid-2">
            <label className="form-field"><span>工作日</span><input className="form-input" type="number" min="0" max="31" disabled={values.useCalendar} value={values.workingDays} onChange={(event) => updateNumber('workingDays', event.target.value)} /></label>
            <label className="form-field"><span>每日标准工时</span><input className="form-input" type="number" min="0" max="24" value={values.dailyHours} onChange={(event) => updateNumber('dailyHours', event.target.value)} /></label>
            <label className="form-field"><span>固定会议工时</span><input className="form-input" type="number" min="0" value={values.meetingHours} onChange={(event) => updateNumber('meetingHours', event.target.value)} /></label>
            <label className="form-field"><span>培训工时</span><input className="form-input" type="number" min="0" value={values.trainingHours} onChange={(event) => updateNumber('trainingHours', event.target.value)} /></label>
            <label className="form-field"><span>支持/值班工时</span><input className="form-input" type="number" min="0" value={values.supportHours} onChange={(event) => updateNumber('supportHours', event.target.value)} /></label>
            <label className="form-field"><span>其他承诺工时</span><input className="form-input" type="number" min="0" value={values.otherCommitmentHours} onChange={(event) => updateNumber('otherCommitmentHours', event.target.value)} /></label>
          </div>
          <label className="form-field"><span><input type="checkbox" checked={values.useCalendar} onChange={(event) => setValues((current) => ({ ...current, useCalendar: event.target.checked }))} /> 使用默认工作日历</span><small className="text-secondary">{values.useCalendar ? `当前周期将按日历计算 ${existing?.calendarWorkingDays ?? values.workingDays} 个工作日。` : '关闭后使用手工录入的工作日。'}</small></label>
          <label className="form-field"><span>说明</span><textarea className="form-textarea" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} /></label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" type="button" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={saving}>{saving ? '保存中…' : '保存容量'}</button></div>
        </form>
      </Panel>
    </Overlay>
  );
}

function AllocationForm({
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
  allocation?: ProjectAllocation;
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
      setError('请先为所选成员配置当前周期的容量计划，再分配项目投入。');
      return;
    }
    if (requiresOverride && !overloadReason.trim()) {
      setError('投入超过 100%，请填写超配原因后提交独立审批。');
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
      setError(reason instanceof ApiError ? reason.message : '保存项目投入失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={allocation ? '编辑项目投入' : '分配项目投入'} subtitle="投入用于资源平衡，不作为个人绩效评分。">
        <form className="form-stack" onSubmit={submit} style={{ minWidth: 480 }}>
          <label className="form-field"><span>成员</span><select className="form-select" value={userId} disabled={Boolean(allocation)} onChange={(event) => setUserId(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="form-field"><span>项目</span><select className="form-select" value={projectId} disabled={Boolean(allocation)} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <div className="form-grid form-grid-2">
            <label className="form-field"><span>投入比例 (%)</span><input className="form-input" type="number" min="0" max="200" value={allocationPercent} onChange={(event) => setAllocationPercent(event.target.value)} /></label>
            <label className="form-field"><span>计划工时（可选）</span><input className="form-input" type="number" min="0" value={plannedHours} onChange={(event) => setPlannedHours(event.target.value)} /></label>
          </div>
          <div className={requiresOverride ? 'form-error' : 'text-secondary'}>
            当前已分配 {selectedMember?.allocationPercent ?? 0}%；本次提交后预计 {projectedAllocationPercent}%
            {requiresOverride ? '。该超配将进入待审批状态，且提交人不能自行审批。' : '。'}
          </div>
          {requiresCapacityPlan && selectedMember ? (
            <div className="form-error">
              所选成员尚无当前周期的容量计划，无法校验投入是否超过有效容量。
              <button className="btn btn-text btn-sm" type="button" onClick={() => onConfigureCapacity(selectedMember)}>先配置容量计划</button>
            </div>
          ) : null}
          {requiresOverride ? <label className="form-field"><span>超配原因（必填）</span><textarea className="form-textarea" value={overloadReason} onChange={(event) => setOverloadReason(event.target.value)} placeholder="说明交付紧急性、影响范围和缓解措施" /></label> : null}
          <label className="form-field"><span>说明</span><textarea className="form-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" type="button" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={saving || !userId || !projectId || requiresCapacityPlan}>{saving ? '保存中…' : '保存投入'}</button></div>
        </form>
      </Panel>
    </Overlay>
  );
}

function WorkCalendarOverlay({ periodStart, periodEnd, onClose, onChanged }: { periodStart: string; periodEnd: string; onClose: () => void; onChanged: () => void }) {
  const calendarAsync = useAsync<WorkCalendar & { period: { periodStart: string; periodEnd: string } }>(() => fetchWorkCalendar({ periodStart, periodEnd }), [periodStart, periodEnd]);
  const [name, setName] = useState('');
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [exceptionDate, setExceptionDate] = useState(periodStart);
  const [exceptionName, setExceptionName] = useState('');
  const [isWorkingDay, setIsWorkingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!calendarAsync.data) return;
    setName(calendarAsync.data.name);
    setWorkingWeekdays(calendarAsync.data.workingWeekdays);
  }, [calendarAsync.data]);

  function toggleWeekday(value: number) {
    setWorkingWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort((a, b) => a - b));
  }

  async function saveCalendar(event: React.FormEvent) {
    event.preventDefault();
    if (workingWeekdays.length === 0) return toast.error('至少选择一个常规工作日。');
    setSaving(true);
    try {
      await updateWorkCalendar({ name: name.trim() || undefined, workingWeekdays, periodStart, periodEnd });
      calendarAsync.reload();
      onChanged();
      toast.success('工作日历已保存，容量已重新计算。');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存工作日历失败');
    } finally {
      setSaving(false);
    }
  }

  async function saveException(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await upsertWorkCalendarException({ date: exceptionDate, isWorkingDay, name: exceptionName.trim() || undefined });
      setExceptionName('');
      calendarAsync.reload();
      onChanged();
      toast.success('日历例外已保存，容量已重新计算。');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存日历例外失败');
    } finally {
      setSaving(false);
    }
  }

  async function removeException(id: string) {
    setSaving(true);
    try {
      await deleteWorkCalendarException(id);
      calendarAsync.reload();
      onChanged();
      toast.success('日历例外已删除。');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除日历例外失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={900}>
      <Panel title="工作日历" subtitle="容量按常规工作日与节假日/调休例外计算。">
        {calendarAsync.loading ? <div className="body-text">正在加载工作日历…</div> : calendarAsync.error ? <div className="form-error">{calendarAsync.error}</div> : calendarAsync.data ? (
          <div className="form-stack">
            <form className="form-stack" onSubmit={saveCalendar}>
              <div className="form-row"><label className="form-field"><span>日历名称</span><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="form-field"><span>当前周期工作日</span><strong>{calendarAsync.data.workingDays} 天</strong></div></div>
              <div className="form-field"><span>常规工作日</span><div className="flex gap-2" style={{ flexWrap: 'wrap' }}>{WEEKDAYS.map((day) => <label key={day.value} className="btn btn-secondary btn-sm"><input type="checkbox" checked={workingWeekdays.includes(day.value)} onChange={() => toggleWeekday(day.value)} /> {day.label}</label>)}</div></div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary btn-sm" disabled={saving}>保存工作日历</button></div>
            </form>
            <form className="form-stack" onSubmit={saveException}>
              <div className="section-title">节假日与调休例外</div>
              <div className="form-row"><label className="form-field"><span>日期</span><input className="form-input" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></label><label className="form-field"><span>名称</span><input className="form-input" value={exceptionName} onChange={(event) => setExceptionName(event.target.value)} placeholder="例如：国庆节 / 调休" /></label><label className="form-field"><span><input type="checkbox" checked={isWorkingDay} onChange={(event) => setIsWorkingDay(event.target.checked)} /> 设为工作日</span></label></div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary btn-sm" disabled={saving}>保存例外</button></div>
            </form>
            {calendarAsync.data.exceptions.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>日期</th><th>名称</th><th>规则</th><th>操作</th></tr></thead><tbody>{calendarAsync.data.exceptions.map((item) => <tr key={item.id}><td>{item.date}</td><td>{item.name || '—'}</td><td>{item.isWorkingDay ? '工作日（调休）' : '非工作日（节假日）'}</td><td><button className="btn btn-text btn-sm" disabled={saving} onClick={() => removeException(item.id)}>删除</button></td></tr>)}</tbody></table></div> : <div className="body-text">当前周期没有日历例外。</div>}
          </div>
        ) : null}
      </Panel>
    </Overlay>
  );
}

function WorkloadThresholdsOverlay({ initial, onClose, onSaved }: { initial: WorkloadThresholds; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<WorkloadThresholds>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    try { await updateWorkloadThresholds(values); onSaved(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : '保存风险阈值失败'); } finally { setSaving(false); }
  }
  return <Overlay onClose={onClose}><Panel title="容量风险阈值" subtitle="阈值仅改变资源风险提示，不用于个人绩效评分。"><form className="form-stack" onSubmit={submit}>{error ? <div className="form-error">{error}</div> : null}<div className="form-grid form-grid-3"><label className="form-field"><span>平衡下限</span><input className="form-input" type="number" min="0" step="0.01" value={values.balancedMin} onChange={(event) => setValues((current) => ({ ...current, balancedMin: Number(event.target.value) }))} /></label><label className="form-field"><span>关注下限</span><input className="form-input" type="number" min="0" step="0.01" value={values.attentionMin} onChange={(event) => setValues((current) => ({ ...current, attentionMin: Number(event.target.value) }))} /></label><label className="form-field"><span>过载阈值</span><input className="form-input" type="number" min="0" step="0.01" value={values.overloadedAbove} onChange={(event) => setValues((current) => ({ ...current, overloadedAbove: Number(event.target.value) }))} /></label></div><small className="text-secondary">要求：平衡下限 ≤ 关注下限 ≤ 过载阈值。比例 1 代表 100%。</small><div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>取消</button><button className="btn btn-primary btn-sm" disabled={saving}>{saving ? '保存中…' : '保存阈值'}</button></div></form></Panel></Overlay>;
}

function CapacityPage({ user }: { user?: SessionUser | null }) {
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

export default CapacityPage;
