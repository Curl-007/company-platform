import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import { useToast } from '../../../components/common/Toast';
import type { WorkCalendar } from '../../../types';
import {
  deleteWorkCalendarException,
  fetchWorkCalendar,
  updateWorkCalendar,
  upsertWorkCalendarException,
} from '../api';
import { WEEKDAYS } from './capacityHelpers';

export default function WorkCalendarOverlay({
  periodStart,
  periodEnd,
  onClose,
  onChanged,
}: {
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const calendarAsync = useAsync<WorkCalendar & { period: { periodStart: string; periodEnd: string } }>(
    () => fetchWorkCalendar({ periodStart, periodEnd }),
    [periodStart, periodEnd],
    { cacheKey: 'capacity:calendar' },
  );
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
    setWorkingWeekdays((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort((a, b) => a - b),
    );
  }

  async function saveCalendar(event: React.FormEvent) {
    event.preventDefault();
    if (workingWeekdays.length === 0) return toast.error(t('features.capacity.workCalendarOverlay.requireWeekday'));
    setSaving(true);
    try {
      await updateWorkCalendar({ name: name.trim() || undefined, workingWeekdays, periodStart, periodEnd });
      calendarAsync.reload();
      onChanged();
      toast.success(t('features.capacity.workCalendarOverlay.calendarSaved'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.capacity.workCalendarOverlay.saveFailed'));
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
      toast.success(t('features.capacity.workCalendarOverlay.exceptionSaved'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.capacity.workCalendarOverlay.exceptionSaveFailed'));
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
      toast.success(t('features.capacity.workCalendarOverlay.exceptionDeleted'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.capacity.workCalendarOverlay.exceptionDeleteFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={900}>
      <Panel title={t('features.capacity.workCalendarOverlay.title')} subtitle={t('features.capacity.workCalendarOverlay.subtitle')}>
        {calendarAsync.loading ? (
          <div className="body-text">{t('features.capacity.workCalendarOverlay.loading')}</div>
        ) : calendarAsync.error ? (
          <div className="form-error">{calendarAsync.error}</div>
        ) : calendarAsync.data ? (
          <div className="form-stack">
            <form className="form-stack" onSubmit={saveCalendar}>
              <div className="form-row">
                <label className="form-field"><span>{t('features.capacity.workCalendarOverlay.calendarName')}</span><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
                <div className="form-field"><span>{t('features.capacity.workCalendarOverlay.currentPeriodWorkdays')}</span><strong>{t('features.capacity.workCalendarOverlay.workdaysCount', { count: calendarAsync.data.workingDays })}</strong></div>
              </div>
              <div className="form-field">
                <span>{t('features.capacity.workCalendarOverlay.regularWorkdays')}</span>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} className="btn btn-secondary btn-sm">
                      <input type="checkbox" checked={workingWeekdays.includes(day.value)} onChange={() => toggleWeekday(day.value)} /> {t(day.label)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" disabled={saving}>{t('features.capacity.workCalendarOverlay.saveCalendar')}</button>
              </div>
            </form>
            <form className="form-stack" onSubmit={saveException}>
              <div className="section-title">{t('features.capacity.workCalendarOverlay.exceptionsTitle')}</div>
              <div className="form-row">
                <label className="form-field"><span>{t('features.capacity.workCalendarOverlay.date')}</span><input className="form-input" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></label>
                <label className="form-field"><span>{t('features.capacity.workCalendarOverlay.name')}</span><input className="form-input" value={exceptionName} onChange={(event) => setExceptionName(event.target.value)} placeholder={t('features.capacity.workCalendarOverlay.namePlaceholder')} /></label>
                <label className="form-field"><span><input type="checkbox" checked={isWorkingDay} onChange={(event) => setIsWorkingDay(event.target.checked)} /> {t('features.capacity.workCalendarOverlay.setAsWorkingDay')}</span></label>
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" disabled={saving}>{t('features.capacity.workCalendarOverlay.saveException')}</button>
              </div>
            </form>
            {calendarAsync.data.exceptions.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>{t('features.capacity.workCalendarOverlay.date')}</th><th>{t('features.capacity.workCalendarOverlay.name')}</th><th>{t('features.capacity.workCalendarOverlay.rule')}</th><th>{t('common.actions')}</th></tr></thead>
                  <tbody>
                    {calendarAsync.data.exceptions.map((item) => (
                      <tr key={item.id}>
                        <td>{item.date}</td>
                        <td>{item.name || '—'}</td>
                        <td>{item.isWorkingDay ? t('features.capacity.workCalendarOverlay.workingDayException') : t('features.capacity.workCalendarOverlay.nonWorkingDayException')}</td>
                        <td><button className="btn btn-text btn-sm" disabled={saving} onClick={() => removeException(item.id)}>{t('common.delete')}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="body-text">{t('features.capacity.workCalendarOverlay.noExceptions')}</div>
            )}
          </div>
        ) : null}
      </Panel>
    </Overlay>
  );
}
