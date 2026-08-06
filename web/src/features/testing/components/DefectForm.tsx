import { useState } from 'react';
import { Save, X } from 'lucide-react';
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
import StatusBadge from '../../../components/common/StatusBadge';
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
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
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
        version: item?.version ?? 1,
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
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={mode === 'create' ? '新建缺陷' : '编辑缺陷'}>
      <Panel
        className="qa-form-panel"
        title={mode === 'create' ? '新建缺陷' : '编辑缺陷'}
        subtitle={item?.id ?? '支持测试指派开发修复，开发再指回测试验证'}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label="关闭">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="qa-form-body">
          {formError ? <div className="form-error qa-form-error">{formError}</div> : null}

          {canUseAi && item ? (
            <BusinessAdvicePanel
              targetType="defect"
              targetId={item.id}
              title="AI 缺陷分析"
              description="基于缺陷、关联需求、关联构建和修复任务生成。"
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

          {mode === 'edit' && item ? (
            <div className="qa-form-summary">
              <StatusBadge status={item.severity} label={labelOf(DEFECT_SEVERITY_LABELS, item.severity)} showDot={false} />
              <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} />
              {item.requirementId ? <span className="qa-form-summary-meta">关联 {item.requirementId}</span> : null}
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label">缺陷标题</label>
            <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句话描述问题现象" />
          </div>

          <div className="qa-form-grid">
            <div className="form-group">
              <label className="form-label">所属项目</label>
              <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">请选择项目</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">严重级别</label>
              <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {DEFECT_SEVERITIES.map((value) => (
                  <option key={value} value={value}>{labelOf(DEFECT_SEVERITY_LABELS, value)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">当前处理人</label>
              <input
                className="form-input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="测试可指派开发，开发可指回测试"
              />
            </div>
            <div className="form-group">
              <label className="form-label">处理角色</label>
              <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
                <option value="dev">开发修复</option>
                <option value="qa">测试验证</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {DEFECT_STATUSES.map((value) => (
                  <option key={value} value={value}>{labelOf(DEFECT_STATUS_LABELS, value)}</option>
                ))}
              </select>
            </div>
            <div className="form-group qa-form-spacer" aria-hidden="true" />
          </div>

          <div className="form-group">
            <label className="form-label">缺陷描述</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="复现步骤、期望结果、实际结果、环境信息"
            />
          </div>

          <div className="qa-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting}>
              <Save size={14} aria-hidden="true" />
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
