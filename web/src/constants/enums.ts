import i18n from '../i18n';
import {
  AI_JOB_STATUSES as GENERATED_AI_JOB_STATUSES,
  BUILD_STATUSES as GENERATED_BUILD_STATUSES,
  DEFECT_SEVERITIES as GENERATED_DEFECT_SEVERITIES,
  DEFECT_STATUSES as GENERATED_DEFECT_STATUSES,
  DOCUMENT_CATEGORIES as GENERATED_DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES as GENERATED_DOCUMENT_TYPES,
  PROJECT_STATUSES as GENERATED_PROJECT_STATUSES,
  RELEASE_APPROVAL_DECISIONS as GENERATED_RELEASE_APPROVAL_DECISIONS,
  RELEASE_STATUSES as GENERATED_RELEASE_STATUSES,
  RELEASE_TYPES as GENERATED_RELEASE_TYPES,
  REQUIREMENT_PRIORITIES as GENERATED_REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES as GENERATED_REQUIREMENT_STATUSES,
  SERVER_ENUMS,
  SPRINT_STATUSES as GENERATED_SPRINT_STATUSES,
  TASK_STATUSES as GENERATED_TASK_STATUSES,
  TASK_TYPES as GENERATED_TASK_TYPES,
  TEST_CASE_STATUSES as GENERATED_TEST_CASE_STATUSES,
  TEST_RUN_RESULTS as GENERATED_TEST_RUN_RESULTS,
  USER_ROLES as GENERATED_USER_ROLES,
  USER_STATUSES as GENERATED_USER_STATUSES,
  WORK_ITEM_ROLES as GENERATED_WORK_ITEM_ROLES,
} from './serverEnums.generated';

export { SERVER_ENUMS };

export const PROJECT_STATUSES = GENERATED_PROJECT_STATUSES;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const REQUIREMENT_STATUSES = GENERATED_REQUIREMENT_STATUSES;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_PRIORITIES = GENERATED_REQUIREMENT_PRIORITIES;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

export const TASK_STATUSES = GENERATED_TASK_STATUSES;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TYPES = GENERATED_TASK_TYPES;
export type TaskType = (typeof TASK_TYPES)[number];

export const SPRINT_STATUSES = GENERATED_SPRINT_STATUSES;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const TEST_CASE_STATUSES = GENERATED_TEST_CASE_STATUSES;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export const TEST_RUN_RESULTS = GENERATED_TEST_RUN_RESULTS;
export type TestRunResult = (typeof TEST_RUN_RESULTS)[number];

export const DEFECT_STATUSES = GENERATED_DEFECT_STATUSES;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const DEFECT_SEVERITIES = GENERATED_DEFECT_SEVERITIES;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const BUILD_STATUSES = GENERATED_BUILD_STATUSES;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

export const RELEASE_STATUSES = GENERATED_RELEASE_STATUSES;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const RELEASE_TYPES = GENERATED_RELEASE_TYPES;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export const RELEASE_APPROVAL_DECISIONS = GENERATED_RELEASE_APPROVAL_DECISIONS;
export type ReleaseApprovalDecision = (typeof RELEASE_APPROVAL_DECISIONS)[number];

export const DOCUMENT_CATEGORIES = GENERATED_DOCUMENT_CATEGORIES;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_TYPES = GENERATED_DOCUMENT_TYPES;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const USER_ROLES = GENERATED_USER_ROLES;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = GENERATED_USER_STATUSES;
export type UserStatus = (typeof USER_STATUSES)[number];

export const WORK_ITEM_ROLES = GENERATED_WORK_ITEM_ROLES;
export type WorkItemRole = (typeof WORK_ITEM_ROLES)[number];

export const AI_JOB_STATUSES = GENERATED_AI_JOB_STATUSES;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const HEALTH_THRESHOLD_OK = 75;
export const HEALTH_THRESHOLD_WARN = 50;

export type HealthVariant = 'success' | 'warning' | 'risk';

export function healthVariant(score: number): HealthVariant {
  if (score >= HEALTH_THRESHOLD_OK) return 'success';
  if (score >= HEALTH_THRESHOLD_WARN) return 'warning';
  return 'risk';
}

// 说明：以下 label 字典的 value 均为 i18n key（enums.<group>.<code>），
// 实际文案位于 src/i18n/locales/*.json 的 enums 命名空间。
// 请勿将中文写回 value；通过 labelOf() 翻译后使用。

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

