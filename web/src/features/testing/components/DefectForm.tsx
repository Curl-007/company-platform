import { useState } from 'react';
import {
  createDefect,
  updateDefect,
  type UpdateDefectInput,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import type { Defect, Project } from '../../../types';
import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

export default function DefectForm({
  mode,
  item,
  onClose,
  onDone,
  canUseAi = false,
}: {
  mode: 'create' | 'edit';
  item?: Defect | null;
  onClose: () => void;
  onDone: () => void;
  canUseAi?: boolean;
}) {
  const { data: projects } = useAsync<Project[]>(fetchProjects, []);
  const [title, setTitle] = useState(item?.title ?? '');
  const [projectId, setProjectId] = useState(item?.projectId ?? '');
  const [severity, setSeverity] = useState(item?.severity ?? 'medium');
  const [status, setStatus] = useState(item?.status ?? 'new');
  const [assignee, setAssignee] = useState(item?.assignee ?? '');
  const [assigneeRole, setAssigneeRole] = useState(item?.assigneeRole ?? 'dev');
  const [description, setDescription] = useState(item?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) return setFormError('请输入缺陷标题。');
    if (!projectId) return setFormError('请选择所属项目。');
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: UpdateDefectInput & { title: string; projectId?: string; severity: string; assigneeRole: string } = {
        title: title.trim(),
        projectId,
        severity,
        status,
        assignee: assignee.trim() || undefined,
        assigneeRole,
        description: description.trim() || undefined,
      };
      if (mode === 'create') await createDefect({ ...payload, projectId });
      else if (item) await updateDefect(item.id, payload);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : `${mode === 'create' ? '创建' : '更新'}缺陷失败`);
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={mode === 'create' ? '新建缺陷' : '编辑缺陷'} subtitle={item?.id ?? '支持测试指派开发修复，开发再指回测试验证'}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        {canUseAi && item ? (
          <BusinessAdvicePanel
            targetType="defect"
            targetId={item.id}
            title="AI 缺陷分析"
            description="基于后端缺陷、关联需求、关联构建和修复任务生成。"
            buttonText="AI 分析缺陷"
            question="请分析该缺陷的修复优先级、验证风险、责任协作和下一步动作。"
            draft={() => ({
              title: title.trim(),
              severity,
              status,
              assignee: assignee.trim() || null,
              assigneeRole,
              description: description.trim(),
            })}
          />
        ) : null}
        <div className="form-group">
          <label className="form-label">缺陷标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">所属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">请选择项目</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">严重级别</label>
            <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {DEFECT_SEVERITIES.map((value) => <option key={value} value={value}>{labelOf(DEFECT_SEVERITY_LABELS, value)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">当前处理人</label>
            <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="测试可指派给开发，开发可再指回测试" />
          </div>
          <div className="form-group">
            <label className="form-label">处理角色</label>
            <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
              <option value="dev">开发修复</option>
              <option value="qa">测试验证</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">状态</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {DEFECT_STATUSES.map((value) => <option key={value} value={value}>{labelOf(DEFECT_STATUS_LABELS, value)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">缺陷描述</label>
          <textarea className="form-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
