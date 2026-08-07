import type { AuditLogFilters } from '../api';
import type { AuditLogRecord } from '../../../types';
import { businessDateKey, businessWeekStart } from '../../../utils/businessDate';
import { getInterfaceLocale } from '../../../i18n';
import i18n from '../../../i18n';

export interface TimelineEntry {
  record: AuditLogRecord;
  title: string;
  detail: string;
  actionLabel: string;
  category: EntryCategory;
  categoryLabel: string;
  categoryVariant: 'success' | 'warning' | 'risk' | 'info' | 'blocked' | 'neutral';
  isImportant: boolean;
  resourceLabel: string;
}

export interface ChangeItem {
  label: string;
  before: string;
  after: string;
}

export type EntryCategory = 'auth' | 'page' | 'project' | 'product' | 'requirement' | 'task' | 'testing' | 'document' | 'report' | 'user' | 'other';
export type TimeRange = 'all' | 'today' | 'week';

export const PAGE_LABELS: Record<string, string> = {
  dashboard: 'features.audit.dynamicMeta.page.dashboard',
  projects: 'features.audit.dynamicMeta.page.projects',
  mywork: 'features.audit.dynamicMeta.page.mywork',
  teamlogs: 'features.audit.dynamicMeta.page.teamlogs',
  requirements: 'features.audit.dynamicMeta.page.requirements',
  testing: 'features.audit.dynamicMeta.page.testing',
  documents: 'features.audit.dynamicMeta.page.documents',
  products: 'features.audit.dynamicMeta.page.products',
  reports: 'features.audit.dynamicMeta.page.reports',
  flow: 'features.audit.dynamicMeta.page.flow',
  dynamic: 'features.audit.dynamicMeta.page.dynamic',
  ai: 'features.audit.dynamicMeta.page.ai',
  settings: 'features.audit.dynamicMeta.page.settings',
  builds: 'features.audit.dynamicMeta.page.builds',
  releases: 'features.audit.dynamicMeta.page.releases',
  users: 'features.audit.dynamicMeta.page.users',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'enums.userRole.admin',
  pm: 'enums.userRole.pm',
  pdm: 'enums.userRole.pdm',
  dev: 'enums.userRole.dev',
  qa: 'enums.userRole.qa',
  member: 'enums.userRole.member',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  active: 'enums.userStatus.active',
  disabled: 'enums.userStatus.disabled',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: 'enums.projectStatus.planning',
  active: 'enums.projectStatus.active',
  on_hold: 'enums.projectStatus.on_hold',
  done: 'enums.projectStatus.done',
  archived: 'enums.projectStatus.archived',
};

export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'enums.requirementStatus.draft',
  reviewing: 'enums.requirementStatus.reviewing',
  approved: 'enums.requirementStatus.approved',
  in_dev: 'enums.requirementStatus.in_dev',
  testing: 'enums.requirementStatus.testing',
  accepted: 'enums.requirementStatus.accepted',
  closed: 'enums.requirementStatus.closed',
  cancelled: 'enums.requirementStatus.cancelled',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'enums.taskStatus.todo',
  in_progress: 'enums.taskStatus.in_progress',
  blocked: 'enums.taskStatus.blocked',
  code_review: 'enums.taskStatus.code_review',
  testing: 'enums.taskStatus.testing',
  acceptance: 'enums.taskStatus.acceptance',
  done: 'enums.taskStatus.done',
  cancelled: 'enums.taskStatus.cancelled',
};

export const DEFECT_STATUS_LABELS: Record<string, string> = {
  new: 'enums.defectStatus.new',
  confirmed: 'enums.defectStatus.confirmed',
  in_fix: 'enums.defectStatus.in_fix',
  resolved: 'enums.defectStatus.resolved',
  verified: 'enums.defectStatus.verified',
  closed: 'enums.defectStatus.closed',
  rejected: 'enums.defectStatus.rejected',
};

