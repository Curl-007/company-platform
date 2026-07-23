import { useRef, useState } from 'react';
import { createTimeEntry, updateTimeEntry } from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import type { Project, TimeEntry } from '../../../types';
import { businessDateKey } from '../../../utils/businessDate';

export default function TimeEntryForm({ entry, onClose, onSaved }: { entry?: TimeEntry; onClose: () => void; onSaved: () => Promise<void> }) {
  const [projectId, setProjectId] = useState(entry?.projectId ?? '');
  const [workDate, setWorkDate] = useState(entry?.workDate ?? businessDateKey());
  const [hours, setHours] = useState(entry ? String(entry.hours) : '1');
  const [category, setCategory] = useState<'delivery' | 'support' | 'meeting' | 'training' | 'other'>(
    entry && ['delivery', 'support', 'meeting', 'training', 'other'].includes(entry.category)
      ? entry.category as 'delivery' | 'support' | 'meeting' | 'training' | 'other'
      : 'delivery',
  );
  const [workNature, setWorkNature] = useState<'planned' | 'unplanned'>(entry?.workNature === 'unplanned' ? 'unplanned' : 'planned');
  const createRequest = useRef<{ key: string; payload: string } | null>(null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!projectId || !Number(hours) || Number(hours) <= 0 || Number(hours) > 24) {
      setFormError('请选择项目，并填写 0 到 24 之间的工时。');
      return;
    }
    setSubmitting(true);
    try {
      const input = { projectId, workDate, hours: Number(hours), category, workNature, note: note.trim() };
      if (entry) {
        await updateTimeEntry(entry.id, input);
      } else {
        const payload = JSON.stringify(input);
        if (!createRequest.current || createRequest.current.payload !== payload) {
          createRequest.current = { key: createIdempotencyKey('time-entry-create'), payload };
        }
        await createTimeEntry(input, createRequest.current.key);
      }
      await onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '工时记录保存失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={entry ? '编辑实际工时' : '记录实际工时'} subtitle="实际工时用于计划偏差和工作支持分析，不用于个人绩效评分。">
        <form className="form-stack" onSubmit={handleSubmit}>
          {formError ? <div className="form-error">{formError}</div> : null}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">日期</label>
              <input className="form-input" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">工时</label>
              <input className="form-input" type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">项目</label>
            <select className="form-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">请选择项目</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">工作类别</label>
            <select className="form-select" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              <option value="delivery">项目交付</option>
              <option value="support">支持/值班</option>
              <option value="meeting">会议协作</option>
              <option value="training">培训学习</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">计划属性</label>
            <select className="form-select" value={workNature} onChange={(event) => setWorkNature(event.target.value as typeof workNature)}>
              <option value="planned">计划内工作</option>
              <option value="unplanned">临时/非计划工作</option>
            </select>
            <small className="text-secondary">用于识别计划被中断的风险，不作为个人绩效评分依据。</small>
          </div>
          <div className="form-group">
            <label className="form-label">说明</label>
            <textarea className="form-textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm" disabled={submitting}>{submitting ? '保存中…' : entry ? '更新工时' : '保存工时'}</button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
