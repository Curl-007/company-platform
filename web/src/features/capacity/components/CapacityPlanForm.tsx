import { useState } from 'react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import type { CapacityMemberOverview } from '../../../types';
import { upsertCapacityPlan } from '../api';
import type { CapacityPlanFormValues } from './capacityHelpers';

export default function CapacityPlanForm({
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
  const [values, setValues] = useState<CapacityPlanFormValues>(() => ({
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

  function updateNumber(key: Exclude<keyof CapacityPlanFormValues, 'notes' | 'useCalendar'>, value: string) {
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
