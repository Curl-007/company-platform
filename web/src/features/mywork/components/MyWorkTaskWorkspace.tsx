import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Inbox } from 'lucide-react';
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
import MyWorkEmptyPanel from './MyWorkEmptyPanel';

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
  const { t } = useTranslation();
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
      setReason(t('features.mywork.myWorkTaskWorkspace.reasonSubmitForTesting'));
    } else if (canReturnForFix) {
      setTargetUserName(devMembers[0]?.userName || '');
      setReason(t('features.mywork.myWorkTaskWorkspace.reasonReturnForFix'));
    } else {
      setTargetUserName('');
      setReason('');
    }
  }, [selectedTask?.id, selectedTask?.status, canSubmitForTesting, canReturnForFix, qaMembers, devMembers, t]);

  async function runHandoff(action: TaskHandoffAction) {
    if (!selectedTask) return;
    if (!targetUserName.trim()) {
      toast.error(action === 'submit_for_testing' ? t('features.mywork.myWorkTaskWorkspace.selectTestEngineer') : t('features.mywork.myWorkTaskWorkspace.selectDevEngineer'));
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
      toast.success(action === 'submit_for_testing' ? t('features.mywork.myWorkTaskWorkspace.submittedForTesting') : t('features.mywork.myWorkTaskWorkspace.returnedForFix'));
      onHandoffDone?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.mywork.myWorkTaskWorkspace.handoffFailed'));
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
    if (task.sourceType === 'requirement') return t('features.mywork.myWorkTaskWorkspace.sourceRequirement');
    if (task.sourceType === 'test_case') return t('features.mywork.myWorkTaskWorkspace.sourceTestCase');
    if (task.sourceType === 'defect') return t('features.mywork.myWorkTaskWorkspace.sourceDefect');
    return t('features.mywork.myWorkTaskWorkspace.sourceGeneral');
  }

  const filterButtons: Array<{ key: TaskFilter; label: string; count: number }> = [
    { key: 'all', label: t('features.mywork.myWorkTaskWorkspace.filterAll'), count: filterCounts.all },
    { key: 'requirement', label: t('features.mywork.myWorkTaskWorkspace.filterRequirement'), count: filterCounts.requirement },
    { key: 'test_case', label: t('features.mywork.myWorkTaskWorkspace.filterTestCase'), count: filterCounts.test_case },
    { key: 'defect', label: t('features.mywork.myWorkTaskWorkspace.filterDefect'), count: filterCounts.defect },
    { key: 'general', label: t('features.mywork.myWorkTaskWorkspace.filterGeneral'), count: filterCounts.general },
  ];

  const queueSubtitle =
    taskFilter === 'all'
      ? t('features.mywork.myWorkTaskWorkspace.queueSubtitleAll', {
          total: visibleTasks.length,
          req: filterCounts.requirement,
          tc: filterCounts.test_case,
          def: filterCounts.defect,
          general: filterCounts.general,
        })
      : t('features.mywork.myWorkTaskWorkspace.queueSubtitleFiltered', { total: visibleTasks.length });

  const targetOptions = canSubmitForTesting ? qaMembers : canReturnForFix ? devMembers : [];
  const hasTasksOutsideFilter = taskFilter !== 'all' && filterCounts.all > 0;
  const canOpenProjects = canAccessPageForUser(sessionUser, 'projects');

  return (
    <div className="mywork-tasks">
      <div className="mywork-task-filters" role="group" aria-label={t('features.mywork.myWorkTaskWorkspace.filterAria')}>
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

      {visibleTasks.length === 0 ? (
        <MyWorkEmptyPanel
          icon={<Inbox size={26} />}
          eyebrow={hasTasksOutsideFilter ? t('features.mywork.myWorkTaskWorkspace.emptyFilterEyebrow') : t('features.mywork.myWorkTaskWorkspace.emptyQueueEyebrow')}
          title={hasTasksOutsideFilter ? t('features.mywork.myWorkTaskWorkspace.emptyFilterTitle') : t('features.mywork.myWorkTaskWorkspace.emptyQueueTitle')}
          description={hasTasksOutsideFilter
            ? t('features.mywork.myWorkTaskWorkspace.emptyFilterDesc')
            : t('features.mywork.myWorkTaskWorkspace.emptyQueueDesc')}
          action={
            hasTasksOutsideFilter ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onTaskFilterChange('all')}>
                <Inbox size={15} /> {t('features.mywork.myWorkTaskWorkspace.viewAllTasks')}
              </button>
            ) : canOpenProjects ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateTo('projects')}>
                <FolderKanban size={15} /> {t('features.mywork.myWorkTaskWorkspace.viewProjects')}
              </button>
            ) : undefined
          }
        />
      ) : (
      <div className="mywork-panels">
        <Panel title={t('features.mywork.myWorkTaskWorkspace.queuePanelTitle')} subtitle={queueSubtitle} className="mywork-panel-left">
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
                  bucket === 'requirement' ? t('features.mywork.myWorkTaskWorkspace.filterRequirement') :
                  bucket === 'test_case' ? t('features.mywork.myWorkTaskWorkspace.filterTestCase') :
                  bucket === 'defect' ? t('features.mywork.myWorkTaskWorkspace.filterDefect') : t('features.mywork.myWorkTaskWorkspace.filterGeneral');
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
                          <span>{task.assigneeRole ? labelOf(USER_ROLE_LABELS, task.assigneeRole) : t('features.mywork.myWorkTaskWorkspace.unassignedRole')}</span>
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
                    <span>{task.assigneeRole ? labelOf(USER_ROLE_LABELS, task.assigneeRole) : t('features.mywork.myWorkTaskWorkspace.unassignedRole')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title={t('features.mywork.myWorkTaskWorkspace.detailPanelTitle')}
          className="mywork-panel-center"
          toolbar={
            selectedTask && canOpenLinked(selectedTask) ? (
              <button className="btn btn-secondary btn-sm" onClick={() => openLinkedSource(selectedTask)}>
                {t('features.mywork.myWorkTaskWorkspace.openLinkedDetail')}
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
                    {t('features.mywork.myWorkTaskWorkspace.sourcePrefix', { source: sourceLabel(selectedTask) })}
                    {selectedTask.sourceId ? ` · ${selectedTask.sourceId}` : ''}
                    {' · '}
                    {labelOf(TASK_TYPE_LABELS, selectedTask.type)}
                  </div>
                </div>
                <StatusBadge status={selectedTask.status} label={labelOf(TASK_STATUS_LABELS, selectedTask.status)} />
              </div>
              <div className="mywork-detail-meta">
                <div className="detail-field">
                  <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.ownerLabel')}</span>
                  <span className="detail-value">{selectedTask.owner || '-'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.roleLabel')}</span>
                  <span className="detail-value">{selectedTask.assigneeRole ? labelOf(USER_ROLE_LABELS, selectedTask.assigneeRole) : t('features.mywork.myWorkTaskWorkspace.roleUnset')}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.linkedIdLabel')}</span>
                  <span className="detail-value text-mono">{selectedTask.sourceId || selectedTask.requirementId || '-'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.wbsLabel')}</span>
                  <span className="detail-value text-mono">{selectedTask.wbsCode}</span>
                </div>
              </div>
              <div className="detail-field mywork-detail-progress">
                <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.progressLabel')}</span>
                <ProgressBar percent={selectedTask.progress} />
              </div>
              {selectedTask.description ? (
                <div className="detail-field" style={{ marginTop: 8 }}>
                  <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.descriptionLabel')}</span>
                  <div className="detail-value">{selectedTask.description}</div>
                </div>
              ) : null}

              {(canSubmitForTesting || canReturnForFix) ? (
                <div className="mywork-handoff" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                  <div className="detail-label" style={{ marginBottom: 8 }}>
                    {canSubmitForTesting ? t('features.mywork.myWorkTaskWorkspace.handoffSubmitTitle') : t('features.mywork.myWorkTaskWorkspace.handoffReturnTitle')}
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{canSubmitForTesting ? t('features.mywork.myWorkTaskWorkspace.testEngineerLabel') : t('features.mywork.myWorkTaskWorkspace.devEngineerLabel')}</label>
                    {membersLoading ? (
                      <div className="body-text">{t('features.mywork.myWorkTaskWorkspace.loadingMembers')}</div>
                    ) : targetOptions.length > 0 ? (
                      <select
                        className="form-select"
                        value={targetUserName}
                        onChange={(e) => setTargetUserName(e.target.value)}
                        disabled={submitting}
                      >
                        <option value="">{t('features.mywork.myWorkTaskWorkspace.selectPlaceholder')}</option>
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
                        placeholder={canSubmitForTesting ? t('features.mywork.myWorkTaskWorkspace.testEngineerPlaceholder') : t('features.mywork.myWorkTaskWorkspace.devEngineerPlaceholder')}
                        disabled={submitting}
                      />
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{t('features.mywork.myWorkTaskWorkspace.reasonLabel')}</label>
                    <input
                      className="form-input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={submitting}
                      placeholder={t('features.mywork.myWorkTaskWorkspace.reasonPlaceholder')}
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
                        {submitting ? t('features.mywork.myWorkTaskWorkspace.submitting') : t('features.mywork.myWorkTaskWorkspace.submitForTesting')}
                      </button>
                    ) : null}
                    {canReturnForFix ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={submitting}
                        onClick={() => void runHandoff('return_for_fix')}
                      >
                        {submitting ? t('features.mywork.myWorkTaskWorkspace.submitting') : t('features.mywork.myWorkTaskWorkspace.returnForFix')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="detail-field" style={{ marginTop: 16 }}>
                <span className="detail-label">{t('features.mywork.myWorkTaskWorkspace.statusHistoryLabel')}</span>
                {historyLoading ? (
                  <div className="body-text">{t('features.mywork.myWorkTaskWorkspace.loadingHistory')}</div>
                ) : historyError ? (
                  <div className="form-error">{t('features.mywork.myWorkTaskWorkspace.historyLoadFailed')}</div>
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
                  <div className="body-text">{t('features.mywork.myWorkTaskWorkspace.noHistory')}</div>
                )}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
      )}
    </div>
  );
}