export const PRIORITY_LABELS: Record<string, string> = {
  high: 'enums.priority.high',
  medium: 'enums.priority.medium',
  low: 'enums.priority.low',
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

export const TASK_TYPE_LABELS: Record<string, string> = {
  epic: 'enums.taskType.epic',
  story: 'enums.taskType.story',
  task: 'enums.taskType.task',
  bug: 'enums.taskType.bug',
  milestone: 'enums.taskType.milestone',
  work_package: 'enums.taskType.work_package',
};

export const SPRINT_STATUS_LABELS: Record<string, string> = {
  planned: 'enums.sprintStatus.planned',
  active: 'enums.sprintStatus.active',
  closed: 'enums.sprintStatus.closed',
};

export const TEST_CASE_STATUS_LABELS: Record<string, string> = {
  draft: 'enums.testCaseStatus.draft',
  active: 'enums.testCaseStatus.active',
  passed: 'enums.testCaseStatus.passed',
  failed: 'enums.testCaseStatus.failed',
  blocked: 'enums.testCaseStatus.blocked',
};

export const TEST_RUN_RESULT_LABELS: Record<string, string> = {
  passed: 'enums.testRunResult.passed',
  failed: 'enums.testRunResult.failed',
  blocked: 'enums.testRunResult.blocked',
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

export const DEFECT_SEVERITY_LABELS: Record<string, string> = {
  low: 'enums.defectSeverity.low',
  medium: 'enums.defectSeverity.medium',
  high: 'enums.defectSeverity.high',
  critical: 'enums.defectSeverity.critical',
};

export const PROCESS_MODE_LABELS: Record<string, string> = {
  scrum: 'enums.processMode.scrum',
  kanban: 'enums.processMode.kanban',
  waterfall: 'enums.processMode.waterfall',
};

export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  planned: 'enums.milestoneStatus.planned',
  running: 'enums.milestoneStatus.running',
  done: 'enums.milestoneStatus.done',
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  requirement: 'enums.docType.requirement',
  design: 'enums.docType.design',
  test: 'enums.docType.test',
  bid: 'enums.docType.bid',
  report: 'enums.docType.report',
  other: 'enums.docType.other',
};

export const DOC_AI_STATUS_LABELS: Record<string, string> = {
  uploaded: 'enums.docAiStatus.uploaded',
  processing: 'enums.docAiStatus.processing',
  awaiting_review: 'enums.docAiStatus.awaiting_review',
  done: 'enums.docAiStatus.done',
  failed: 'enums.docAiStatus.failed',
};

export const USER_ROLE_LABELS: Record<string, string> = {
  admin: 'enums.userRole.admin',
  pm: 'enums.userRole.pm',
  pdm: 'enums.userRole.pdm',
  member: 'enums.userRole.member',
  dev: 'enums.userRole.dev',
  qa: 'enums.userRole.qa',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  active: 'enums.userStatus.active',
  disabled: 'enums.userStatus.disabled',
};

export const PRODUCT_STAGE_LABELS: Record<string, string> = {
  concept: 'enums.productStage.concept',
  design: 'enums.productStage.design',
  development: 'enums.productStage.development',
  mvp: 'enums.productStage.mvp',
  released: 'enums.productStage.released',
  maintenance: 'enums.productStage.maintenance',
  evaluating: 'enums.productStage.evaluating',
  planned: 'enums.productStage.planned',
};

export const ROADMAP_STATUS_LABELS: Record<string, string> = {
  planned: 'enums.roadmapStatus.planned',
  design: 'enums.roadmapStatus.design',
  development: 'enums.roadmapStatus.development',
  evaluating: 'enums.roadmapStatus.evaluating',
  released: 'enums.roadmapStatus.released',
  done: 'enums.roadmapStatus.done',
};

export const MODULE_STATUS_LABELS: Record<string, string> = {
  planned: 'enums.moduleStatus.planned',
  design: 'enums.moduleStatus.design',
  development: 'enums.moduleStatus.development',
  done: 'enums.moduleStatus.done',
  released: 'enums.moduleStatus.released',
};

export const GATE_STATUS_LABELS: Record<string, string> = {
  pending: 'enums.gateStatus.pending',
  in_progress: 'enums.gateStatus.in_progress',
  completed: 'enums.gateStatus.completed',
  rejected: 'enums.gateStatus.rejected',
};

export const BUILD_STATUS_LABELS: Record<string, string> = {
  building: 'enums.buildStatus.building',
  testing: 'enums.buildStatus.testing',
  released: 'enums.buildStatus.released',
  failed: 'enums.buildStatus.failed',
};

export const RELEASE_STATUS_LABELS: Record<string, string> = {
  draft: 'enums.releaseStatus.draft',
  staging: 'enums.releaseStatus.staging',
  released: 'enums.releaseStatus.released',
  rollback: 'enums.releaseStatus.rollback',
};

export const RELEASE_TYPE_LABELS: Record<string, string> = {
  official: 'enums.releaseType.official',
  stable: 'enums.releaseType.stable',
  hotfix: 'enums.releaseType.hotfix',
};

export const AI_JOB_STATUS_LABELS: Record<string, string> = {
  queued: 'enums.aiJobStatus.queued',
  running: 'enums.aiJobStatus.running',
  awaiting_review: 'enums.aiJobStatus.awaiting_review',
  confirmed: 'enums.aiJobStatus.confirmed',
  rejected: 'enums.aiJobStatus.rejected',
  failed: 'enums.aiJobStatus.failed',
  retried: 'enums.aiJobStatus.retried',
};

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  project: 'enums.resourceType.project',
  task: 'enums.resourceType.task',
  requirement: 'enums.resourceType.requirement',
  sprint: 'enums.resourceType.sprint',
  test_case: 'enums.resourceType.test_case',
  test_run: 'enums.resourceType.test_run',
  defect: 'enums.resourceType.defect',
  document: 'enums.resourceType.document',
  object: 'enums.resourceType.object',
  ai_job: 'enums.resourceType.ai_job',
  work_log: 'enums.resourceType.work_log',
  user: 'enums.resourceType.user',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'enums.auditAction.auth.login',
  'auth.login_failed': 'enums.auditAction.auth.login_failed',
  'auth.login_disabled': 'enums.auditAction.auth.login_disabled',
  'project.create': 'enums.auditAction.project.create',
  'project.update': 'enums.auditAction.project.update',
  'project.status_update': 'enums.auditAction.project.status_update',
  'project.delete': 'enums.auditAction.project.delete',
  'project.milestone_add': 'enums.auditAction.project.milestone_add',
  'project.milestone_remove': 'enums.auditAction.project.milestone_remove',
  'sprint.create': 'enums.auditAction.sprint.create',
  'sprint.update': 'enums.auditAction.sprint.update',
  'sprint.delete': 'enums.auditAction.sprint.delete',
  'sprint.add_task': 'enums.auditAction.sprint.add_task',
  'task.create': 'enums.auditAction.task.create',
  'task.update': 'enums.auditAction.task.update',
  'task.status_update': 'enums.auditAction.task.status_update',
  'task.kanban_move': 'enums.auditAction.task.kanban_move',
  'task.delete': 'enums.auditAction.task.delete',
  'requirement.create': 'enums.auditAction.requirement.create',
  'requirement.update': 'enums.auditAction.requirement.update',
  'requirement.status_update': 'enums.auditAction.requirement.status_update',
  'requirement.delete': 'enums.auditAction.requirement.delete',
  'test_case.create': 'enums.auditAction.test_case.create',
  'test_case.update': 'enums.auditAction.test_case.update',
  'test_case.status_update': 'enums.auditAction.test_case.status_update',
  'test_case.delete': 'enums.auditAction.test_case.delete',
  'test_run.create': 'enums.auditAction.test_run.create',
  'document.upload': 'enums.auditAction.document.upload',
  'document.update': 'enums.auditAction.document.update',
  'document.delete': 'enums.auditAction.document.delete',
  'object.upload': 'enums.auditAction.object.upload',
  'ai.document_analyze': 'enums.auditAction.ai.document_analyze',
  'ai.job_confirm': 'enums.auditAction.ai.job_confirm',
  'ai.job_reject': 'enums.auditAction.ai.job_reject',
  'ai.job_retry': 'enums.auditAction.ai.job_retry',
  'ai.job_retry_failed': 'enums.auditAction.ai.job_retry_failed',
  'work_log.create': 'enums.auditAction.work_log.create',
  'user.create': 'enums.auditAction.user.create',
  'user.update': 'enums.auditAction.user.update',
};

export function labelOf(dict: Record<string, string>, value: string | undefined | null): string {
  if (!value) return i18n.t('enums.unset');
  const key = dict[value];
  if (!key) return value;
  return i18n.t(key);
}