export const TEST_CASE_STATUS_LABELS: Record<string, string> = {
  draft: 'enums.testCaseStatus.draft',
  active: 'enums.testCaseStatus.active',
  passed: 'enums.testCaseStatus.passed',
  failed: 'enums.testCaseStatus.failed',
  blocked: 'enums.testCaseStatus.blocked',
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  project: 'enums.documentCategory.project',
  common: 'enums.documentCategory.common',
  announcement: 'enums.documentCategory.announcement',
  requirement: 'enums.documentCategory.requirement',
  design: 'enums.documentCategory.design',
  test: 'enums.documentCategory.test',
  report: 'enums.documentCategory.report',
  other: 'enums.documentCategory.other',
};

export const CATEGORY_META: Record<EntryCategory, { label: string; variant: TimelineEntry['categoryVariant'] }> = {
  auth: { label: 'features.audit.dynamicMeta.category.auth', variant: 'info' },
  page: { label: 'features.audit.dynamicMeta.category.page', variant: 'neutral' },
  project: { label: 'features.audit.dynamicMeta.category.project', variant: 'success' },
  product: { label: 'features.audit.dynamicMeta.category.product', variant: 'warning' },
  requirement: { label: 'features.audit.dynamicMeta.category.requirement', variant: 'info' },
  task: { label: 'features.audit.dynamicMeta.category.task', variant: 'success' },
  testing: { label: 'features.audit.dynamicMeta.category.testing', variant: 'risk' },
  document: { label: 'features.audit.dynamicMeta.category.document', variant: 'warning' },
  report: { label: 'features.audit.dynamicMeta.category.report', variant: 'blocked' },
  user: { label: 'features.audit.dynamicMeta.category.user', variant: 'risk' },
  other: { label: 'features.audit.dynamicMeta.category.other', variant: 'neutral' },
};

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function labelOf(map: Record<string, string>, key: unknown, fallback?: string): string {
  if (key === null || key === undefined || key === '') return fallback ?? i18n.t('enums.unfilled');
  const text = String(key);
  const tKey = map[text];
  if (!tKey) return text;
  return i18n.t(tKey);
}

export function getActorName(record: AuditLogRecord): string {
  return record.actorName || i18n.t('features.audit.dynamicMeta.anonymousUser');
}

export function getRoleLabel(record: AuditLogRecord): string {
  const after = asObject(record.after);
  const before = asObject(record.before);
  const role = String(after.role ?? before.role ?? '');
  return labelOf(ROLE_LABELS, role, '');
}

export function getPageLabel(page: unknown): string {
  const key = String(page ?? '').trim();
  if (!key) return i18n.t('features.audit.dynamicMeta.unknownPage');
  return labelOf(PAGE_LABELS, key);
}

export function getResourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    page: 'features.audit.dynamicMeta.resourceType.page',
    user: 'features.audit.dynamicMeta.resourceType.user',
    project: 'features.audit.dynamicMeta.resourceType.project',
    product: 'features.audit.dynamicMeta.resourceType.product',
    requirement: 'features.audit.dynamicMeta.resourceType.requirement',
    task: 'features.audit.dynamicMeta.resourceType.task',
    defect: 'features.audit.dynamicMeta.resourceType.defect',
    test_case: 'features.audit.dynamicMeta.resourceType.test_case',
    work_log: 'features.audit.dynamicMeta.resourceType.work_log',
    document: 'features.audit.dynamicMeta.resourceType.document',
    release: 'features.audit.dynamicMeta.resourceType.release',
    build: 'features.audit.dynamicMeta.resourceType.build',
    sprint: 'features.audit.dynamicMeta.resourceType.sprint',
  };
  return labels[type] ? i18n.t(labels[type]) : type;
}

export function getResourceLabel(record: AuditLogRecord): string {
  if (record.resourceType === 'page') {
    const after = asObject(record.after);
    return i18n.t('features.audit.dynamicMeta.pageResourceFormat', { page: getPageLabel(after.page ?? record.resourceId) });
  }
  const type = getResourceTypeLabel(record.resourceType);
  return record.resourceId ? `${type} ${record.resourceId}` : type;
}

