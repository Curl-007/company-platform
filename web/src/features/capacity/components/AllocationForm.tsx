import { useState } from 'react';
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
