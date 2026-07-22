import { useEffect, useState } from 'react';
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
  const calendarAsync = useAsync<WorkCalendar & { period: { periodStart: string; periodEnd: string } }>(
    () => fetchWorkCalendar({ periodStart, periodEnd }),
    [periodStart, periodEnd],
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
        {calendarAsync.loading ? (
          <div className="body-text">正在加载工作日历…</div>
        ) : calendarAsync.error ? (
          <div className="form-error">{calendarAsync.error}</div>
        ) : calendarAsync.data ? (
          <div className="form-stack">
            <form className="form-stack" onSubmit={saveCalendar}>
              <div className="form-row">
                <label className="form-field"><span>日历名称</span><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
                <div className="form-field"><span>当前周期工作日</span><strong>{calendarAsync.data.workingDays} 天</strong></div>
              </div>
              <div className="form-field">
                <span>常规工作日</span>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} className="btn btn-secondary btn-sm">
                      <input type="checkbox" checked={workingWeekdays.includes(day.value)} onChange={() => toggleWeekday(day.value)} /> {day.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" disabled={saving}>保存工作日历</button>
              </div>
            </form>
            <form className="form-stack" onSubmit={saveException}>
              <div className="section-title">节假日与调休例外</div>
              <div className="form-row">
                <label className="form-field"><span>日期</span><input className="form-input" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></label>
                <label className="form-field"><span>名称</span><input className="form-input" value={exceptionName} onChange={(event) => setExceptionName(event.target.value)} placeholder="例如：国庆节 / 调休" /></label>
                <label className="form-field"><span><input type="checkbox" checked={isWorkingDay} onChange={(event) => setIsWorkingDay(event.target.checked)} /> 设为工作日</span></label>
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" disabled={saving}>保存例外</button>
              </div>
            </form>
            {calendarAsync.data.exceptions.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>日期</th><th>名称</th><th>规则</th><th>操作</th></tr></thead>
                  <tbody>
                    {calendarAsync.data.exceptions.map((item) => (
                      <tr key={item.id}>
                        <td>{item.date}</td>
                        <td>{item.name || '—'}</td>
                        <td>{item.isWorkingDay ? '工作日（调休）' : '非工作日（节假日）'}</td>
                        <td><button className="btn btn-text btn-sm" disabled={saving} onClick={() => removeException(item.id)}>删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="body-text">当前周期没有日历例外。</div>
            )}
          </div>
        ) : null}
      </Panel>
    </Overlay>
  );
}
