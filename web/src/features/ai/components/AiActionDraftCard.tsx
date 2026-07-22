import { useEffect, useMemo, useState } from 'react';
import type { AiProposedAction, Project } from '../../../types';
import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import {
  createRequirement,
  deleteRequirement,
  fetchRequirement,
  updateRequirement,
  updateRequirementStatus,
} from '../../requirements/api';
import {
  createDefect,
  deleteDefect,
  updateDefect,
  updateDefectStatus,
} from '../../testing/api';
import {
  createWbsTask,
  deleteTask,
  fetchTask,
  updateTask,
  updateTaskStatus,
} from '../../tasks/api';
import { navigateTo } from '../../team/components/teamMeta';

const ACTION_LABELS: Record<string, string> = {
  create_requirement: '新建需求',
  update_requirement: '修改需求',
  update_requirement_status: '变更需求状态',
  delete_requirement: '删除需求',
  create_defect: '新建缺陷',
  update_defect: '修改缺陷',
  update_defect_status: '变更缺陷状态',
  delete_defect: '删除缺陷',
  create_task: '新建任务',
  update_task: '修改任务',
  update_task_status: '变更任务状态',
  delete_task: '删除任务',
};

function resourceKind(type: string): 'requirement' | 'defect' | 'task' | 'unknown' {
  if (type.includes('requirement')) return 'requirement';
  if (type.includes('defect')) return 'defect';
  if (type.includes('task')) return 'task';
  return 'unknown';
}

