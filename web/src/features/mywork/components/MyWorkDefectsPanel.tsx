import { useEffect, useMemo, useState } from 'react';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canAccessPageForUser, canOperate } from '../../../constants/roles';
import { getSessionUser } from '../../../services/auth';
import { ApiError } from '../../../services/api';
import { useToast } from '../../../components/common/Toast';
import { navigateTo } from '../../team/components/teamMeta';
import { fetchProjectMembers } from '../../projects/api';
import { handoffDefect } from '../../testing/api';
import type { DashboardData, ProjectMember } from '../../../types';

type DefectItem = NonNullable<DashboardData['myDefects']>[number];

export default function MyWorkDefectsPanel({
  defects,
  onChanged,
}: {
  defects: DefectItem[];
  onChanged?: () => void;
}) {
  const toast = useToast();
  const sessionUser = getSessionUser();
  const role = String(sessionUser?.role || '').toLowerCase();
  const canOpenTesting = canAccessPageForUser(sessionUser, 'testing');
  const canManageDefect = canOperate(sessionUser, 'testing:manage') || role === 'dev' || role === 'qa' || role === 'pm' || role === 'admin';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = defects.find((item) => item.id === selectedId) ?? defects[0] ?? null;
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [targetName, setTargetName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defects.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !defects.some((item) => item.id === selectedId)) {
      setSelectedId(defects[0].id);
    }
  }, [defects, selectedId]);

  useEffect(() => {
    let cancelled = false;
    if (!selected?.projectId) {
      setMembers([]);
      return;
    }
    fetchProjectMembers(selected.projectId)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.projectId, selected?.id]);

  const devMembers = useMemo(
    () => members.filter((m) => String(m.role).toLowerCase() === 'dev'),
    [members],
  );
  const qaMembers = useMemo(
    () => members.filter((m) => String(m.role).toLowerCase() === 'qa'),
    [members],
  );

  // QA finds issue → assign DEV to fix; DEV fixed → assign QA to verify
  const canAssignToDev = Boolean(
    selected
    && canManageDefect
    && !['closed', 'rejected'].includes(selected.status)
    && (role === 'qa' || role === 'pm' || role === 'admin' || selected.assignee === sessionUser?.name),
  );
  const canAssignToQa = Boolean(
    selected
    && canManageDefect
    && ['in_fix', 'resolved', 'new', 'confirmed'].includes(selected.status)
    && (role === 'dev' || role === 'pm' || role === 'admin' || selected.assignee === sessionUser?.name),
  );

  useEffect(() => {
    if (!selected) {
      setTargetName('');
      return;
    }
    if (canAssignToDev && role === 'qa') {
      setTargetName(devMembers[0]?.userName || '');
    } else if (canAssignToQa && role === 'dev') {
      setTargetName(qaMembers[0]?.userName || '');
    } else if (canAssignToDev) {
      setTargetName(devMembers[0]?.userName || '');
    } else if (canAssignToQa) {
      setTargetName(qaMembers[0]?.userName || '');
    } else {
      setTargetName('');
    }
  }, [selected?.id, selected?.status, canAssignToDev, canAssignToQa, role, devMembers, qaMembers]);

  function openInTesting(id: string) {
    navigateTo('testing', { tab: 'defects', focus: id });
  }

  async function reassign(toRole: 'dev' | 'qa') {
    if (!selected) return;
    if (!targetName.trim()) {
      toast.error(toRole === 'dev' ? '请选择开发工程师' : '请选择测试工程师');
      return;
    }
    setSubmitting(true);
    try {
      await handoffDefect(selected.id, {
        action: toRole === 'dev' ? 'assign_to_dev' : 'assign_to_qa',
        assignee: targetName.trim(),
      });
      toast.success(toRole === 'dev' ? '已指派开发工程师修复' : '已指派测试工程师验证');
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '缺陷指派失败');
    } finally {
      setSubmitting(false);
    }
  }

  const assignOptions = role === 'qa' || (canAssignToDev && !canAssignToQa)
    ? devMembers
    : role === 'dev' || (canAssignToQa && !canAssignToDev)
      ? qaMembers
      : [...devMembers, ...qaMembers];

  return (
    <div className="mywork-split">
      <Panel title="我的缺陷" subtitle={`共 ${defects.length} 条`} className="mywork-panel-left">
        <div className="mywork-queue">
          {defects.map((item) => (
            <div
              key={item.id}
              className={`mywork-queue-item ${selected?.id === item.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(item.id);
                }
              }}
            >
              <div className="mywork-queue-item-main">
                <span className="mywork-queue-item-title">{item.title}</span>
                <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} showDot={false} />
              </div>
              <div className="mywork-queue-item-meta">
                <span>{item.id}</span>
                <span>{labelOf(DEFECT_SEVERITY_LABELS, item.severity)}</span>
              </div>
            </div>
          ))}
          {defects.length === 0 ? <div className="empty-state-desc">当前没有指派给你的缺陷。</div> : null}
        </div>
      </Panel>

      <Panel
        title="缺陷详情"
        className="mywork-panel-center"
        toolbar={
          selected && canOpenTesting ? (
            <button className="btn btn-secondary btn-sm" onClick={() => openInTesting(selected.id)}>
              打开完整详情
            </button>
          ) : undefined
        }
      >
        {selected ? (
          <div className="mywork-detail">
            <div className="mywork-detail-header">
              <div>
                <h3>{selected.title}</h3>
                <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                  {selected.id} · 项目 {selected.projectId}
                </div>
              </div>
              <StatusBadge status={selected.status} label={labelOf(DEFECT_STATUS_LABELS, selected.status)} />
            </div>
            <div className="mywork-detail-meta">
              <div className="detail-field">
                <span className="detail-label">严重级别</span>
                <span className="detail-value">{labelOf(DEFECT_SEVERITY_LABELS, selected.severity)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">处理人</span>
                <span className="detail-value">{selected.assignee || '未分配'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">报告人</span>
                <span className="detail-value">{selected.reporter || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">关联需求</span>
                <span className="detail-value text-mono">{selected.requirementId || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">发现构建</span>
                <span className="detail-value text-mono">{selected.foundInBuild || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">影响版本</span>
                <span className="detail-value">{selected.affectedVersion || '-'}</span>
              </div>
            </div>
            {selected.description ? (
              <div className="detail-field" style={{ marginTop: 12 }}>
                <span className="detail-label">描述</span>
                <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</div>
              </div>
            ) : (
              <div className="body-text" style={{ marginTop: 12 }}>暂无缺陷描述。</div>
            )}

            {(canAssignToDev || canAssignToQa) ? (
              <div className="mywork-handoff" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <div className="detail-label" style={{ marginBottom: 8 }}>
                  {role === 'qa' || (canAssignToDev && !canAssignToQa)
                    ? '测试发现问题 → 指派开发修复'
                    : '开发修复完成 → 指派测试验证'}
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">指派给</label>
                  {assignOptions.length > 0 ? (
                    <select
                      className="form-select"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">请选择</option>
                      {assignOptions.map((m) => (
                        <option key={m.id} value={m.userName}>
                          {m.userName}（{m.role}）
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="form-input"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      placeholder="输入处理人姓名"
                      disabled={submitting}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canAssignToDev ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={submitting}
                      onClick={() => void reassign('dev')}
                    >
                      {submitting ? '提交中…' : '指派开发修复'}
                    </button>
                  ) : null}
                  {canAssignToQa ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={submitting}
                      onClick={() => void reassign('qa')}
                    >
                      {submitting ? '提交中…' : '指派测试验证'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!canOpenTesting ? (
              <div className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>
                当前角色无「测试质量」页面权限时，可在此查看指派给你的缺陷摘要。
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-state-desc">请选择左侧缺陷查看详情。</div>
        )}
      </Panel>
    </div>
  );
}
