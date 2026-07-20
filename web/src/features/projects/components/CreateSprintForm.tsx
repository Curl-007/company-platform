import { useRef, useState } from 'react';
import { createSprint, type CreateSprintInput } from '../../tasks/api';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';

export default function CreateSprintForm({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入迭代名称。');

    setSubmitting(true);
    try {
      const input: CreateSprintInput = {
        name: name.trim(),
        goal: goal.trim() || undefined,
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('sprint-create'),
          payload,
        };
      }
      await createSprint(projectId, input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建迭代失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="新建迭代" subtitle="为项目添加一个迭代">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">迭代名称</label>
          <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Sprint 4" />
        </div>
        <div className="form-group">
          <label className="form-label">迭代目标</label>
          <input className="form-input" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="本次迭代目标" />
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
