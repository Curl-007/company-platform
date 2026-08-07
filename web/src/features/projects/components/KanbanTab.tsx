import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock3, GripVertical, KanbanSquare, Plus, UserRound } from 'lucide-react';
import { fetchProjectKanban, updateTaskKanban } from '../../tasks/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import PageState from '../../../components/common/PageState';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import type { KanbanColumn } from '../../../types';
import { TASK_STATUS_LABELS, labelOf } from '../../../constants/enums';

const PRIMARY_COLUMNS = new Set(['todo', 'in_progress', 'blocked', 'done', 'testing', 'code_review', 'acceptance']);

export default function KanbanTab({
  projectId,
  canManageProject,
}: {
  projectId: string;
  canManageProject: boolean;
}) {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<KanbanColumn[]>(
    () => fetchProjectKanban(projectId),
    [projectId],
    { cacheKey: 'projects:kanban' },
  );
  const [columns, setColumns] = useState<KanbanColumn[] | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [movingError, setMovingError] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setColumns(data);
  }, [data]);

  const visibleColumns = useMemo(() => {
    if (!columns) return [];
    if (showEmpty) return columns;
    const filled = columns.filter((column) => column.tasks.length > 0);
    // Keep a few primary empty drop targets so drag still works.
    const emptyPrimary = columns.filter(
      (column) => column.tasks.length === 0 && PRIMARY_COLUMNS.has(column.id),
    ).slice(0, 2);
    const ids = new Set([...filled, ...emptyPrimary].map((item) => item.id));
    return columns.filter((column) => ids.has(column.id));
  }, [columns, showEmpty]);

  function handleDragStart(taskId: string) {
    if (!canManageProject) return;
    setDragTaskId(taskId);
  }

  function handleDragEnd() {
    setDragTaskId(null);
    setDragOverColumn(null);
  }

  function handleDragOver(columnId: string, event: React.DragEvent) {
    if (!canManageProject) return;
    event.preventDefault();
    if (dragOverColumn !== columnId) setDragOverColumn(columnId);
  }

  async function handleDrop(targetColumnId: string, event: React.DragEvent) {
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
      toast.success(t('features.projects.kanbanTab.moved', { status: labelOf(TASK_STATUS_LABELS, targetColumnId) }));
    } catch (err: unknown) {
      setMovingError(err instanceof ApiError ? err.message : t('features.projects.kanbanTab.moveFailed'));
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
  const hiddenEmpty = columns.filter((column) => column.tasks.length === 0).length;

  return (
    <div className="pd-tab pd-kanban-tab">
      <div className="pd-kanban-toolbar">
        <div className="pd-kanban-toolbar-main">
          <span className="pd-kanban-icon"><KanbanSquare size={16} /></span>
          <div>
            <div className="pd-kanban-title">{t('features.projects.kanbanTab.title')}</div>
            <div className="pd-kanban-subtitle">
              {canManageProject ? t('features.projects.kanbanTab.dragHint') : t('features.projects.kanbanTab.readonly')}
            </div>
          </div>
        </div>
        <div className="pd-kanban-toolbar-right">
          <div className="pd-kanban-stats">
            <span><strong>{totalTasks}</strong>{t('features.projects.kanbanTab.all')}</span>
            <span><strong>{activeTasks}</strong>{t('features.projects.kanbanTab.inProgress')}</span>
            <span className={blockedTasks > 0 ? 'is-risk' : ''}><strong>{blockedTasks}</strong>{t('features.projects.kanbanTab.blocked')}</span>
            <span><strong>{doneTasks}</strong>{t('features.projects.kanbanTab.done')}</span>
          </div>
          {hiddenEmpty > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowEmpty((value) => !value)}
            >
              {showEmpty ? t('features.projects.kanbanTab.hideEmpty') : t('features.projects.kanbanTab.showEmpty', { count: hiddenEmpty })}
            </button>
          ) : null}
        </div>
      </div>

      {movingError ? <div className="form-error pd-kanban-error">{movingError}</div> : null}

      <div className="pd-kanban-board">
        {visibleColumns.map((column) => {
          const isDropTarget = dragOverColumn === column.id;
          const averageProgress = column.tasks.length
            ? Math.round(column.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / column.tasks.length)
            : 0;

          return (
            <section
              key={column.id}
              className={`pd-kanban-column${isDropTarget ? ' is-drop' : ''}${column.tasks.length === 0 ? ' is-empty' : ''}`}
              onDragOver={(event) => handleDragOver(column.id, event)}
              onDragLeave={() => setDragOverColumn((current) => (current === column.id ? null : current))}
              onDrop={(event) => handleDrop(column.id, event)}
            >
              <header className="pd-kanban-column-head">
                <div className="pd-kanban-column-title-wrap">
                  <span className={`pd-kanban-dot status-${column.id}`} />
                  <div className="min-w-0">
                    <div className="pd-kanban-column-title">{labelOf(TASK_STATUS_LABELS, column.id)}</div>
                    <div className="pd-kanban-column-meta">
                      {column.tasks.length ? t('features.projects.kanbanTab.avgProgress', { value: averageProgress }) : t('features.projects.kanbanTab.dropTarget')}
                    </div>
                  </div>
                </div>
                <span className="pd-kanban-count">{column.tasks.length}</span>
              </header>

              <div className="pd-kanban-column-body">
                {column.tasks.length === 0 ? (
                  <div className="pd-kanban-empty">
                    <Plus size={14} />
                    <span>{t('features.projects.kanbanTab.emptyColumn')}</span>
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <article
                      key={task.id}
                      className={`pd-kanban-card${dragTaskId === task.id ? ' is-dragging' : ''}`}
                      draggable={canManageProject}
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      {canManageProject ? (
                        <span className="pd-kanban-grip" aria-hidden="true">
                          <GripVertical size={13} />
                        </span>
                      ) : null}
                      <div className="pd-kanban-card-title" title={task.title}>{task.title}</div>
                      <div className="pd-kanban-card-code">{task.wbsCode}</div>
                      <ProgressBar percent={task.progress ?? 0} height={4} showPercent={false} />
                      <div className="pd-kanban-card-meta">
                        <span>
                          {task.owner
                            ? <span className="pd-kanban-avatar">{task.owner.slice(0, 1)}</span>
                            : <UserRound size={12} />}
                          {task.owner || t('features.projects.common.unassigned')}
                        </span>
                        <span className="text-mono">{task.progress ?? 0}%</span>
                        {task.dueDate ? <span><Clock3 size={12} />{task.dueDate.slice(5)}</span> : null}
                        {task.status === 'blocked' ? (
                          <span className="is-risk"><AlertTriangle size={12} />{t('features.projects.kanbanTab.blocked')}</span>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