export default function AiActionDraftCard({
  action,
  projects,
  canManageRequirements,
  canManageTesting,
  canManageProjects,
  onDone,
}: {
  action: AiProposedAction;
  projects: Project[];
  canManageRequirements: boolean;
  canManageTesting: boolean;
  canManageProjects: boolean;
  onDone?: (result: { type: string; id: string; label: string }) => void;
}) {
  const kind = resourceKind(String(action.type));
  const liveProjects = useMemo(
    () => projects.filter((item) => !['archived', 'done'].includes(String(item.status || ''))),
    [projects],
  );

  const canWrite =
    kind === 'requirement'
      ? canManageRequirements
      : kind === 'defect'
        ? canManageTesting
        : kind === 'task'
          ? canManageProjects
          : false;

  const [title, setTitle] = useState(action.title || '');
  const [projectId, setProjectId] = useState(action.projectId || liveProjects[0]?.id || '');
  const [resourceId, setResourceId] = useState(action.resourceId || '');
  const [status, setStatus] = useState(action.status || '');
  const [priority, setPriority] = useState(action.priority || 'medium');
  const [severity, setSeverity] = useState(action.severity || 'medium');
  const [description, setDescription] = useState(action.description || '');
  const [criteria, setCriteria] = useState((action.acceptanceCriteria || []).join('\n'));
  const [assignee, setAssignee] = useState(action.assignee || action.owner || '');
  const [assigneeRole, setAssigneeRole] = useState(action.assigneeRole || 'dev');
  const [taskType, setTaskType] = useState(action.taskType || 'task');
  const [estimatedHours, setEstimatedHours] = useState(
    action.estimatedHours != null ? String(action.estimatedHours) : '',
  );
  const [reason, setReason] = useState(action.reason || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    setTitle(action.title || '');
    setProjectId(action.projectId || liveProjects[0]?.id || '');
    setResourceId(action.resourceId || '');
    setStatus(action.status || '');
    setPriority(action.priority || 'medium');
    setSeverity(action.severity || 'medium');
    setDescription(action.description || '');
    setCriteria((action.acceptanceCriteria || []).join('\n'));
    setAssignee(action.assignee || action.owner || '');
    setAssigneeRole(action.assigneeRole || 'dev');
    setTaskType(action.taskType || 'task');
    setEstimatedHours(action.estimatedHours != null ? String(action.estimatedHours) : '');
    setReason(action.reason || '');
    setDoneId(null);
    setError(null);
  }, [action, liveProjects]);

  const isCreate = String(action.type).startsWith('create_');
  const isDelete = String(action.type).startsWith('delete_');
  const isStatus = String(action.type).includes('_status');
  const isUpdate = String(action.type).startsWith('update_') && !isStatus;

  async function execute() {
    if (!canWrite) {
      setError('当前账号无权执行该写操作。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let resultId = '';
      const type = String(action.type);

      if (type === 'create_requirement') {
        if (!title.trim() || !projectId) throw new Error('请填写需求标题并选择项目。');
        const created = await createRequirement(
          {
            title: title.trim(),
            projectId,
            priority: String(priority || 'medium'),
            description: description.trim() || undefined,
            acceptanceCriteria: criteria.split(/\n+/).map((s) => s.trim()).filter(Boolean),
            assignee: assignee.trim() || undefined,
            assigneeRole: assignee.trim() ? assigneeRole : undefined,
          },
          createIdempotencyKey('ai-chat-requirement'),
        );
        resultId = created.id;
      } else if (type === 'update_requirement') {
        if (!resourceId.trim()) throw new Error('请填写需求编号 REQ-xxx。');
        const current = await fetchRequirement(resourceId.trim());
        await updateRequirement(resourceId.trim(), {
          version: Number(current.version || 1),
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          priority: String(priority || undefined),
          acceptanceCriteria: criteria
            ? criteria.split(/\n+/).map((s) => s.trim()).filter(Boolean)
            : undefined,
          assignee: assignee.trim() || undefined,
          assigneeRole: assignee.trim() ? assigneeRole : undefined,
        });
        resultId = resourceId.trim();
      } else if (type === 'update_requirement_status') {
        if (!resourceId.trim() || !status) throw new Error('请填写需求编号与目标状态。');
        const current = await fetchRequirement(resourceId.trim());
        await updateRequirementStatus(resourceId.trim(), status, Number(current.version || 1));
        resultId = resourceId.trim();
      } else if (type === 'delete_requirement') {
        if (!resourceId.trim()) throw new Error('请填写需求编号 REQ-xxx。');
        await deleteRequirement(resourceId.trim());
        resultId = resourceId.trim();
      } else if (type === 'create_defect') {
        if (!title.trim() || !projectId) throw new Error('请填写缺陷标题并选择项目。');
        const created = await createDefect({
          title: title.trim(),
          projectId,
          severity: String(severity || 'medium'),
          description: description.trim() || undefined,
          assignee: assignee.trim() || undefined,
          assigneeRole: assignee.trim() ? assigneeRole : undefined,
        });
        resultId = created.id;
      } else if (type === 'update_defect') {
        if (!resourceId.trim()) throw new Error('请填写缺陷编号 BUG-xxx。');
        await updateDefect(resourceId.trim(), {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          severity: String(severity || undefined),
          assignee: assignee.trim() || undefined,
          assigneeRole: assignee.trim() ? assigneeRole : undefined,
        });
        resultId = resourceId.trim();
      } else if (type === 'update_defect_status') {
        if (!resourceId.trim() || !status) throw new Error('请填写缺陷编号与目标状态。');
        await updateDefectStatus(resourceId.trim(), status);
        resultId = resourceId.trim();
      } else if (type === 'delete_defect') {
        if (!resourceId.trim()) throw new Error('请填写缺陷编号 BUG-xxx。');
        await deleteDefect(resourceId.trim());
        resultId = resourceId.trim();
      } else if (type === 'create_task') {
        if (!title.trim() || !projectId) throw new Error('请填写任务标题并选择项目。');
        const created = await createWbsTask(
          projectId,
          {
            title: title.trim(),
            owner: assignee.trim() || undefined,
            type: taskType || 'task',
            estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
          },
          createIdempotencyKey('ai-chat-task'),
        );
        resultId = created.id;
      } else if (type === 'update_task') {
        if (!resourceId.trim()) throw new Error('请填写任务编号 TASK-xxx。');
        const current = await fetchTask(resourceId.trim());
        await updateTask(resourceId.trim(), {
          version: Number(current.version || 1),
          title: title.trim() || undefined,
          owner: assignee.trim() || undefined,
          type: taskType || undefined,
          estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        });
        resultId = resourceId.trim();
      } else if (type === 'update_task_status') {
        if (!resourceId.trim() || !status) throw new Error('请填写任务编号与目标状态。');
        const current = await fetchTask(resourceId.trim());
        await updateTaskStatus(resourceId.trim(), {
          status,
          version: Number(current.version || 1),
          statusReason: reason.trim() || undefined,
          progress: status === 'done' ? 100 : undefined,
        });
        resultId = resourceId.trim();
      } else if (type === 'delete_task') {
        if (!resourceId.trim()) throw new Error('请填写任务编号 TASK-xxx。');
        await deleteTask(resourceId.trim());
        resultId = resourceId.trim();
      } else {
        throw new Error(`暂不支持的操作类型：${type}`);
      }

      setDoneId(resultId);
      onDone?.({
        type,
        id: resultId,
        label: ACTION_LABELS[type] || type,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  function openResult() {
    if (!doneId) return;
    if (kind === 'requirement') navigateTo('requirements', { focus: doneId });
    else if (kind === 'defect') navigateTo('testing', { tab: 'defects', focus: doneId });
    else if (kind === 'task') navigateTo('projects', projectId ? { focus: projectId } : undefined);
  }

  if (doneId) {
    return (
      <div className="ai-action-card ai-action-card-success">
        <div className="ai-action-card-title">{ACTION_LABELS[String(action.type)] || '操作'}已完成</div>
        <div className="body-text">
          对象：<span className="text-mono">{doneId}</span>
        </div>
        <div className="ai-action-card-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={openResult}>
            打开详情
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ai-action-card ${isDelete ? 'ai-action-card-danger' : ''}`}>
      <div className="ai-action-card-title">{ACTION_LABELS[String(action.type)] || String(action.type)}（需确认）</div>
      <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        AI 只生成草稿；确认后才会调用正式业务接口写入。
      </div>
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}

      {!isCreate ? (
        <div className="form-group">
          <label className="form-label">对象编号</label>
          <input
            className="form-input"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            placeholder={kind === 'requirement' ? 'REQ-xxx' : kind === 'defect' ? 'BUG-xxx' : 'TASK-xxx'}
            disabled={!canWrite || submitting}
          />
        </div>
      ) : null}

      {(isCreate || isUpdate) && !isStatus ? (
        <>
          <div className="form-group">
            <label className="form-label">标题</label>
            <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite || submitting} />
          </div>
          {isCreate || kind !== 'task' ? (
            <div className="form-group">
              <label className="form-label">项目</label>
              <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!canWrite || submitting || !isCreate}>
                <option value="">请选择项目</option>
                {liveProjects.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
                ))}
              </select>
            </div>
          ) : null}
        </>
      ) : null}

      {isStatus ? (
        <div className="form-group">
          <label className="form-label">目标状态</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canWrite || submitting}>
            <option value="">请选择</option>
            {(kind === 'requirement' ? REQUIREMENT_STATUSES : kind === 'defect' ? DEFECT_STATUSES : TASK_STATUSES).map((item) => (
              <option key={item} value={item}>
                {labelOf(
                  kind === 'requirement'
                    ? REQUIREMENT_STATUS_LABELS
                    : kind === 'defect'
                      ? DEFECT_STATUS_LABELS
                      : TASK_STATUS_LABELS,
                  item,
                )}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {kind === 'requirement' && (isCreate || isUpdate) ? (
        <>
          <div className="form-group">
            <label className="form-label">优先级</label>
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canWrite || submitting}>
              {REQUIREMENT_PRIORITIES.map((item) => (
                <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite || submitting} />
          </div>
          <div className="form-group">
            <label className="form-label">验收标准（每行一条）</label>
            <textarea className="form-textarea" rows={2} value={criteria} onChange={(e) => setCriteria(e.target.value)} disabled={!canWrite || submitting} />
          </div>
        </>
      ) : null}

      {kind === 'defect' && (isCreate || isUpdate) ? (
        <>
          <div className="form-group">
            <label className="form-label">严重级别</label>
            <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={!canWrite || submitting}>
              {DEFECT_SEVERITIES.map((item) => (
                <option key={item} value={item}>{labelOf(DEFECT_SEVERITY_LABELS, item)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite || submitting} />
          </div>
        </>
      ) : null}

      {kind === 'task' && (isCreate || isUpdate) ? (
        <>
          {isCreate ? (
            <div className="form-group">
              <label className="form-label">项目</label>
              <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!canWrite || submitting}>
                <option value="">请选择项目</option>
                {liveProjects.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">任务类型</label>
              <select className="form-select" value={taskType} onChange={(e) => setTaskType(e.target.value)} disabled={!canWrite || submitting}>
                {TASK_TYPES.map((item) => (
                  <option key={item} value={item}>{labelOf(TASK_TYPE_LABELS, item)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">预估工时</label>
              <input className="form-input" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} disabled={!canWrite || submitting} />
            </div>
          </div>
        </>
      ) : null}

      {(isCreate || isUpdate) && (kind === 'requirement' || kind === 'defect' || kind === 'task') ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{kind === 'task' ? '负责人' : '执行人/处理人'}</label>
            <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canWrite || submitting} />
          </div>
          {kind !== 'task' ? (
            <div className="form-group">
              <label className="form-label">角色</label>
              <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)} disabled={!canWrite || submitting || !assignee.trim()}>
                <option value="dev">开发</option>
                <option value="qa">测试</option>
              </select>
            </div>
          ) : <div />}
        </div>
      ) : null}

      {isStatus && kind === 'task' ? (
        <div className="form-group">
          <label className="form-label">状态备注（可选）</label>
          <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!canWrite || submitting} />
        </div>
      ) : null}

      {isDelete ? (
        <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          删除不可恢复，请确认编号正确。
        </div>
      ) : null}

      <div className="ai-action-card-toolbar">
        <button
          type="button"
          className={`btn btn-sm ${isDelete ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => { void execute(); }}
          disabled={!canWrite || submitting}
        >
          {submitting ? '执行中…' : isDelete ? '确认删除' : '确认执行'}
        </button>
        {!canWrite ? <span className="text-secondary" style={{ fontSize: 12 }}>当前角色无权写入该资源。</span> : null}
      </div>
    </div>
  );
}
