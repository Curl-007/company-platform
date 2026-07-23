import { unwrap, unwrapPut } from '../../services/apiClient';
import type {
  GateRuleCatalog,
  ProjectWorkflowBinding,
  StatusHistoryEntry,
  WorkflowTemplateCatalog,
} from '../../types';

export function fetchTaskStatusHistory(taskId: string): Promise<StatusHistoryEntry[]> {
  return unwrap<StatusHistoryEntry[]>(`/api/tasks/${encodeURIComponent(taskId)}/status-history`);
}

export function fetchWorkflowTemplates(includeDrafts = false): Promise<WorkflowTemplateCatalog> {
  const query = includeDrafts ? '?includeDrafts=1' : '';
  return unwrap<WorkflowTemplateCatalog>(`/api/flow/templates${query}`);
}

export function fetchGateRuleCatalog(): Promise<GateRuleCatalog> {
  return unwrap<GateRuleCatalog>('/api/flow/gate-rules');
}

// Custom template draft/publish/clone is intentionally closed server-side
// (templateStore only exposes two builtins + project bind). Do not re-add write
// wrappers unless the backend re-enables editable templates.

export function fetchProjectWorkflowBinding(projectId: string): Promise<ProjectWorkflowBinding> {
  return unwrap<ProjectWorkflowBinding>(`/api/projects/${encodeURIComponent(projectId)}/workflow-binding`);
}

export function bindProjectWorkflowTemplate(projectId: string, templateId: string): Promise<ProjectWorkflowBinding> {
  return unwrapPut<ProjectWorkflowBinding>(
    `/api/projects/${encodeURIComponent(projectId)}/workflow-binding`,
    { templateId },
    {
      invalidateKeys: ['workflow:templates', 'project:flow', 'flow:overview', 'project:workflow-binding'],
    },
  );
}
