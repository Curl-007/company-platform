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

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: '规划中',
  active: '进行中',
  on_hold: '暂停',
  done: '已完成',
  archived: '已归档',
};

export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  reviewing: '评审中',
  approved: '已批准',
  in_dev: '开发中',
  testing: '测试中',
  accepted: '已验收',
  closed: '已关闭',
  cancelled: '已取消',
};

export const PRIORITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: '待处理',
  in_progress: '进行中',
  blocked: '阻塞',
  code_review: '代码评审',
  testing: '测试中',
  acceptance: '待验收',
  done: '已完成',
  cancelled: '已取消',
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  epic: '史诗',
  story: '故事',
  task: '任务',
  bug: '缺陷',
  milestone: '里程碑',
  work_package: '工作包',
};

export const SPRINT_STATUS_LABELS: Record<string, string> = {
  planned: '已规划',
  active: '进行中',
  closed: '已关闭',
};

export const TEST_CASE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '活跃',
  passed: '通过',
  failed: '失败',
  blocked: '阻塞',
};

export const TEST_RUN_RESULT_LABELS: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  blocked: '阻塞',
};

export const DEFECT_STATUS_LABELS: Record<string, string> = {
  new: '新建',
  confirmed: '已确认',
  in_fix: '修复中',
  resolved: '已解决',
  verified: '已验证',
  closed: '已关闭',
  rejected: '已驳回',
};

export const DEFECT_SEVERITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

export const PROCESS_MODE_LABELS: Record<string, string> = {
  scrum: 'Scrum',
  kanban: '看板',
  waterfall: '瀑布',
};

export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  planned: '已规划',
  running: '进行中',
  done: '已完成',
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  requirement: '需求文档',
  design: '设计文档',
  test: '测试文档',
  bid: '投标文件',
  report: '报告',
  other: '其他',
};

export const DOC_AI_STATUS_LABELS: Record<string, string> = {
  uploaded: '已上传',
  processing: '分析中',
  awaiting_review: '待审核',
  done: '已完成',
  failed: '处理失败',
};

export const USER_ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  pm: '项目经理',
  pdm: '产品经理',
  member: '成员',
  dev: '开发',
  qa: '测试',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  disabled: '已禁用',
};

export const PRODUCT_STAGE_LABELS: Record<string, string> = {
  concept: '概念阶段',
  design: '设计阶段',
  development: '开发阶段',
  mvp: 'MVP 交付',
  released: '已发布',
  maintenance: '维护期',
  evaluating: '评估中',
  planned: '已规划',
};

export const ROADMAP_STATUS_LABELS: Record<string, string> = {
  planned: '已规划',
  design: '设计中',
  development: '开发中',
  evaluating: '评估中',
  released: '已发布',
  done: '已完成',
};

export const MODULE_STATUS_LABELS: Record<string, string> = {
  planned: '已规划',
  design: '设计中',
  development: '开发中',
  done: '已完成',
  released: '已发布',
};

export const GATE_STATUS_LABELS: Record<string, string> = {
  pending: '待评审',
  in_progress: '评审中',
  completed: '已通过',
  rejected: '已驳回',
};

export const BUILD_STATUS_LABELS: Record<string, string> = {
  building: '构建中',
  testing: '测试中',
  released: '已发布',
  failed: '构建失败',
};

export const RELEASE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  staging: '预发布',
  released: '已发布',
  rollback: '已回滚',
};

export const RELEASE_TYPE_LABELS: Record<string, string> = {
  official: '正式版',
  stable: '稳定版',
  hotfix: '热修复',
};

export const AI_JOB_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  awaiting_review: '待审核',
  confirmed: '已确认',
  rejected: '已驳回',
  failed: '失败',
  retried: '重试中',
};

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  project: '项目',
  task: '任务',
  requirement: '需求',
  sprint: '迭代',
  test_case: '测试用例',
  test_run: '测试执行',
  defect: '缺陷',
  document: '文档',
  object: '文件',
  ai_job: 'AI 任务',
  work_log: '工作日志',
  user: '用户',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': '登录',
  'auth.login_failed': '登录失败',
  'auth.login_disabled': '账号已禁用',
  'project.create': '创建项目',
  'project.update': '更新项目',
  'project.status_update': '变更项目状态',
  'project.delete': '删除项目',
  'project.milestone_add': '添加里程碑',
  'project.milestone_remove': '移除里程碑',
  'sprint.create': '创建迭代',
  'sprint.update': '更新迭代',
  'sprint.delete': '删除迭代',
  'sprint.add_task': '加入迭代',
  'task.create': '创建任务',
  'task.update': '更新任务',
  'task.status_update': '变更任务状态',
  'task.kanban_move': '移动看板',
  'task.delete': '删除任务',
  'requirement.create': '创建需求',
  'requirement.update': '更新需求',
  'requirement.status_update': '变更需求状态',
  'requirement.delete': '删除需求',
  'test_case.create': '创建测试用例',
  'test_case.update': '更新测试用例',
  'test_case.status_update': '变更用例状态',
  'test_case.delete': '删除测试用例',
  'test_run.create': '记录测试执行',
  'document.upload': '上传文档',
  'document.update': '更新文档',
  'document.delete': '删除文档',
  'object.upload': '上传文件',
  'ai.document_analyze': 'AI 文档分析',
  'ai.job_confirm': '确认 AI 结果',
  'ai.job_reject': '驳回 AI 结果',
  'ai.job_retry': '重试 AI 任务',
  'ai.job_retry_failed': 'AI 重试失败',
  'work_log.create': '提交工作日志',
  'user.create': '创建用户',
  'user.update': '更新用户',
};

export function labelOf(dict: Record<string, string>, value: string | undefined | null): string {
  if (!value) return '未设置';
  return dict[value] ?? value;
}
