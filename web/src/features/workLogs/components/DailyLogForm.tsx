import { useMemo, useRef, useState } from 'react';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import type { Project } from '../../../types';
import { createWorkLog } from '../api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyLogForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [projectId, setProjectId] = useState('');
  const [content, setContent] = useState('');
  const [blockers, setBlockers] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [logDate, setLogDate] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);
  const { data: projects } = useAsync<Project[]>(fetchProjects, []);
  const selectedProject = useMemo(
    () => (projects ?? []).find((item) => item.id === projectId) ?? null,
    [projectId, projects],
  );

  async function handleSubmit() {
    setFormError(null);
    if (!content.trim() && !file) {
      setFormError('请填写日报正文，或上传日报文件。');
      return;
    }

    setSubmitting(true);
    try {
      let contentBase64: string | undefined;
      if (file) {
        contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('读取文件失败'));
          reader.readAsDataURL(file);
        });
      }
      const input = {
        projectId: projectId || undefined,
        project: selectedProject?.name || '',
        content: content.trim(),
        blockers: blockers.trim(),
        nextPlan: nextPlan.trim(),
        logDate,
        fileName: file?.name,
        fileType: file?.type || file?.name.split('.').pop() || '',
        contentBase64,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = { key: createIdempotencyKey('work-log-create'), payload };
      }
      await createWorkLog(input, createRequest.current.key);
      await onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '提交失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="上传每日日报" subtitle="支持手填内容，也支持导入 .md / .txt / .doc / .docx 文件。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">日期</label>
            <input className="form-input" type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">未绑定项目</option>
              {(projects ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">日报正文</label>
          <textarea className="form-textarea" rows={6} value={content} onChange={(event) => setContent(event.target.value)} placeholder="建议填写今日完成、提交、验证和联调情况。" />
        </div>
        <div className="form-group">
          <label className="form-label">阻塞项</label>
          <textarea className="form-textarea" rows={3} value={blockers} onChange={(event) => setBlockers(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">明日计划</label>
          <textarea className="form-textarea" rows={3} value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">日报文件</label>
          <input className="form-input" type="file" accept=".md,.txt,.doc,.docx,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中…' : '提交日报'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
