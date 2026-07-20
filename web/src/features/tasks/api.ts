import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type { BurndownData, KanbanColumn, Sprint, SprintCommitment, SprintScopeChange, Task } from '../../types';

export function fetchProjectWbs(id: string): Promise<Task[]> {
  return unwrap<Task[]>(`/api/projects/${id}/wbs`);
}

export interface CreateWbsTaskInput {
  title: string;
  assigneeId?: string;
  requirementId?: string;
  type?: string;
  parentId?: string;
  wbsCode?: string;
  estimatedHours?: number;
  remainingHours?: number;
  dependencyIds?: string[];
}

export function createWbsTask(projectId: string, input: CreateWbsTaskInput, idempotencyKey?: string): Promise<Task> {
  return unwrapPost<Task>(`/api/projects/${projectId}/wbs/tasks`, input, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function fetchProjectKanban(id: string): Promise<KanbanColumn[]> {
  return unwrap<KanbanColumn[]>(`/api/projects/${id}/kanban`);
}

export function updateTaskKanban(
  taskId: string,
  payload: { version: number; kanbanColumn: string; sortOrder?: number; comment?: string },
): Promise<Task> {
  return unwrapPatch<Task>(`/api/tasks/${taskId}/kanban-position`, payload);
}

export interface UpdateTaskInput {
  version: number;
  title?: string;
  owner?: string;
  progress?: number;
  status?: string;
  type?: string;
  estimatedHours?: number;
  actualHours?: number;
  remainingHours?: number;
  dueDate?: string;
  sprintId?: string | null;
  assigneeId?: string | null;
  dependencyIds?: string[];
  scopeChangeReason?: string;
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return unwrapPatch<Task>(`/api/tasks/${id}`, input);
}

export function deleteTask(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/tasks/${id}`);
}

export function fetchProjectSprints(id: string): Promise<Sprint[]> {
  return unwrap<Sprint[]>(`/api/projects/${id}/sprints`);
}

export interface CreateSprintInput {
  name: string;
  goal?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function createSprint(projectId: string, input: CreateSprintInput, idempotencyKey?: string): Promise<Sprint> {
  return unwrapPost<Sprint>(`/api/projects/${projectId}/sprints`, input, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function fetchSprintBurndown(id: string): Promise<BurndownData> {
  return unwrap<BurndownData>(`/api/sprints/${id}/burndown`);
}

export function fetchSprintCommitment(id: string): Promise<SprintCommitment | null> {
  return unwrap<SprintCommitment | null>(`/api/sprints/${id}/commitment`);
}

export function fetchSprintScopeChanges(id: string): Promise<SprintScopeChange[]> {
  return unwrap<SprintScopeChange[]>(`/api/sprints/${id}/scope-changes`);
}

export interface UpdateSprintInput {
  name?: string;
  goal?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function updateSprint(id: string, input: UpdateSprintInput): Promise<Sprint> {
  return unwrapPatch<Sprint>(`/api/sprints/${id}`, input);
}

export function deleteSprint(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/sprints/${id}`);
}
