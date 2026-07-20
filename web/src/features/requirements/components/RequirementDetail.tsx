import { useState } from 'react';
import { fetchAiBusinessAdvice } from '../../ai/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import type { AiBusinessAdvice, Project, Requirement } from '../../../types';
import {
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';
import { updateRequirement, updateRequirementStatus } from '../api';

const ASSIGNMENT_STATUS_OPTIONS = [
  { value: 'unassigned', label: '待分配' },
  { value: 'assigned', label: '已分配' },
  { value: 'in_progress', label: '处理中' },
  { value: 'ready_for_test', label: '提测中' },
  { value: 'verified', label: '已验证' },
];

const EXEC_ROLE_OPTIONS = [
  { value: 'dev', label: '开发' },
  { value: 'qa', label: '测试' },
];

interface RequirementDetailProps {
  requirement: Requirement;
  projects: Project[];
  allRequirements: Requirement[];
  canManage: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function AdviceList({ title, items }: { title: string; items?: string[] }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="requirement-ai-advice-block">
      <strong>{title}</strong>
      <ul>{list.map((item) => <li key={`${title}-${item}`}>{item}</li>)}</ul>
    </div>
  );
}

export default function RequirementDetail({ requirement, projects, allRequirements, onClose, onUpdated, canManage }: RequirementDetailProps) {
  const [title, setTitle] = useState(requirement.title);
  const [description, setDescription] = useState(requirement.description ?? '');
  const [priority, setPriority] = useState(requirement.priority);
  const [status, setStatus] = useState(requirement.status);
  const [assignee, setAssignee] = useState(requirement.assignee ?? '');
  const [assigneeRole, setAssigneeRole] = useState(requirement.assigneeRole ?? 'dev');
  const [assignmentStatus, setAssignmentStatus] = useState(requirement.assignmentStatus ?? (requirement.assignee ? 'assigned' : 'unassigned'));
  const [completion, setCompletion] = useState(String(requirement.completion ?? 0));
  const [criteria, setCriteria] = useState((requirement.acceptanceCriteria ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiAdvice, setAiAdvice] = useState<AiBusinessAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const projectName = projects.find((item) => item.id === requirement.projectId)?.name ?? requirement.projectId;
  const childCount = allRequirements.filter((item) => item.parentId === requirement.id).length;
  const canUseAi = canOperate(getSessionUser(), 'ai:analyze');

  async function handleSave() {
    if (!canManage) return setFormError('当前账号无权更新需求。');
    setSubmitting(true);
    setFormError(null);
    try {
      let version = requirement.version;
      if (status !== requirement.status) {
        const statusUpdated = await updateRequirementStatus(requirement.id, status, version);
        version = statusUpdated.version;
      }
      await updateRequirement(requirement.id, {
        version,
        title: title.trim(),
        description: description.trim(),
        priority,
        assignee: assignee.trim() || null,
        assigneeRole: assignee.trim() ? assigneeRole : null,
        assignmentStatus,
        completion: Number(completion) || 0,
        acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
      });
      onUpdated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '更新需求失败');
      setSubmitting(false);
    }
  }

  async function handleAiAdvice() {
    setAiError(null);
    setAiLoading(true);
    try {
      const advice = await fetchAiBusinessAdvice({
        targetType: 'requirement',
        targetId: requirement.id,
        question: '请结合需求、任务、测试、缺陷和当前编辑草稿，给出需求拆解、验收补强、协作风险和下一步动作。',
        draft: {
          title: title.trim() || requirement.title,
          description: description.trim(), status, priority,
          assignee: assignee.trim() || null,
          assigneeRole: assignee.trim() ? assigneeRole : null,
          assignmentStatus, completion: Number(completion) || 0,
          acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
        },
      });
      setAiAdvice(advice);
    } catch (error) {
      setAiError(error instanceof ApiError ? error.message : 'AI 需求分析生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={requirement.title} subtitle={`${requirement.id} · ${projectName}`} toolbar={canUseAi ? (
        <button className="btn btn-primary btn-sm" onClick={handleAiAdvice} disabled={aiLoading}>{aiLoading ? 'AI 分析中...' : 'AI 需求分析'}</button>
      ) : undefined}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        {(aiAdvice || aiLoading || aiError) ? (
          <section className="requirement-ai-advice-panel">
            <div className="requirement-ai-advice-head"><div><div className="section-title">{aiAdvice?.title || 'AI 需求分析'}</div><div className="body-text">基于后端真实需求、任务、测试、缺陷和当前编辑草稿生成。{aiAdvice?.modelUsed ? ` · ${aiAdvice.modelUsed}` : ''}{aiAdvice?.fallback ? ' · 规则兜底' : ''}</div></div>
              {aiAdvice ? <button className="btn btn-secondary btn-xs" onClick={handleAiAdvice} disabled={aiLoading}>重新分析</button> : null}
            </div>
            {aiLoading ? <div className="body-text">AI 正在分析需求拆解、验收口径和交付风险，请稍候...</div> : null}
            {aiError ? <div className="form-error">{aiError}</div> : null}
            {aiAdvice ? <div className="requirement-ai-advice-content"><p>{aiAdvice.summary}</p><AdviceList title="风险" items={aiAdvice.risks} /><AdviceList title="建议" items={aiAdvice.suggestions} /><AdviceList title="下一步" items={aiAdvice.nextActions} /><AdviceList title="缺少信息" items={aiAdvice.missingInfo} /></div> : null}
          </section>
        ) : null}
        <div className="detail-grid" style={{ marginBottom: 16 }}>
          <div className="detail-field"><span className="detail-label">需求负责人</span><span>{requirement.owner || '-'}</span></div>
          <div className="detail-field"><span className="detail-label">当前执行人</span><span>{requirement.assignee || '未分配'}</span></div>
          <div className="detail-field"><span className="detail-label">执行角色</span><span>{requirement.assigneeRole ? labelOf(USER_ROLE_LABELS, requirement.assigneeRole) : '未设置'}</span></div>
          <div className="detail-field"><span className="detail-label">关联子需求</span><span>{childCount}</span></div>
        </div>
        <div className="form-group"><label className="form-label">需求标题</label><input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canManage} /></div>
        <div className="form-row"><div className="form-group"><label className="form-label">状态</label><select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)} disabled={!canManage}>{REQUIREMENT_STATUSES.map((item) => <option key={item} value={item}>{labelOf(REQUIREMENT_STATUS_LABELS, item)}</option>)}</select></div><div className="form-group"><label className="form-label">优先级</label><select className="form-select" value={priority} onChange={(event) => setPriority(event.target.value)} disabled={!canManage}>{REQUIREMENT_PRIORITIES.map((item) => <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>)}</select></div></div>
        <div className="form-row"><div className="form-group"><label className="form-label">执行人</label><input className="form-input" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!canManage} /></div><div className="form-group"><label className="form-label">执行角色</label><select className="form-select" value={assigneeRole} onChange={(event) => setAssigneeRole(event.target.value)} disabled={!canManage}>{EXEC_ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
        <div className="form-row"><div className="form-group"><label className="form-label">指派状态</label><select className="form-select" value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)} disabled={!canManage}>{ASSIGNMENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="form-group"><label className="form-label">完成度</label><input className="form-input" type="number" min={0} max={100} value={completion} onChange={(event) => setCompletion(event.target.value)} disabled={!canManage} /></div></div>
        <div className="form-group"><label className="form-label">需求描述</label><textarea className="form-textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canManage} /></div>
        <div className="form-group"><label className="form-label">验收标准</label><textarea className="form-textarea" rows={4} value={criteria} onChange={(event) => setCriteria(event.target.value)} disabled={!canManage} /></div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>{canManage ? <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button> : null}</div>
      </Panel>
    </Overlay>
  );
}