export function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(getInterfaceLocale(), { hour12: false });
}

export function formatSimpleValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return i18n.t('enums.unfilled');
  if (Array.isArray(value)) {
    const text = value.map((item) => formatSimpleValue(item)).join('、');
    return text || i18n.t('enums.unfilled');
  }
  if (typeof value === 'boolean') return value ? i18n.t('features.audit.dynamicMeta.yes') : i18n.t('features.audit.dynamicMeta.no');
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() || i18n.t('enums.unfilled');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: 'features.audit.dynamicMeta.field.name',
    title: 'features.audit.dynamicMeta.field.title',
    role: 'features.audit.dynamicMeta.field.role',
    owner: 'features.audit.dynamicMeta.field.owner',
    status: 'features.audit.dynamicMeta.field.status',
    progress: 'features.audit.dynamicMeta.field.progress',
    page: 'features.audit.dynamicMeta.field.page',
    pageTitle: 'features.audit.dynamicMeta.field.pageTitle',
    description: 'features.audit.dynamicMeta.field.description',
    expectedResult: 'features.audit.dynamicMeta.field.expectedResult',
    category: 'features.audit.dynamicMeta.field.category',
    fileName: 'features.audit.dynamicMeta.field.fileName',
    projectName: 'features.audit.dynamicMeta.field.projectName',
    projectId: 'features.audit.dynamicMeta.field.projectId',
    productId: 'features.audit.dynamicMeta.field.productId',
    assignee: 'features.audit.dynamicMeta.field.assignee',
    assigneeId: 'features.audit.dynamicMeta.field.assigneeId',
    assigneeRole: 'features.audit.dynamicMeta.field.assigneeRole',
    blockers: 'features.audit.dynamicMeta.field.blockers',
    nextPlan: 'features.audit.dynamicMeta.field.nextPlan',
    content: 'features.audit.dynamicMeta.field.content',
    email: 'features.audit.dynamicMeta.field.email',
    stage: 'features.audit.dynamicMeta.field.stage',
    systemVersion: 'features.audit.dynamicMeta.field.systemVersion',
    appVersion: 'features.audit.dynamicMeta.field.appVersion',
    kanbanColumn: 'features.audit.dynamicMeta.field.kanbanColumn',
  };
  return labels[field] ? i18n.t(labels[field]) : field;
}

export function formatFieldValue(field: string, value: unknown): string {
  if (field === 'page' || field === 'pageTitle') return getPageLabel(value);
  if (field === 'role' || field === 'assigneeRole') return labelOf(ROLE_LABELS, value);
  if (field === 'category') return labelOf(DOCUMENT_CATEGORY_LABELS, value);
  if (field === 'status') return formatSimpleValue(value);
  return formatSimpleValue(value);
}

export function getActionCategory(action: string): EntryCategory {
  if (action.startsWith('auth.')) return 'auth';
  if (action === 'page.view') return 'page';
  if (action.startsWith('project.')) return 'project';
  if (action.startsWith('product.')) return 'product';
  if (action.startsWith('requirement.')) return 'requirement';
  if (action.startsWith('task.')) return 'task';
  if (action.startsWith('test_case.') || action.startsWith('defect.')) return 'testing';
  if (action.startsWith('document.') || action.startsWith('work_log.')) return 'document';
  if (action.startsWith('build.') || action.startsWith('release.')) return 'report';
  if (action.startsWith('user.')) return 'user';
  return 'other';
}

export function dateRangeFor(range: TimeRange): Pick<AuditLogFilters, 'dateFrom' | 'dateTo'> {
  if (range === 'all') return {};
  const now = new Date();
  const end = businessDateKey(now);
  if (range === 'today') return { dateFrom: end, dateTo: end };
  return { dateFrom: businessWeekStart(now), dateTo: end };
}

