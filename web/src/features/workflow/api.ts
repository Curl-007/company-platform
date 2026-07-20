import { unwrap } from '../../services/apiClient';
import type { StatusHistoryEntry, WorkflowTemplateCatalog } from '../../types';

export function fetchTaskStatusHistory(taskId: string): Promise<StatusHistoryEntry[]> {
  return unwrap<StatusHistoryEntry[]>(`/api/tasks/${encodeURIComponent(taskId)}/status-history`);
}

export function fetchWorkflowTemplates(): Promise<WorkflowTemplateCatalog> {
  return unwrap<WorkflowTemplateCatalog>('/api/flow/templates');
}
