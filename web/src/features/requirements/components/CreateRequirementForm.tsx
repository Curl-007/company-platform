import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { PRIORITY_LABELS, REQUIREMENT_PRIORITIES, labelOf } from '../../../constants/enums';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import type { Project, Requirement } from '../../../types';
import { createRequirement } from '../api';

const EXEC_ROLE_OPTIONS = [
  { value: 'dev', label: '开发' },
  { value: 'qa', label: '测试' },
];

interface CreateRequirementFormProps {
  projects: Project[];
  requirements: Requirement[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateRequirementForm({
  projects,
  requirements,
  onClose,
  onCreated,
}: CreateRequirementFormProps) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [parentId, setParentId] = useState('');
  const [owner, setOwner] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('dev');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const createRequest = useRef<{ key: string; payload: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parentOptions = requirements.filter((item) => !item.parentId && item.projectId === projectId);

  async function handleSubmit() {
    if (!title.trim()) return setFormError('请输入需求标题。');
    if (!projectId) return setFormError('请选择所属项目。');
    setFormError(null);
    setSubmitting(true);
    try {
      const input = {
        title: title.trim(),
        projectId,
        parentId: parentId || undefined,
        owner: owner.trim() || undefined,
        assignee: assignee.trim() || undefined,
        assigneeRole: assignee.trim() ? assigneeRole : undefined,
        priority,
        description: description.trim() || undefined,
        acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = { key: createIdempotencyKey('requirement-create'), payload };
      }
      await createRequirement(input, createRequest.current.key);
      onCreated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '创建需求失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={680} ariaLabel="新建需求">
      <Panel
        className="req-create-panel"
        title="新建需求"
        subtitle="创建需求并直接分配给开发或测试"
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label="关闭">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="req-create-body">
          {formError ? <div className="form-error req-detail-error">{formError}</div> : null}

          <div className="form-group">
            <label className="form-label">需求标题</label>
            <input
              className="form-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="用一句话说明要交付什么"
              autoFocus
            />
          </div>

          <div className="req-form-grid">
            <div className="form-group">
              <label className="form-label">所属项目</label>
              <select
                className="form-select"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setParentId('');
                }}
              >
                <option value="">请选择项目</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">优先级</label>
              <select
                className="form-select"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {REQUIREMENT_PRIORITIES.map((item) => (
                  <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">需求负责人</label>
              <input
                className="form-input"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="项目经理 / 产品经理"
              />
            </div>
            <div className="form-group">
              <label className="form-label">父级需求</label>
              <select
                className="form-select"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">无（作为根需求）</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.id} · {item.title}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">执行人</label>
              <input
                className="form-input"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                placeholder="可直接指派开发或测试"
              />
            </div>
            <div className="form-group">
              <label className="form-label">执行角色</label>
              <select
                className="form-select"
                value={assigneeRole}
                onChange={(event) => setAssigneeRole(event.target.value)}
              >
                {EXEC_ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">需求描述</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="背景、目标、边界与约束"
            />
          </div>

          <div className="form-group">
            <label className="form-label">验收标准（每行一条）</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              placeholder={'例如：\n核心路径可完成\n异常提示清晰可定位'}
            />
          </div>

          <div className="req-detail-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              className="btn btn-primary btn-sm btn-with-icon"
              onClick={handleSubmit}
              disabled={submitting}
            >
              <Plus size={14} aria-hidden="true" />
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