export function getResourceTarget(record: AuditLogRecord): string | null {
  if (!record.resourceId) return null;
  const encoded = encodeURIComponent(record.resourceId);
  if (record.resourceType === 'page') {
    const page = String(asObject(record.after).page ?? record.resourceId ?? '').trim();
    return page ? `#/${page}` : null;
  }
  if (record.resourceType === 'project') return `#/projects?focus=${encoded}`;
  if (record.resourceType === 'product') return '#/products';
  if (record.resourceType === 'requirement') return `#/requirements?focus=${encoded}`;
  if (record.resourceType === 'task') return '#/projects';
  if (record.resourceType === 'defect') return `#/testing?tab=defects&focus=${encoded}`;
  if (record.resourceType === 'test_case') return `#/testing?tab=cases&focus=${encoded}`;
  if (record.resourceType === 'document') return `#/documents?focus=${encoded}`;
  if (record.resourceType === 'work_log') return '#/teamlogs';
  if (record.resourceType === 'build' || record.resourceType === 'release') return `#/delivery?focus=${encoded}`;
  if (record.resourceType === 'user') return '#/team';
  return null;
}

export function openResource(record: AuditLogRecord) {
  const target = getResourceTarget(record);
  if (target) window.location.hash = target;
}

export function isImportantAction(record: AuditLogRecord): boolean {
  const action = record.action;
  return [
    'auth.login_failed',
    'auth.login_disabled',
    'user.update',
    'product.delete',
    'document.delete',
    'requirement.status_update',
    'defect.status_update',
    'task.kanban_move',
    'release.delete',
    'build.update',
  ].includes(action);
}

export function shouldShowDiff(record: AuditLogRecord): boolean {
  if (!record.before && !record.after) return false;
  return !['auth.login', 'auth.login_failed', 'auth.login_disabled', 'page.view'].includes(record.action);
}

export function pushChange(changes: ChangeItem[], label: string, before: unknown, after: unknown) {
  const beforeText = formatSimpleValue(before);
  const afterText = formatSimpleValue(after);
  if (beforeText === afterText) return;
  changes.push({ label, before: beforeText, after: afterText });
}

