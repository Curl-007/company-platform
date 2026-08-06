import { useState } from 'react';
import {
  createProjectDecision,
  createProjectRisk,
  fetchProjectDecisions,
  fetchProjectMembers,
  fetchProjectRisks,
  type CreateProjectDecisionInput,
  type CreateProjectRiskInput,
  type UpdateProjectRiskInput,
  updateProjectRisk,
} from '../api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { ProjectDecision, ProjectMember, ProjectRisk } from '../../../types';

interface GovernanceTabProps {
  projectId: string;
  canManageProject: boolean;
  onProjectReload: () => void;
}

export default function GovernanceTab({ projectId, canManageProject, onProjectReload }: GovernanceTabProps) {
  const risksAsync = useAsync<ProjectRisk[]>(() => fetchProjectRisks(projectId), [projectId], { cacheKey: 'projects:risks' });
  const decisionsAsync = useAsync<ProjectDecision[]>(() => fetchProjectDecisions(projectId), [projectId], { cacheKey: 'projects:decisions' });
  const membersAsync = useAsync<ProjectMember[]>(() => fetchProjectMembers(projectId), [projectId], { cacheKey: 'projects:members' });
  const [creatingRisk, setCreatingRisk] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null);
  const [creatingDecision, setCreatingDecision] = useState(false);

  function refreshGovernance() {
    void risksAsync.reload();
    void decisionsAsync.reload();
    onProjectReload();
  }

  const risks = risksAsync.data ?? [];
  const decisions = decisionsAsync.data ?? [];
  const openRisks = risks.filter((item) => item.status === 'open' || item.status === 'monitoring').length;
  const highRisks = risks.filter((item) => item.severity === 'high' || item.severity === 'critical').length;

  return (
    <div className="pd-tab pd-gov-tab">
      <section className="pd-gov-summary">
        <div className="pd-gov-stat">
          <span>风险总数</span>
          <strong>{risks.length}</strong>
        </div>
        <div className={`pd-gov-stat ${openRisks > 0 ? 'is-risk' : ''}`}>
          <span>未关闭</span>
          <strong>{openRisks}</strong>
        </div>
        <div className={`pd-gov-stat ${highRisks > 0 ? 'is-warning' : ''}`}>
          <span>高严重</span>
          <strong>{highRisks}</strong>
        </div>
        <div className="pd-gov-stat">
          <span>决策</span>
          <strong>{decisions.length}</strong>
        </div>
      </section>

      <div className="pd-gov-grid">
        <Panel
          title="项目风险"
          subtitle="责任人 · 缓解计划 · 关闭依据"
          className="pd-gov-panel"
          noPadding
          toolbar={canManageProject ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreatingRisk(true)}>登记风险</button>
          ) : undefined}
        >
          {risksAsync.loading ? (
            <div className="pd-empty pd-empty-pad">正在加载风险…</div>
          ) : risksAsync.error ? (
            <div className="form-error pd-empty-pad">{risksAsync.error}</div>
          ) : risks.length ? (
            <div className="pd-gov-list">
              {risks.map((risk) => (
                <article key={risk.id} className="pd-gov-item">
                  <div className="pd-gov-item-head">
                    <strong className="truncate" title={risk.title}>{risk.title}</strong>
                    <div className="pd-gov-item-actions">
                      <StatusBadge status={risk.severity} label={`${risk.severity} · ${risk.status}`} />
                      {canManageProject ? (
                        <button className="btn btn-secondary btn-xs" onClick={() => setEditingRisk(risk)}>编辑</button>
                      ) : null}
                    </div>
                  </div>
                  <div className="pd-gov-item-meta">
                    <span>{risk.ownerName || '未指定责任人'}</span>
                    {risk.dueDate ? <span>截止 {risk.dueDate}</span> : null}
                  </div>
                  {risk.mitigationPlan ? <p className="pd-gov-item-note">{risk.mitigationPlan}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="pd-empty pd-empty-pad">暂无风险记录</div>
          )}
        </Panel>

        <Panel
          title="项目决策"
          subtitle="关键取舍与最终结论"
          className="pd-gov-panel"
          noPadding
          toolbar={canManageProject ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreatingDecision(true)}>记录决策</button>
          ) : undefined}
        >
          {decisionsAsync.loading ? (
            <div className="pd-empty pd-empty-pad">正在加载决策…</div>
          ) : decisionsAsync.error ? (
            <div className="form-error pd-empty-pad">{decisionsAsync.error}</div>
          ) : decisions.length ? (
            <div className="pd-gov-list">
              {decisions.map((decision) => (
                <article key={decision.id} className="pd-gov-item">
                  <div className="pd-gov-item-head">
                    <strong className="truncate" title={decision.title}>{decision.title}</strong>
                    <StatusBadge status={decision.status} label={decision.status} />
                  </div>
                  <p className="pd-gov-item-note">{decision.decision || decision.context || '尚未记录结论'}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="pd-empty pd-empty-pad">暂无决策记录</div>
          )}
        </Panel>
      </div>

      {creatingRisk && canManageProject ? (
        <ProjectRiskForm
          projectId={projectId}
          members={membersAsync.data ?? []}
          onClose={() => setCreatingRisk(false)}
          onSaved={() => {
            setCreatingRisk(false);
            refreshGovernance();
          }}
        />
      ) : null}
      {editingRisk && canManageProject ? (
        <ProjectRiskForm
          projectId={projectId}
          risk={editingRisk}
          members={membersAsync.data ?? []}
          onClose={() => setEditingRisk(null)}
          onSaved={() => {
            setEditingRisk(null);
            refreshGovernance();
          }}
        />
      ) : null}
      {creatingDecision && canManageProject ? (
        <ProjectDecisionForm
          projectId={projectId}
          onClose={() => setCreatingDecision(false)}
          onSaved={() => {
            setCreatingDecision(false);
            refreshGovernance();
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectRiskForm({
  projectId,
  risk,
  members,
  onClose,
  onSaved,
}: {
  projectId: string;
  risk?: ProjectRisk;
  members: ProjectMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(risk?.title ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [severity, setSeverity] = useState<ProjectRisk['severity']>(risk?.severity ?? 'medium');
  const [status, setStatus] = useState<ProjectRisk['status']>(risk?.status ?? 'open');
  const [ownerId, setOwnerId] = useState(risk?.ownerId ?? '');
  const [mitigationPlan, setMitigationPlan] = useState(risk?.mitigationPlan ?? '');
  const [dueDate, setDueDate] = useState(risk?.dueDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入风险标题。');
    if ((severity === 'high' || severity === 'critical') && !ownerId) {
      return setFormError('高风险和严重风险必须指定项目成员作为责任人。');
    }
    const owner = members.find((member) => member.userId === ownerId);
    const input = {
      title: title.trim(),
      description: description.trim(),
      severity,
      status,
      ownerId: ownerId || undefined,
      ownerName: owner?.userName ?? '',
      mitigationPlan: mitigationPlan.trim(),
      dueDate: dueDate || undefined,
    };
    setSubmitting(true);
    try {
      if (risk) await updateProjectRisk(projectId, risk.id, input as UpdateProjectRiskInput);
      else await createProjectRisk(projectId, input as CreateProjectRiskInput);
      onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '保存风险失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={risk ? '编辑风险' : '登记风险'}>
      <Panel title={risk ? '编辑项目风险' : '登记项目风险'} subtitle="风险记录用于交付治理，不用于自动绩效评分。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">风险标题</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">风险描述</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">严重程度</label>
            <select className="form-select" value={severity} onChange={(event) => setSeverity(event.target.value as ProjectRisk['severity'])}>
              {['low', 'medium', 'high', 'critical'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">处理状态</label>
            <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value as ProjectRisk['status'])}>
              {['open', 'monitoring', 'mitigated', 'closed'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">责任人{severity === 'high' || severity === 'critical' ? '（必填）' : ''}</label>
            <select className="form-select" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">未指定</option>
              {members.filter((member) => member.userId).map((member) => (
                <option key={member.id} value={member.userId ?? ''}>{member.userName} · {member.role}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">目标关闭日期</label>
            <input className="form-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">缓解计划 / 关闭依据</label>
          <textarea className="form-textarea" rows={3} value={mitigationPlan} onChange={(event) => setMitigationPlan(event.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function ProjectDecisionForm({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [decision, setDecision] = useState('');
  const [status, setStatus] = useState<CreateProjectDecisionInput['status']>('proposed');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入决策标题。');
    setSubmitting(true);
    try {
      await createProjectDecision(projectId, {
        title: title.trim(),
        context: context.trim(),
        decision: decision.trim(),
        status,
      });
      onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '记录决策失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel="记录决策">
      <Panel title="记录项目决策" subtitle="决策创建后保留原始记录；后续变更应另行记录新的决策。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-group">
          <label className="form-label">决策标题</label>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">上下文与备选方案</label>
          <textarea className="form-textarea" rows={3} value={context} onChange={(event) => setContext(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">决策结论</label>
          <textarea className="form-textarea" rows={3} value={decision} onChange={(event) => setDecision(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">状态</label>
          <select
            className="form-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as CreateProjectDecisionInput['status'])}
          >
            {['proposed', 'approved', 'rejected', 'superseded'].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? '保存中…' : '保存决策'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
