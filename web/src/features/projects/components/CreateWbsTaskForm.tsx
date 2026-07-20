import { useRef, useState } from 'react';
import { createWbsTask, type CreateWbsTaskInput } from '../../tasks/api';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';

export default function CreateWbsTaskForm({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入任务标题。');

    setSubmitting(true);
    try {
      const input: CreateWbsTaskInput = {
        title: title.trim(),
        assigneeId: assigneeId.trim() || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('task-create'),
          payload,
        };
      }
      await createWbsTask(projectId, input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="新建 WBS 任务" subtitle="在工作分解结构中添加一项任务">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">任务标题</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务标题" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} placeholder="负责人" />
          </div>
          <div className="form-group">
            <label className="form-label">预估工时 (h)</label>
            <input className="form-input" type="number" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
