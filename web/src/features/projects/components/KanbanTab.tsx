import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, GripVertical, KanbanSquare, Plus, UserRound } from 'lucide-react';
import { fetchProjectKanban, updateTaskKanban } from '../../tasks/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import PageState from '../../../components/common/PageState';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import type { KanbanColumn } from '../../../types';
import { TASK_STATUS_LABELS, labelOf } from '../../../constants/enums';

export default function KanbanTab({ projectId, canManageProject }: { projectId: string; canManageProject: boolean }) {
  const { data, loading, error, reload } = useAsync<KanbanColumn[]>(() => fetchProjectKanban(projectId), [projectId]);
  const [columns, setColumns] = useState<KanbanColumn[] | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [movingError, setMovingError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    setColumns(data);
  }, [data]);

  function handleDragStart(taskId: string) {
    if (!canManageProject) return;
    setDragTaskId(taskId);
  }

  function handleDragEnd() {
    setDragTaskId(null);
    setDragOverColumn(null);
  }

  function handleDragOver(columnId: string, event: React.DragEvent<HTMLDivElement>) {
    if (!canManageProject) return;
    event.preventDefault();
    if (dragOverColumn !== columnId) setDragOverColumn(columnId);
  }

  async function handleDrop(targetColumnId: string, event: React.DragEvent<HTMLDivElement>) {
    if (!canManageProject) return;
    event.preventDefault();
    const taskId = dragTaskId;
    setDragTaskId(null);
    setDragOverColumn(null);
    if (!taskId || !columns) return;

    const sourceColumn = columns.find((column) => column.tasks.some((task) => task.id === taskId));
    if (!sourceColumn) return;

    const task = sourceColumn.tasks.find((item) => item.id === taskId);
    if (!task || sourceColumn.id === targetColumnId) return;

    const nextColumns = columns.map((column) => {
      if (column.id === sourceColumn.id) {
        return { ...column, tasks: column.tasks.filter((item) => item.id !== taskId) };
      }
      if (column.id === targetColumnId) {
        return { ...column, tasks: [...column.tasks, { ...task, kanbanColumn: targetColumnId }] };
      }
      return column;
    });

    setColumns(nextColumns);
    setMovingError(null);

    try {
      await updateTaskKanban(taskId, { version: task.version, kanbanColumn: targetColumnId });
      toast.success(`任务已移动到「${labelOf(TASK_STATUS_LABELS, targetColumnId)}」`);
    } catch (err: unknown) {
      setMovingError(err instanceof ApiError ? err.message : '移动失败，已回滚。');
      setColumns(columns);
    }
  }

  if (loading || error || !columns) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !columns} onRetry={reload} />;
  }

  const totalTasks = columns.reduce((sum, column) => sum + column.tasks.length, 0);
  const doneTasks = columns.find((column) => column.id === 'done')?.tasks.length ?? 0;
  const blockedTasks = columns.find((column) => column.id === 'blocked')?.tasks.length ?? 0;
  const activeTasks = Math.max(0, totalTasks - doneTasks);

  return (
    <div className="project-board-shell">
      <div className="project-board-toolbar">
        <div className="project-board-toolbar-left">
          <span className="project-board-icon"><KanbanSquare size={17} /></span>
          <div>
            <div className="project-board-title">项目看板</div>
            <div className="project-board-subtitle">{canManageProject ? '拖拽卡片即可在列之间移动任务，状态会自动同步。' : '当前账号为只读模式，可查看任务流转状态。'}</div>
          </div>
        </div>
        <div className="project-board-stats">
          <span><strong>{totalTasks}</strong> 全部</span>
          <span><strong>{activeTasks}</strong> 进行中</span>
          <span className={blockedTasks > 0 ? 'risk' : ''}><strong>{blockedTasks}</strong> 阻塞</span>
        </div>
      </div>
      {movingError && <div className="form-error" style={{ marginBottom: 12 }}>{movingError}</div>}
      <div className="kanban-board">
        {columns.map((column) => {
          const isDropTarget = dragOverColumn === column.id;
          const averageProgress = column.tasks.length
            ? Math.round(column.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / column.tasks.length)
            : 0;
          return (
            <div
              key={column.id}
              className={`kanban-column${isDropTarget ? ' kanban-column-drop' : ''}`}
              onDragOver={(event) => handleDragOver(column.id, event)}
              onDragLeave={() => setDragOverColumn((current) => (current === column.id ? null : current))}
              onDrop={(event) => handleDrop(column.id, event)}
            >
              <div className="kanban-column-header">
                <div className="kanban-column-heading">
                  <span className={`kanban-column-dot ${column.id}`} />
                  <div>
                    <div className="kanban-column-title">{labelOf(TASK_STATUS_LABELS, column.id)}</div>
                    <div className="kanban-column-meta">{averageProgress}% 平均进度</div>
                  </div>
                </div>
                <span className="tag">{column.tasks.length}</span>
              </div>
              <div className="kanban-column-body">
                {column.tasks.length === 0 ? (
                  <div className="kanban-empty">
                    <Plus size={18} />
                    <span>暂无卡片</span>
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`card kanban-card${dragTaskId === task.id ? ' kanban-card-dragging' : ''}`}
                       draggable={canManageProject}
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="kanban-card-grip"><GripVertical size={14} /></div>
                      <div className="kanban-card-title">
                        <span className="font-medium">{task.title}</span>
                      </div>
                      <div className="kanban-card-code text-mono">{task.wbsCode}</div>
                      <ProgressBar percent={task.progress ?? 0} height={4} showPercent={false} />
                      <div className="kanban-card-meta">
                        <span className="flex items-center gap-1">
                          {task.owner && <span className="kanban-avatar">{(task.owner || '?').slice(0, 1)}</span>}
                          <span className="text-secondary" style={{ fontSize: 12 }}>{task.owner || '未指派'}</span>
                        </span>
                        <span className="text-mono text-secondary" style={{ fontSize: 12 }}>{task.progress}%</span>
                      </div>
                      <div className="kanban-card-footer">
                        <span><UserRound size={12} /> {task.owner || '未指派'}</span>
                        {task.dueDate ? <span><Clock3 size={12} /> {task.dueDate.slice(5)}</span> : null}
                        {task.status === 'blocked' ? <span className="risk"><AlertTriangle size={12} /> 阻塞</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
