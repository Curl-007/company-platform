import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteTask } from '../../tasks/api';
import { STORAGE_KEYS } from '../detailModel';
import CreateWbsTaskForm from './CreateWbsTaskForm';
import EditTaskForm from './EditTaskForm';
import TaskDetailView from './TaskDetailView';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import TreeTable, { type TreeTableColumn } from '../../../components/common/TreeTable';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { Task } from '../../../types';
import { TASK_STATUS_LABELS, labelOf } from '../../../constants/enums';

export default function WbsTab({
  tasks,
  projectId,
  onReload,
  canManageProject,
}: {
  tasks: Task[];
  projectId: string;
  onReload: () => void;
  canManageProject: boolean;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [ownerFilter, setOwnerFilter] = useState(() => window.localStorage.getItem(STORAGE_KEYS.wbsOwner) ?? '');
  const [statusFilter, setStatusFilter] = useState(() => window.localStorage.getItem(STORAGE_KEYS.wbsStatus) ?? '');
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.wbsOwner, ownerFilter);
  }, [ownerFilter]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.wbsStatus, statusFilter);
  }, [statusFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (ownerFilter && task.owner !== ownerFilter) return false;
      if (statusFilter && task.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, ownerFilter, statusFilter]);

  const roots = filteredTasks
    .filter((task) => !task.parentId)
    .sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }));

  const byParent: Record<string, Task[]> = {};
  filteredTasks.forEach((task) => {
    if (!task.parentId) return;
    if (!byParent[task.parentId]) byParent[task.parentId] = [];
    byParent[task.parentId].push(task);
  });
  for (const parentId of Object.keys(byParent)) {
    byParent[parentId].sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }));
  }

  const ownerOptions = Array.from(new Set(tasks.map((task) => task.owner).filter(Boolean)));
  const doneCount = filteredTasks.filter((task) => task.status === 'done').length;
  const blockedCount = filteredTasks.filter((task) => task.status === 'blocked').length;

  function getChildren(task: Task): Task[] {
    return byParent[task.id] ?? [];
  }

  const columns: TreeTableColumn<Task>[] = [
    {
      key: 'title',
      title: t('features.projects.wbsTab.colTask'),
      width: '36%',
      render: (task) => (
        <div className="pd-wbs-task">
          <span className="pd-wbs-code">{task.wbsCode}</span>
          <span className="pd-wbs-title" title={task.title}>{task.title}</span>
        </div>
      ),
    },
    {
      key: 'owner',
      title: t('features.projects.wbsTab.colOwner'),
      width: 110,
      render: (task) => <span className="pd-wbs-owner">{task.owner || t('features.projects.common.unassigned')}</span>,
    },
    {
      key: 'status',
      title: t('features.projects.wbsTab.colStatus'),
      width: 100,
      render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
    },
    {
      key: 'estimatedHours',
      title: t('features.projects.wbsTab.colEstimated'),
      width: 64,
      align: 'right',
      render: (task) => <span className="text-mono">{task.estimatedHours ?? '-'}</span>,
    },
    {
      key: 'remainingHours',
      title: t('features.projects.wbsTab.colRemaining'),
      width: 64,
      align: 'right',
      render: (task) => <span className="text-mono">{task.remainingHours ?? 0}</span>,
    },
    {
      key: 'progress',
      title: t('features.projects.wbsTab.colProgress'),
      width: 150,
      render: (task) => (
        <div className="pd-wbs-progress">
          <ProgressBar percent={task.progress ?? 0} height={5} showPercent={false} className="min-w-0 flex-1" />
          <span className="text-mono">{task.progress ?? 0}%</span>
        </div>
      ),
    },
  ];

  async function handleDelete(taskId: string) {
    if (!canManageProject) {
      toast.error(t('features.projects.wbsTab.noDeletePermission'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.projects.wbsTab.deleteConfirm'),
      description: t('features.projects.wbsTab.deleteDesc'),
      confirmText: t('features.projects.wbsTab.deleteConfirmText'),
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteTask(taskId);
      toast.success(t('features.projects.wbsTab.deleted'));
      onReload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.projects.wbsTab.deleteFailed'));
    }
  }

  return (
    <div className="pd-tab pd-wbs-tab">
      <div className="pd-wbs-toolbar">
        <div className="pd-wbs-stats">
          <span><strong>{filteredTasks.length}</strong>{t('features.projects.wbsTab.statTasks')}</span>
          <span><strong>{doneCount}</strong>{t('features.projects.wbsTab.statDone')}</span>
          <span className={blockedCount > 0 ? 'is-risk' : ''}><strong>{blockedCount}</strong>{t('features.projects.wbsTab.statBlocked')}</span>
        </div>
        <div className="pd-wbs-filters">
          <select
            className="form-select"
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            aria-label={t('features.projects.wbsTab.ownerFilterAria')}
          >
            <option value="">{t('features.projects.wbsTab.allOwners')}</option>
            {ownerOptions.map((owner) => (
              <option key={owner} value={owner}>{owner}</option>
            ))}
          </select>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label={t('features.projects.wbsTab.statusFilterAria')}
          >
            <option value="">{t('features.projects.wbsTab.allStatuses')}</option>
            {Object.entries(TASK_STATUS_LABELS).map(([key, value]) => (
              <option key={key} value={key}>{t(value)}</option>
            ))}
          </select>
          {canManageProject ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.projects.wbsTab.newTask')}</button>
          ) : null}
        </div>
      </div>

      <Panel className="pd-wbs-panel" noPadding>
        <TreeTable<Task>
          columns={columns}
          data={roots}
          getChildren={getChildren}
          getDepth={(task) => {
            let depth = 0;
            let currentParentId = task.parentId;
            while (currentParentId) {
              depth += 1;
              currentParentId = filteredTasks.find((item) => item.id === currentParentId)?.parentId ?? null;
            }
            return depth;
          }}
          rowKey="id"
          expandedIds={new Set(filteredTasks.filter((task) => !collapsed.has(task.id)).map((task) => task.id))}
          onToggleExpand={(id) => {
            const next = new Set(collapsed);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setCollapsed(next);
          }}
          selectedIds={selectedId ? new Set([selectedId]) : undefined}
          onRowClick={(task) => setSelectedId(task.id)}
          rowActions={(task) => (
            <div className="pd-wbs-actions">
              <button className="btn btn-text btn-xs" onClick={() => setDetailTask(task)}>{t('features.projects.wbsTab.detail')}</button>
              {canManageProject ? (
                <>
                  <button className="btn btn-text btn-xs" onClick={() => setEditingTask(task)}>{t('common.edit')}</button>
                  <button
                    className="btn btn-text btn-xs"
                    onClick={() => handleDelete(task.id)}
                    style={{ color: 'var(--color-red, #dc2626)' }}
                  >
                    {t('common.delete')}
                  </button>
                </>
              ) : null}
            </div>
          )}
          emptyText={t('features.projects.wbsTab.emptyWbs')}
        />
      </Panel>

      {creating && canManageProject ? (
        <CreateWbsTaskForm
          projectId={projectId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onReload();
          }}
        />
      ) : null}
      {editingTask && canManageProject ? (
        <EditTaskForm
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => {
            setEditingTask(null);
            onReload();
          }}
        />
      ) : null}
      {detailTask ? (
        <TaskDetailView
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onUpdated={() => onReload()}
        />
      ) : null}
    </div>
  );
}