export function buildChangeSummary(record: AuditLogRecord): ChangeItem[] {
  const before = asObject(record.before);
  const after = asObject(record.after);
  const changes: ChangeItem[] = [];

  if (record.action === 'user.update') {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.accountStatus'), labelOf(USER_STATUS_LABELS, before.status), labelOf(USER_STATUS_LABELS, after.status));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.role'), labelOf(ROLE_LABELS, before.role), labelOf(ROLE_LABELS, after.role));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.name'), before.name, after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.email'), before.email, after.email);
    return changes;
  }

  if (record.action === 'project.update' || record.action === 'project.status_update') {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.projectName'), before.name, after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.owner'), before.owner, after.owner);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.projectStatus'), labelOf(PROJECT_STATUS_LABELS, before.status), labelOf(PROJECT_STATUS_LABELS, after.status));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.progress'), before.progress, after.progress);
    return changes;
  }

  if (record.action.startsWith('requirement.')) {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.requirementTitle'), before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.owner'), before.owner, after.owner);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.requirementStatus'), labelOf(REQUIREMENT_STATUS_LABELS, before.status), labelOf(REQUIREMENT_STATUS_LABELS, after.status));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.description'), before.description, after.description);
    return changes;
  }

  if (record.action.startsWith('task.')) {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.taskTitle'), before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.owner'), before.owner, after.owner);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.taskStatus'), labelOf(TASK_STATUS_LABELS, before.status), labelOf(TASK_STATUS_LABELS, after.status));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.kanbanColumn'), before.kanbanColumn, after.kanbanColumn);
    return changes;
  }

  if (record.action.startsWith('defect.')) {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.defectTitle'), before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.defectStatus'), labelOf(DEFECT_STATUS_LABELS, before.status), labelOf(DEFECT_STATUS_LABELS, after.status));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.owner'), before.owner, after.owner);
    return changes;
  }

  if (record.action.startsWith('test_case.')) {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.caseName'), before.name ?? before.title, after.name ?? after.title);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.owner'), before.owner, after.owner);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.caseStatus'), labelOf(TEST_CASE_STATUS_LABELS, before.status), labelOf(TEST_CASE_STATUS_LABELS, after.status));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.steps'), before.steps, after.steps);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.expectedResult'), before.expectedResult ?? before.expected_result, after.expectedResult ?? after.expected_result);
    return changes;
  }

  if (record.action.startsWith('document.')) {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.documentTitle'), before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.category'), labelOf(DOCUMENT_CATEGORY_LABELS, before.category), labelOf(DOCUMENT_CATEGORY_LABELS, after.category));
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.projectName'), before.projectName ?? before.projectId, after.projectName ?? after.projectId);
    return changes;
  }

  if (record.action === 'product.update') {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.productName'), before.name, after.name);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.stage'), before.stage, after.stage);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.systemVersion'), before.systemVersion, after.systemVersion);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.appVersion'), before.appVersion, after.appVersion);
    return changes;
  }

  if (record.action === 'work_log.create') {
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.projectName'), before.project, after.project);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.change.workContent'), before.content, after.content);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.blockers'), before.blockers, after.blockers);
    pushChange(changes, i18n.t('features.audit.dynamicMeta.field.nextPlan'), before.nextPlan, after.nextPlan);
    return changes;
  }

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => !['password_hash', 'before_json', 'after_json'].includes(key));
  for (const key of keys) {
    const beforeText = formatFieldValue(key, before[key]);
    const afterText = formatFieldValue(key, after[key]);
    if (beforeText === afterText) continue;
    changes.push({ label: getFieldLabel(key), before: beforeText, after: afterText });
  }

  return changes;
}

