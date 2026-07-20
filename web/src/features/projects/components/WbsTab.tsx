import { useEffect, useMemo, useState } from 'react';
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

export default function WbsTab({ tasks, projectId, onReload, canManageProject }: { tasks: Task[]; projectId: string; onReload: () => void; canManageProject: boolean }) {
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

  function getChildren(task: Task): Task[] {
    return byParent[task.id] ?? [];
  }

  const columns: TreeTableColumn<Task>[] = [
    {
      key: 'title',
      title: '任务',
      width: 220,
      render: (task) => <span className="font-medium">{task.wbsCode} {task.title}</span>,
    },
    { key: 'owner', title: '负责人', render: (task) => task.owner || '-' },
    {
      key: 'status',
      title: '状态',
      render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
    },
    {
      key: 'estimatedHours',
      title: '预估(h)',
      align: 'right',
      render: (task) => task.estimatedHours ?? '-',
    },
    {
      key: 'remainingHours',
      title: '剩余(h)',
      align: 'right',
      render: (task) => <span className="text-mono">{task.remainingHours ?? 0}</span>,
    },
    {
      key: 'progress',
      title: '进度',
      width: 160,
      render: (task) => <ProgressBar percent={task.progress ?? 0} height={6} />,
    },
  ];

  async function handleDelete(taskId: string) {
    if (!canManageProject) {
      toast.error('当前账号无权删除任务。');
      return;
    }
    const confirmed = await confirm({
      title: '删除该任务？',
      description: '删除后任务进度、工时和看板位置将不可恢复。',
      confirmText: '删除任务',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteTask(taskId);
      toast.success('任务已删除');
      onReload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除任务失败');
    }
  }

  return (
    <>
      <Panel
        title="WBS"
        subtitle={`当前显示 ${filteredTasks.length} 个任务`}
        toolbar={
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <select className="form-select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="">全部负责人</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
            <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(TASK_STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
            {canManageProject ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建任务</button> : null}
          </div>
        }
      >
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
            <div className="flex items-center gap-1">
              {canManageProject ? (
                <>
                  <button className="btn btn-text btn-xs" onClick={() => setEditingTask(task)}>编辑</button>
                  <button className="btn btn-text btn-xs" onClick={() => handleDelete(task.id)} style={{ color: 'var(--color-red, #dc2626)' }}>删除</button>
                </>
              ) : null}
              <button className="btn btn-text btn-xs" onClick={() => setDetailTask(task)}>详情</button>
            </div>
          )}
          emptyText="该项目下还没有匹配的 WBS 任务。"
        />
      </Panel>

      {creating && canManageProject && (
        <CreateWbsTaskForm
          projectId={projectId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onReload();
          }}
        />
      )}
      {editingTask && canManageProject && (
        <EditTaskForm
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => {
            setEditingTask(null);
            onReload();
          }}
        />
      )}
      {detailTask && <TaskDetailView task={detailTask} onClose={() => setDetailTask(null)} onUpdated={() => onReload()} />}
    </>
  );
}
