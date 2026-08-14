import { canOperate } from '../../constants/roles';
import type { SessionUser } from '../../types';

export type AiActionKind =
  | 'requirement'
  | 'defect'
  | 'test_case'
  | 'task'
  | 'project'
  | 'product'
  | 'delivery'
  | 'document'
  | 'sprint'
  | 'personal'
  | 'risk'
  | 'other';

export function aiActionKind(type: string): AiActionKind {
  if (type.includes('requirement')) return 'requirement';
  if (type.includes('defect')) return 'defect';
  if (type.includes('test_case')) return 'test_case';
  if (type.includes('task')) return 'task';
  if (type.includes('project')) return 'project';
  if (type.includes('product') || type.includes('program') || type.includes('portfolio') || type.includes('strategic')) return 'product';
  if (type.includes('build') || type.includes('release')) return 'delivery';
  if (type.includes('document')) return 'document';
  if (type.includes('sprint')) return 'sprint';
  if (type.includes('work_log') || type.includes('time_entry')) return 'personal';
  if (type.includes('risk')) return 'risk';
  return 'other';
}

export function canWriteAiAction(user: SessionUser | null | undefined, type: string): boolean {
  const kind = aiActionKind(type);
  if (kind === 'requirement') return canOperate(user, 'requirements:manage');
  if (kind === 'defect' || kind === 'test_case') return canOperate(user, 'testing:manage');
  if (kind === 'task' || kind === 'project' || kind === 'sprint' || kind === 'risk') return canOperate(user, 'projects:manage');
  if (kind === 'product') return canOperate(user, 'products:manage');
  if (kind === 'delivery') return canOperate(user, 'delivery:manage') || canOperate(user, 'projects:manage');
  if (kind === 'document') return canOperate(user, 'documents:manage');
  if (kind === 'personal') return true;
  return canOperate(user, 'projects:manage');
}