export function createEntry(record: AuditLogRecord): TimelineEntry {
  const actor = getActorName(record);
  const resourceLabel = getResourceLabel(record);
  const before = asObject(record.before);
  const after = asObject(record.after);
  const category = getActionCategory(record.action);
  const categoryMeta = CATEGORY_META[category];

  if (record.action === 'user.update') {
    const beforeStatus = String(before.status ?? '');
    const afterStatus = String(after.status ?? '');

    if (beforeStatus !== afterStatus && afterStatus === 'disabled') {
      return {
        record,
        title: i18n.t('features.audit.dynamicMeta.entry.disableAccountTitle', { actor }),
        detail: i18n.t('features.audit.dynamicMeta.entry.disableAccountDetail', {
          user: after.name ?? record.resourceId ?? i18n.t('features.audit.dynamicMeta.entry.targetUser'),
        }),
        actionLabel: i18n.t('features.audit.dynamicMeta.entry.disableAccountAction'),
        category,
        categoryLabel: i18n.t(categoryMeta.label),
        categoryVariant: categoryMeta.variant,
        isImportant: true,
        resourceLabel,
      };
    }

    if (beforeStatus !== afterStatus && afterStatus === 'active') {
      return {
        record,
        title: i18n.t('features.audit.dynamicMeta.entry.enableAccountTitle', { actor }),
        detail: i18n.t('features.audit.dynamicMeta.entry.enableAccountDetail', {
          user: after.name ?? record.resourceId ?? i18n.t('features.audit.dynamicMeta.entry.targetUser'),
        }),
        actionLabel: i18n.t('features.audit.dynamicMeta.entry.enableAccountAction'),
        category,
        categoryLabel: i18n.t(categoryMeta.label),
        categoryVariant: categoryMeta.variant,
        isImportant: true,
        resourceLabel,
      };
    }
  }

  const base: Omit<TimelineEntry, 'title' | 'detail' | 'actionLabel'> = {
    record,
    category,
    categoryLabel: i18n.t(categoryMeta.label),
    categoryVariant: categoryMeta.variant,
    isImportant: isImportantAction(record),
    resourceLabel,
  };

  switch (record.action) {
    case 'auth.login':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.loginTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.loginDetail'), actionLabel: i18n.t('features.audit.dynamicMeta.entry.loginAction') };
    case 'auth.login_failed':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.loginFailedTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.loginFailedDetail'), actionLabel: i18n.t('features.audit.dynamicMeta.entry.loginFailedAction') };
    case 'auth.login_disabled':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.loginDisabledTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.loginDisabledDetail'), actionLabel: i18n.t('features.audit.dynamicMeta.entry.loginDisabledAction') };
    case 'page.view': {
      const pageName = getPageLabel(after.page ?? record.resourceId);
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.pageViewTitle', { actor, pageName }), detail: i18n.t('features.audit.dynamicMeta.entry.pageViewDetail', { pageName }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.pageViewAction') };
    }
    case 'project.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.projectCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.createdDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.projectCreateAction') };
    case 'project.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.projectUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.projectUpdateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.projectUpdateAction') };
    case 'project.status_update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.projectStatusUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.projectStatusUpdateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.projectStatusUpdateAction') };
    case 'project.member_add':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.memberAddTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.memberAddDetail', { member: after.userName ?? after.name ?? i18n.t('features.audit.dynamicMeta.entry.newMember'), resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.memberAddAction') };
    case 'project.member_remove':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.memberRemoveTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.memberRemoveDetail', { member: before.userName ?? before.name ?? i18n.t('features.audit.dynamicMeta.entry.member'), resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.memberRemoveAction') };
    case 'product.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.productCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.createdDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.productCreateAction') };
    case 'product.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.productUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.productUpdateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.productUpdateAction') };
    case 'product.delete':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.productDeleteTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.deletedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.productDeleteAction') };
    case 'document.upload':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.documentUploadTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.documentUploadAction') };
    case 'document.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.documentUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.documentUpdateAction') };
    case 'document.delete':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.documentDeleteTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.deletedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.documentDeleteAction') };
    case 'work_log.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.workLogCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.workLogCreateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.workLogCreateAction') };
    case 'requirement.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.requirementCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.requirementCreateAction') };
    case 'requirement.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.requirementUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.requirementUpdateAction') };
    case 'requirement.status_update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.requirementStatusUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.requirementStatusUpdateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.requirementStatusUpdateAction') };
    case 'defect.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.defectCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.defectCreateAction') };
    case 'defect.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.defectUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.defectUpdateAction') };
    case 'defect.status_update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.defectStatusUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.defectStatusUpdateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.defectStatusUpdateAction') };
    case 'test_case.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.testCaseCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.testCaseCreateAction') };
    case 'test_case.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.testCaseUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.testCaseUpdateAction') };
    case 'task.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.taskCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.taskCreateAction') };
    case 'task.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.taskUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.taskUpdateAction') };
    case 'task.status_update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.taskStatusUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.taskStatusUpdateDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.taskStatusUpdateAction') };
    case 'task.kanban_move':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.taskKanbanMoveTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.taskKanbanMoveDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.taskKanbanMoveAction') };
    case 'release.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.releaseCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.releaseCreateAction') };
    case 'release.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.releaseUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.releaseUpdateAction') };
    case 'release.delete':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.releaseDeleteTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.deletedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.releaseDeleteAction') };
    case 'build.create':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.buildCreateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.addedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.buildCreateAction') };
    case 'build.update':
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.buildUpdateTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.updatedDetail', { resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.buildUpdateAction') };
    default:
      return { ...base, title: i18n.t('features.audit.dynamicMeta.entry.defaultTitle', { actor }), detail: i18n.t('features.audit.dynamicMeta.entry.defaultDetail', { action: record.action, resource: resourceLabel }), actionLabel: i18n.t('features.audit.dynamicMeta.entry.defaultAction') };
  }
}
