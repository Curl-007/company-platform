import { useEffect, useMemo, useState } from 'react';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import {
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canAccessPageForUser } from '../../../constants/roles';
import { getSessionUser } from '../../../services/auth';
import { ApiError } from '../../../services/api';
import { useToast } from '../../../components/common/Toast';
import { navigateTo } from '../../team/components/teamMeta';
import { fetchProjectMembers } from '../../projects/api';
import { handoffTask, type TaskHandoffAction } from '../../tasks/api';
import type { ProjectMember, StatusHistoryEntry, Task } from '../../../types';

export type TaskFilter = 'all' | 'requirement' | 'test_case' | 'defect' | 'general';

export type TaskFilterCounts = {
  all: number;
  requirement: number;
  test_case: number;
  defect: number;
  general: number;
};

export default function MyWorkTaskWorkspace({
  taskFilter,
  onTaskFilterChange,
  filterCounts,
  visibleTasks,
  selectedTask,
  onSelectTask,
  historyLoading,
  historyError,
  history,
  onHandoffDone,
}: {
  taskFilter: TaskFilter;
  onTaskFilterChange: (filter: TaskFilter) => void;
  filterCounts: TaskFilterCounts;
  visibleTasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (id: string) => void;
  historyLoading: boolean;
  historyError: unknown;
  history: StatusHistoryEntry[] | undefined;
  onHandoffDone?: () => void;
}) {
  const toast = useToast();
  const sessionUser = getSessionUser();
  const role = String(sessionUser?.role || '').toLowerCase();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [targetUserName, setTargetUserName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const projectId = selectedTask?.projectId;
    if (!projectId) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    fetchProjectMembers(projectId)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTask?.projectId, selectedTask?.id]);

  const qaMembers = useMemo(
    () => members.filter((m) => String(m.role).toLowerCase() === 'qa'),
    [members],
  );
  const devMembers = useMemo(
    () => members.filter((m) => String(m.role).toLowerCase() === 'dev'),
    [members],
  );

  const canSubmitForTesting = Boolean(
    selectedTask
    && ['in_progress', 'code_review'].includes(selectedTask.status)
    && (
      role === 'dev'
      || role === 'pm'
      || role === 'admin'
      || selectedTask.owner === sessionUser?.name
      || selectedTask.assigneeId === sessionUser?.id
    ),
  );

  const canReturnForFix = Boolean(
    selectedTask
    && ['testing', 'acceptance'].includes(selectedTask.status)
    && (
      role === 'qa'
      || role === 'pm'
      || role === 'admin'
      || selectedTask.owner === sessionUser?.name
      || selectedTask.assigneeId === sessionUser?.id
    ),
  );

  useEffect(() => {
    if (!selectedTask) {
      setTargetUserName('');
      setReason('');
      return;
    }
    if (canSubmitForTesting) {
      setTargetUserName(qaMembers[0]?.userName || '');
      setReason('开发完成，提交测试');
    } else if (canReturnForFix) {
      setTargetUserName(devMembers[0]?.userName || '');
      setReason('测试发现问题，打回开发修复');
    } else {
      setTargetUserName('');
      setReason('');
    }
  }, [selectedTask?.id, selectedTask?.status, canSubmitForTesting, canReturnForFix, qaMembers, devMembers]);

  async function runHandoff(action: TaskHandoffAction) {
    if (!selectedTask) return;
    if (!targetUserName.trim()) {
      toast.error(action === 'submit_for_testing' ? '请选择测试工程师' : '请选择开发工程师');
      return;
    }
    setSubmitting(true);
    try {
      const targetList = action === 'submit_for_testing' ? qaMembers : devMembers;
      const hit = targetList.find((m) => m.userName === targetUserName.trim());
      await handoffTask(selectedTask.id, {
        action,
        version: selectedTask.version,
        assignee: targetUserName.trim(),
        assigneeId: hit?.userId || undefined,
        reason: reason.trim() || undefined,
      });
      toast.success(action === 'submit_for_testing' ? '已提交测试并指派给测试工程师' : '已打回开发并指派给开发工程师');
      onHandoffDone?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '任务交接失败');
    } finally {
      setSubmitting(false);
    }
  }

  function openLinkedSource(task: Task) {
    const sourceId = task.sourceId || task.requirementId;
    if (!sourceId) return;
    if (task.sourceType === 'defect' && canAccessPageForUser(sessionUser, 'testing')) {
      navigateTo('testing', { tab: 'defects', focus: sourceId });
      return;
    }
    if (task.sourceType === 'test_case' && canAccessPageForUser(sessionUser, 'testing')) {
      navigateTo('testing', { tab: 'cases', focus: sourceId });
      return;
    }
    if ((task.sourceType === 'requirement' || task.requirementId) && canAccessPageForUser(sessionUser, 'requirements')) {
      navigateTo('requirements', { focus: sourceId });
      return;
    }
    if (task.projectId && canAccessPageForUser(sessionUser, 'projects')) {
      navigateTo('projects', { focus: task.projectId });
    }
  }

  const canOpenLinked = (task: Task) => {
    const sourceId = task.sourceId || task.requirementId;
    if (!sourceId && !task.projectId) return false;
    if (task.sourceType === 'defect' || task.sourceType === 'test_case') {
      return canAccessPageForUser(sessionUser, 'testing');
    }
    if (task.sourceType === 'requirement' || task.requirementId) {
      return canAccessPageForUser(sessionUser, 'requirements');
    }
    return canAccessPageForUser(sessionUser, 'projects');
  };

  function sourceLabel(task: Task) {
    if (task.sourceType === 'requirement') return '需求';
    if (task.sourceType === 'test_case') return '测试';
    if (task.sourceType === 'defect') return '缺陷';
    return '一般';
  }

  const filterButtons: Array<{ key: TaskFilter; label: string; count: number }> = [
    { key: 'all', label: '全部', count: filterCounts.all },
    { key: 'requirement', label: '需求任务', count: filterCounts.requirement },
    { key: 'test_case', label: '测试任务', count: filterCounts.test_case },
    { key: 'defect', label: '缺陷修复', count: filterCounts.defect },
    { key: 'general', label: '一般任务', count: filterCounts.general },
  ];

  const queueSubtitle =
    taskFilter === 'all'
      ? `共 ${visibleTasks.length} 条（需求 ${filterCounts.requirement} · 测试 ${filterCounts.test_case} · 缺陷 ${filterCounts.defect} · 一般 ${filterCounts.general}）`
      : `当前筛选 ${visibleTasks.length} 条`;

  const targetOptions = canSubmitForTesting ? qaMembers : canReturnForFix ? devMembers : [];

  return (
    <div className="mywork-tasks">
      <div className="mywork-task-filters">
        {filterButtons.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`btn btn-sm ${taskFilter === item.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onTaskFilterChange(item.key)}
          >
            {item.label}
            <span className="mywork-filter-count">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="mywork-panels">
        <Panel title="任务队列" subtitle={queueSubtitle} className="mywork-panel-left">
          <div className="mywork-queue">
            {taskFilter === 'all' ? (
              (['requirement', 'test_case', 'defect', 'general'] as const).map((bucket) => {
                const bucketTasks = visibleTasks.filter((task) => {
                  if (bucket === 'requirement') return task.sourceType === 'requirement';
                  if (bucket === 'test_case') return task.sourceType === 'test_case';
                  if (bucket === 'defect') return task.sourceType === 'defect';
                  return task.sourceType !== 'requirement' && task.sourceType !== 'test_case' && task.sourceType !== 'defect';
                });
                if (bucketTasks.length === 0) return null;
                const headerLabel =
                  bucket === 'requirement' ? '需求任务' :
                  bucket === 'test_case' ? '测试任务' :
                  bucket === 'defect' ? '缺陷修复' : '一般任务';
                const headerTone =
                  bucket === 'requirement' ? 'accent' :
                  bucket === 'test_case' ? 'info' :
                  bucket === 'defect' ? 'risk' : 'done';
                return (
                  <div key={bucket} className="mywork-queue-group">
                    <div className={`mywork-queue-group-header ${headerTone}`}>
                      <span>{headerLabel}</span>
                      <span>{bucketTasks.length}</span>
                    </div>
                    {bucketTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`mywork-queue-item ${selectedTask?.id === task.id ? 'selected' : ''}`}
                        onClick={() => onSelectTask(task.id)}
                      >
                        <div className="mywork-queue-item-main">
                          <span className="mywork-queue-item-title">{task.title}</span>
                          <StatusBadge status={task.status} label={labelOf(TASK_STATUS_LABELS, task.status)} showDot={false} />
                        </div>
                        <div className="mywork-queue-item-meta">
                          <span>{sourceLabel(task)} · {labelOf(TASK_TYPE_LABELS, task.type)}</span>
                          <span>{task.assigneeRole ? labelOf(USER_ROLE_LABELS, task.assigneeRole) : '未设角色'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
            ) : (
              visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className={`mywork-queue-item ${selectedTask?.id === task.id ? 'selected' : ''}`}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div className="mywork-queue-item-main">
                    <span className="mywork-queue-item-title">{task.title}</span>
                    <StatusBadge status={task.status} label={labelOf(TASK_STATUS_LABELS, task.status)} showDot={false} />
                  </div>
                  <div className="mywork-queue-item-meta">
                    <span>{sourceLabel(task)} · {labelOf(TASK_TYPE_LABELS, task.type)}</span>
                    <span>{task.assigneeRole ? labelOf(USER_ROLE_LABELS, task.assigneeRole) : '未设角色'}</span>
                  </div>
                </div>
              ))
            )}
            {visibleTasks.length === 0 ? <div className="empty-state-desc">当前筛选下暂无任务。</div> : null}
          </div>
        </Panel>

        <Panel
          title="任务详情"
          className="mywork-panel-center"
          toolbar={
            selectedTask && canOpenLinked(selectedTask) ? (
              <button className="btn btn-secondary btn-sm" onClick={() => openLinkedSource(selectedTask)}>
                打开关联详情
              </button>
            ) : undefined
          }
        >
          {selectedTask ? (
            <div className="mywork-detail">
              <div className="mywork-detail-header">
                <div>
                  <h3>{selectedTask.title}</h3>
                  <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                    来源：{sourceLabel(selectedTask)}
                    {selectedTask.sourceId ? ` · ${selectedTask.sourceId}` : ''}
                    {' · '}
                    {labelOf(TASK_TYPE_LABELS, selectedTask.type)}
                  </div>
                </div>
                <StatusBadge status={selectedTask.status} label={labelOf(TASK_STATUS_LABELS, selectedTask.status)} />
              </div>
              <div className="mywork-detail-meta">
                <div className="detail-field">
                  <span className="detail-label">负责人</span>
                  <span className="detail-value">{selectedTask.owner || '-'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">角色</span>
                  <span className="detail-value">{selectedTask.assigneeRole ? labelOf(USER_ROLE_LABELS, selectedTask.assigneeRole) : '未设置'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">关联编号</span>
                  <span className="detail-value text-mono">{selectedTask.sourceId || selectedTask.requirementId || '-'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">WBS</span>
                  <span className="detail-value text-mono">{selectedTask.wbsCode}</span>
                </div>
              </div>
              <div className="detail-field mywork-detail-progress">
                <span className="detail-label">当前进度</span>
                <ProgressBar percent={selectedTask.progress} />
              </div>
              {selectedTask.description ? (
                <div className="detail-field" style={{ marginTop: 8 }}>
                  <span className="detail-label">任务说明</span>
                  <div className="detail-value">{selectedTask.description}</div>
                </div>
              ) : null}

              {(canSubmitForTesting || canReturnForFix) ? (
                <div className="mywork-handoff" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                  <div className="detail-label" style={{ marginBottom: 8 }}>
                    {canSubmitForTesting ? '开发完成 → 指派测试' : '测试发现问题 → 指派开发修复'}
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{canSubmitForTesting ? '测试工程师' : '开发工程师'}</label>
                    {membersLoading ? (
                      <div className="body-text">加载项目成员…</div>
                    ) : targetOptions.length > 0 ? (
                      <select
                        className="form-select"
                        value={targetUserName}
                        onChange={(e) => setTargetUserName(e.target.value)}
                        disabled={submitting}
                      >
                        <option value="">请选择</option>
                        {targetOptions.map((m) => (
                          <option key={m.id} value={m.userName}>
                            {m.userName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        value={targetUserName}
                        onChange={(e) => setTargetUserName(e.target.value)}
                        placeholder={canSubmitForTesting ? '输入测试工程师姓名' : '输入开发工程师姓名'}
                        disabled={submitting}
                      />
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">说明</label>
                    <input
                      className="form-input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={submitting}
                      placeholder="交接说明（可选）"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canSubmitForTesting ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={submitting}
                        onClick={() => void runHandoff('submit_for_testing')}
                      >
                        {submitting ? '提交中…' : '提交测试'}
                      </button>
                    ) : null}
                    {canReturnForFix ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={submitting}
                        onClick={() => void runHandoff('return_for_fix')}
                      >
                        {submitting ? '提交中…' : '打回开发修复'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="detail-field" style={{ marginTop: 16 }}>
                <span className="detail-label">状态流转</span>
                {historyLoading ? (
                  <div className="body-text">正在加载状态历史…</div>
                ) : historyError ? (
                  <div className="form-error">状态历史加载失败，请稍后重试。</div>
                ) : history?.length ? (
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    {history.slice(0, 6).map((entry) => (
                      <div key={entry.id} className="text-secondary" style={{ fontSize: 13 }}>
                        {entry.fromStatus ? `${labelOf(TASK_STATUS_LABELS, entry.fromStatus)} → ` : ''}
                        {labelOf(TASK_STATUS_LABELS, entry.toStatus)}
                        {entry.actorName ? ` · ${entry.actorName}` : ''}
                        {entry.reason ? ` · ${entry.reason}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="body-text">暂无状态流转记录。</div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state-desc">请选择左侧任务查看详情。</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
