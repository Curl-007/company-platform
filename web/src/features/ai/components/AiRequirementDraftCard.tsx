import { useEffect, useMemo, useState } from 'react';
import type { AiProposedAction, Project } from '../../../types';
import { PRIORITY_LABELS, REQUIREMENT_PRIORITIES, labelOf } from '../../../constants/enums';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import { createRequirement } from '../../requirements/api';
import { navigateTo } from '../../team/components/teamMeta';

export default function AiRequirementDraftCard({
  action,
  projects,
  canCreate,
  onCreated,
}: {
  action: AiProposedAction;
  projects: Project[];
  canCreate: boolean;
  onCreated?: (requirementId: string) => void;
}) {
  const liveProjects = useMemo(
    () => projects.filter((item) => !['archived', 'done'].includes(String(item.status || ''))),
    [projects],
  );
  const [title, setTitle] = useState(action.title || '');
  const [projectId, setProjectId] = useState(action.projectId || liveProjects[0]?.id || '');
  const [priority, setPriority] = useState(action.priority || 'medium');
  const [description, setDescription] = useState(action.description || '');
  const [criteria, setCriteria] = useState((action.acceptanceCriteria || []).join('\n'));
  const [assignee, setAssignee] = useState(action.assignee || '');
  const [assigneeRole, setAssigneeRole] = useState(action.assigneeRole || 'dev');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    setTitle(action.title || '');
    setProjectId(action.projectId || liveProjects[0]?.id || '');
    setPriority(action.priority || 'medium');
    setDescription(action.description || '');
    setCriteria((action.acceptanceCriteria || []).join('\n'));
    setAssignee(action.assignee || '');
    setAssigneeRole(action.assigneeRole || 'dev');
    setCreatedId(null);
    setError(null);
  }, [action, liveProjects]);

  async function handleCreate() {
    if (!canCreate) {
      setError('当前账号无权创建需求，请联系具备 requirement 权限的角色确认。');
      return;
    }
    if (!title.trim()) {
      setError('请填写需求标题。');
      return;
    }
    if (!projectId) {
      setError('请选择所属项目。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createRequirement(
        {
          title: title.trim(),
          projectId,
          priority: String(priority || 'medium'),
          description: description.trim() || undefined,
          acceptanceCriteria: criteria
            .split(/\n+/)
            .map((item) => item.trim())
            .filter(Boolean),
          assignee: assignee.trim() || undefined,
          assigneeRole: assignee.trim() ? assigneeRole : undefined,
        },
        createIdempotencyKey('ai-chat-requirement'),
      );
      setCreatedId(created.id);
      onCreated?.(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建需求失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (createdId) {
    return (
      <div className="ai-action-card ai-action-card-success">
        <div className="ai-action-card-title">需求已创建</div>
        <div className="body-text">
          已通过正式接口写入：<span className="text-mono">{createdId}</span>
        </div>
        <div className="ai-action-card-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateTo('requirements', { focus: createdId })}>
            打开需求详情
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-action-card">
      <div className="ai-action-card-title">拟创建需求（需确认）</div>
      <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        AI 只生成草稿；点确认后才会调用 `POST /api/requirements` 写入。
      </div>
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}
      <div className="form-group">
        <label className="form-label">标题</label>
        <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canCreate || submitting} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">项目</label>
          <select className="form-select" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!canCreate || submitting}>
            <option value="">请选择项目</option>
            {liveProjects.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">优先级</label>
          <select className="form-select" value={priority} onChange={(event) => setPriority(event.target.value)} disabled={!canCreate || submitting}>
            {REQUIREMENT_PRIORITIES.map((item) => (
              <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">描述</label>
        <textarea className="form-textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canCreate || submitting} />
      </div>
      <div className="form-group">
        <label className="form-label">验收标准（每行一条）</label>
        <textarea className="form-textarea" rows={3} value={criteria} onChange={(event) => setCriteria(event.target.value)} disabled={!canCreate || submitting} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">执行人（可选）</label>
          <input className="form-input" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!canCreate || submitting} placeholder="如：开发工程师" />
        </div>
        <div className="form-group">
          <label className="form-label">执行角色</label>
          <select className="form-select" value={assigneeRole} onChange={(event) => setAssigneeRole(event.target.value)} disabled={!canCreate || submitting || !assignee.trim()}>
            <option value="dev">开发</option>
            <option value="qa">测试</option>
          </select>
        </div>
      </div>
      <div className="ai-action-card-toolbar">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { void handleCreate(); }} disabled={!canCreate || submitting}>
          {submitting ? '创建中…' : '确认创建需求'}
        </button>
        {!canCreate ? <span className="text-secondary" style={{ fontSize: 12 }}>当前角色只读，无法写入需求。</span> : null}
      </div>
    </div>
  );
}
