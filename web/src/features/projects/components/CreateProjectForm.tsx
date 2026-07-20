import { useRef, useState } from 'react';
import { createProject, type CreateProjectInput } from '../api';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import Panel from '../../../components/common/Panel';
import Overlay from '../../../components/common/Overlay';

export default function CreateProjectForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [objective, setObjective] = useState('');
  const [processMode, setProcessMode] = useState('scrum');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createRequest = useRef<{ key: string; payload: string } | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('请输入项目名称。');
    if (!owner.trim()) return setFormError('请输入负责人。');

    setSubmitting(true);
    try {
      const input: CreateProjectInput = { name: name.trim(), owner: owner.trim(), objective: objective.trim() || undefined, processMode };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = {
          key: createIdempotencyKey('project-create'),
          payload,
        };
      }
      await createProject(input, createRequest.current.key);
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '创建项目失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <Panel
        className="project-form-panel"
        title="新建项目"
        subtitle="录入项目基本信息，后续可继续补充排期、关联产品和里程碑。"
        footer={(
          <div className="project-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        )}
      >
        {formError && <div className="form-error project-form-error">{formError}</div>}

        <div className="project-create-layout">
          <div className="project-form-section">
            <div className="project-form-section-title">项目基础</div>
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入项目名称" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">负责人</label>
                <input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="请输入负责人姓名" />
              </div>
              <div className="form-group">
                <label className="form-label">流程模式</label>
                <select className="form-select" value={processMode} onChange={(event) => setProcessMode(event.target.value)}>
                  <option value="scrum">Scrum</option>
                  <option value="kanban">看板</option>
                  <option value="waterfall">瀑布</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">项目目标</label>
              <textarea className="form-textarea" rows={2} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="例如：将客户自助开通时长缩短至 5 分钟以内" />
            </div>
          </div>

          <div className="project-create-hint">
            <div className="project-create-hint-title">创建后可继续完善</div>
            <div className="project-create-hint-grid">
              <span>排期计划</span>
              <span>项目成员</span>
              <span>关联产品</span>
              <span>交付里程碑</span>
            </div>
          </div>
        </div>

      </Panel>
    </Overlay>
  );
}
