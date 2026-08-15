import { navigateTo } from '../../team/components/teamMeta';

export interface AiActionResultDestination {
  page: string;
  query?: Record<string, string>;
}

export function aiActionResultDestination(
  type: string,
  id: string,
  projectId?: string,
): AiActionResultDestination | null {
  if (type.includes('requirement')) return { page: 'requirements', query: { focus: id } };
  if (type.includes('defect') || type.includes('test_case')) {
    return { page: 'testing', query: { tab: type.includes('defect') ? 'defects' : 'cases', focus: id } };
  }
  if (type.includes('task') || type.includes('sprint') || type.includes('project') || type.includes('risk')) {
    return { page: 'projects', query: { focus: projectId || id } };
  }
  if (type.includes('product') || type.includes('program') || type.includes('portfolio') || type.includes('strategic')) {
    return { page: 'products' };
  }
  if (type.includes('build') || type.includes('release')) return { page: 'delivery', query: { focus: id } };
  if (type.includes('document')) return { page: 'documents', query: { focus: id } };
  if (type.includes('work_log') || type.includes('time_entry')) return { page: 'mywork' };
  return null;
}

export function openAiActionResult(type: string, id: string, projectId?: string): void {
  const destination = aiActionResultDestination(type, id, projectId);
  if (destination) navigateTo(destination.page, destination.query);
}
