import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setError(reason instanceof ApiError ? reason.message : t('features.capacity.capacityPlanForm.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.capacity.capacityPlanForm.title', { name: member.userName })} subtitle={t('features.capacity.capacityPlanForm.subtitle', { start: periodStart, end: periodEnd })}>
        <form className="form-stack" onSubmit={submit} style={{ minWidth: 520 }}>
          <div className="form-grid form-grid-2">
            <label className="form-field"><span>{t('features.capacity.capacityPlanForm.workingDays')}</span><input className="form-input" type="number" min="0" max="31" disabled={values.useCalendar} value={values.workingDays} onChange={(event) => updateNumber('workingDays', event.target.value)} /></label>
            <label className="form-field"><span>{t('features.capacity.capacityPlanForm.dailyHours')}</span><input className="form-input" type="number" min="0" max="24" value={values.dailyHours} onChange={(event) => updateNumber('dailyHours', event.target.value)} /></label>
            <label className="form-field"><span>{t('features.capacity.capacityPlanForm.meetingHours')}</span><input className="form-input" type="number" min="0" value={values.meetingHours} onChange={(event) => updateNumber('meetingHours', event.target.value)} /></label>
            <label className="form-field"><span>{t('features.capacity.capacityPlanForm.trainingHours')}</span><input className="form-input" type="number" min="0" value={values.trainingHours} onChange={(event) => updateNumber('trainingHours', event.target.value)} /></label>
            <label className="form-field"><span>{t('features.capacity.capacityPlanForm.supportHours')}</span><input className="form-input" type="number" min="0" value={values.supportHours} onChange={(event) => updateNumber('supportHours', event.target.value)} /></label>
            <label className="form-field"><span>{t('features.capacity.capacityPlanForm.otherCommitmentHours')}</span><input className="form-input" type="number" min="0" value={values.otherCommitmentHours} onChange={(event) => updateNumber('otherCommitmentHours', event.target.value)} /></label>
          </div>
          <label className="form-field"><span><input type="checkbox" checked={values.useCalendar} onChange={(event) => setValues((current) => ({ ...current, useCalendar: event.target.checked }))} /> {t('features.capacity.capacityPlanForm.useCalendar')}</span><small className="text-secondary">{values.useCalendar ? t('features.capacity.capacityPlanForm.calendarHint', { count: existing?.calendarWorkingDays ?? values.workingDays }) : t('features.capacity.capacityPlanForm.manualHint')}</small></label>
          <label className="form-field"><span>{t('features.capacity.capacityPlanForm.notes')}</span><textarea className="form-textarea" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} /></label>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" type="button" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={saving}>{saving ? t('features.capacity.capacityPlanForm.saving') : t('features.capacity.capacityPlanForm.saveCapacity')}</button></div>
        </form>
      </Panel>
    </Overlay>
  );
}
