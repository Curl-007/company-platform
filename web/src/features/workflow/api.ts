import { unwrap, unwrapPatch, unwrapPost, unwrapPut } from '../../services/apiClient';
import type {
  ProjectWorkflowBinding,
  StatusHistoryEntry,
  WorkflowTemplate,
  WorkflowTemplateCatalog,
  WorkflowTemplateInput,
} from '../../types';

export function fetchTaskStatusHistory(taskId: string): Promise<StatusHistoryEntry[]> {
  return unwrap<StatusHistoryEntry[]>(`/api/tasks/${encodeURIComponent(taskId)}/status-history`);
}

export function fetchWorkflowTemplates(includeDrafts = false): Promise<WorkflowTemplateCatalog> {
  const query = includeDrafts ? '?includeDrafts=1' : '';
  return unwrap<WorkflowTemplateCatalog>(`/api/flow/templates${query}`);
}

export function createWorkflowTemplate(input: WorkflowTemplateInput): Promise<WorkflowTemplate> {
  return unwrapPost<WorkflowTemplate>('/api/flow/templates', input, {
    invalidatePrefixes: ['fetchWorkflowTemplates', 'fetchProjectFlow', 'fetchFlowOverview'],
  });
}

export function updateWorkflowTemplate(id: string, input: WorkflowTemplateInput): Promise<WorkflowTemplate> {
  return unwrapPatch<WorkflowTemplate>(`/api/flow/templates/${encodeURIComponent(id)}`, input, {
    invalidatePrefixes: ['fetchWorkflowTemplates', 'fetchProjectFlow', 'fetchFlowOverview'],
  });
}

export function publishWorkflowTemplate(id: string): Promise<WorkflowTemplate> {
  return unwrapPost<WorkflowTemplate>(`/api/flow/templates/${encodeURIComponent(id)}/publish`, {}, {
    invalidatePrefixes: ['fetchWorkflowTemplates', 'fetchProjectFlow', 'fetchFlowOverview'],
  });
}

export function fetchProjectWorkflowBinding(projectId: string): Promise<ProjectWorkflowBinding> {
  return unwrap<ProjectWorkflowBinding>(`/api/projects/${encodeURIComponent(projectId)}/workflow-binding`);
}

export function bindProjectWorkflowTemplate(projectId: string, templateId: string): Promise<ProjectWorkflowBinding> {
  return unwrapPut<ProjectWorkflowBinding>(
    `/api/projects/${encodeURIComponent(projectId)}/workflow-binding`,
    { templateId },
    {
      invalidatePrefixes: ['fetchWorkflowTemplates', 'fetchProjectFlow', 'fetchFlowOverview', 'fetchProjectWorkflowBinding'],
    },
  );
}
