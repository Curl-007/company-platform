import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, ExternalLink, Eye, Radar, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { fetchAuditLogs, type AuditLogFilters } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import StatusBadge from '../components/common/StatusBadge';
import FilterBar from '../components/common/FilterBar';
import type { AuditLogRecord } from '../types';

interface TimelineEntry {
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

interface ChangeItem {
  label: string;
  before: string;
  after: string;
}

type EntryCategory = 'auth' | 'page' | 'project' | 'product' | 'requirement' | 'task' | 'testing' | 'document' | 'report' | 'user' | 'other';
type TimeRange = 'all' | 'today' | 'week';

const PAGE_LABELS: Record<string, string> = {
  dashboard: '工作台',
  projects: '项目管理',
  mywork: '我的工作',
  teamlogs: '团队日报',
  requirements: '需求管理',
  testing: '测试管理',
  documents: '文档中心',
  products: '产品管理',
  reports: '报表中心',
  flow: '研发流程',
  dynamic: '动态中心',
  ai: 'AI 分析中心',
  settings: '系统设置',
  builds: '构建管理',
  releases: '发布管理',
  users: '用户管理',
};

const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  pm: '项目经理',
  pdm: '产品经理',
  dev: '开发人员',
  qa: '测试人员',
  member: '项目成员',
};

const USER_STATUS_LABELS: Record<string, string> = {
  active: '已启用',
  disabled: '已禁用',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: '规划中',
  active: '进行中',
  on_hold: '已暂停',
  done: '已完成',
  archived: '已归档',
};

const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  reviewing: '评审中',
  approved: '已批准',
  in_dev: '开发中',
  testing: '测试中',
  accepted: '已验收',
  closed: '已关闭',
  cancelled: '已取消',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: '待处理',
  in_progress: '进行中',
  blocked: '阻塞',
  code_review: '代码评审',
  testing: '测试中',
  acceptance: '待验收',
  done: '已完成',
  cancelled: '已取消',
};

const DEFECT_STATUS_LABELS: Record<string, string> = {
  new: '新建',
  confirmed: '已确认',
  in_fix: '修复中',
  resolved: '已解决',
  verified: '已验证',
  closed: '已关闭',
  rejected: '已驳回',
};

const TEST_CASE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  passed: '已通过',
  failed: '未通过',
  blocked: '阻塞',
};

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  project: '项目文档',
  common: '通用文档',
  announcement: '公司公告',
  requirement: '需求文档',
  design: '设计文档',
  test: '测试文档',
  report: '报告文档',
  other: '其他文档',
};

const CATEGORY_META: Record<EntryCategory, { label: string; variant: TimelineEntry['categoryVariant'] }> = {
  auth: { label: '登录动态', variant: 'info' },
  page: { label: '页面访问', variant: 'neutral' },
  project: { label: '项目协同', variant: 'success' },
  product: { label: '产品管理', variant: 'warning' },
  requirement: { label: '需求流转', variant: 'info' },
  task: { label: '任务推进', variant: 'success' },
  testing: { label: '测试缺陷', variant: 'risk' },
  document: { label: '文档日报', variant: 'warning' },
  report: { label: '构建发布', variant: 'blocked' },
  user: { label: '账号权限', variant: 'risk' },
  other: { label: '其他操作', variant: 'neutral' },
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function labelOf(map: Record<string, string>, key: unknown, fallback = '未填写'): string {
  if (key === null || key === undefined || key === '') return fallback;
  const text = String(key);
  return map[text] ?? text;
}

function getActorName(record: AuditLogRecord): string {
  return record.actorName || '匿名用户';
}

function getRoleLabel(record: AuditLogRecord): string {
  const after = asObject(record.after);
  const before = asObject(record.before);
  const role = String(after.role ?? before.role ?? '');
  return labelOf(ROLE_LABELS, role, '');
}

function getPageLabel(page: unknown): string {
  const key = String(page ?? '').trim();
  if (!key) return '未知页面';
  return PAGE_LABELS[key] ?? key;
}

function getResourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    page: '页面',
    user: '用户',
    project: '项目',
    product: '产品',
    requirement: '需求',
    task: '任务',
    defect: '缺陷',
    test_case: '测试用例',
    work_log: '日报',
    document: '文档',
    release: '发布',
    build: '构建',
    sprint: '迭代',
  };
  return labels[type] ?? type;
}

function getResourceLabel(record: AuditLogRecord): string {
  if (record.resourceType === 'page') {
    const after = asObject(record.after);
    return `${getPageLabel(after.page ?? record.resourceId)}页面`;
  }
  const type = getResourceTypeLabel(record.resourceType);
  return record.resourceId ? `${type} ${record.resourceId}` : type;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false });
}

function formatSimpleValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写';
  if (Array.isArray(value)) {
    const text = value.map((item) => formatSimpleValue(item)).join('、');
    return text || '未填写';
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() || '未填写';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: '名称',
    title: '标题',
    role: '角色',
    owner: '负责人',
    status: '状态',
    progress: '进度',
    page: '访问页面',
    pageTitle: '页面标题',
    description: '描述',
    expectedResult: '预期结果',
    category: '文档分类',
    fileName: '文件名',
    projectName: '所属项目',
    projectId: '项目',
    productId: '产品',
    assignee: '指派给',
    assigneeId: '指派对象',
    assigneeRole: '指派角色',
    blockers: '阻塞项',
    nextPlan: '下一步计划',
    content: '内容',
    email: '邮箱',
    stage: '产品阶段',
    systemVersion: '系统版本',
    appVersion: '应用版本',
    kanbanColumn: '看板列',
  };
  return labels[field] ?? field;
}

function formatFieldValue(field: string, value: unknown): string {
  if (field === 'page' || field === 'pageTitle') return getPageLabel(value);
  if (field === 'role' || field === 'assigneeRole') return labelOf(ROLE_LABELS, value);
  if (field === 'category') return labelOf(DOCUMENT_CATEGORY_LABELS, value);
  if (field === 'status') return formatSimpleValue(value);
  return formatSimpleValue(value);
}

function getActionCategory(action: string): EntryCategory {
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

function dateRangeFor(range: TimeRange): Pick<AuditLogFilters, 'dateFrom' | 'dateTo'> {
  if (range === 'all') return {};
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (range === 'today') return { dateFrom: end, dateTo: end };
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end };
}

function getResourceTarget(record: AuditLogRecord): string | null {
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

function openResource(record: AuditLogRecord) {
  const target = getResourceTarget(record);
  if (target) window.location.hash = target;
}

function isImportantAction(record: AuditLogRecord): boolean {
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

function shouldShowDiff(record: AuditLogRecord): boolean {
  if (!record.before && !record.after) return false;
  return !['auth.login', 'auth.login_failed', 'auth.login_disabled', 'page.view'].includes(record.action);
}

function pushChange(changes: ChangeItem[], label: string, before: unknown, after: unknown) {
  const beforeText = formatSimpleValue(before);
  const afterText = formatSimpleValue(after);
  if (beforeText === afterText) return;
  changes.push({ label, before: beforeText, after: afterText });
}

function buildChangeSummary(record: AuditLogRecord): ChangeItem[] {
  const before = asObject(record.before);
  const after = asObject(record.after);
  const changes: ChangeItem[] = [];

  if (record.action === 'user.update') {
    pushChange(changes, '账号状态', labelOf(USER_STATUS_LABELS, before.status), labelOf(USER_STATUS_LABELS, after.status));
    pushChange(changes, '角色', labelOf(ROLE_LABELS, before.role), labelOf(ROLE_LABELS, after.role));
    pushChange(changes, '姓名', before.name, after.name);
    pushChange(changes, '邮箱', before.email, after.email);
    return changes;
  }

  if (record.action === 'project.update' || record.action === 'project.status_update') {
    pushChange(changes, '项目名称', before.name, after.name);
    pushChange(changes, '负责人', before.owner, after.owner);
    pushChange(changes, '项目状态', labelOf(PROJECT_STATUS_LABELS, before.status), labelOf(PROJECT_STATUS_LABELS, after.status));
    pushChange(changes, '进度', before.progress, after.progress);
    return changes;
  }

  if (record.action.startsWith('requirement.')) {
    pushChange(changes, '需求标题', before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, '负责人', before.owner, after.owner);
    pushChange(changes, '需求状态', labelOf(REQUIREMENT_STATUS_LABELS, before.status), labelOf(REQUIREMENT_STATUS_LABELS, after.status));
    pushChange(changes, '描述', before.description, after.description);
    return changes;
  }

  if (record.action.startsWith('task.')) {
    pushChange(changes, '任务标题', before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, '负责人', before.owner, after.owner);
    pushChange(changes, '任务状态', labelOf(TASK_STATUS_LABELS, before.status), labelOf(TASK_STATUS_LABELS, after.status));
    pushChange(changes, '看板列', before.kanbanColumn, after.kanbanColumn);
    return changes;
  }

  if (record.action.startsWith('defect.')) {
    pushChange(changes, '缺陷标题', before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, '缺陷状态', labelOf(DEFECT_STATUS_LABELS, before.status), labelOf(DEFECT_STATUS_LABELS, after.status));
    pushChange(changes, '负责人', before.owner, after.owner);
    return changes;
  }

  if (record.action.startsWith('test_case.')) {
    pushChange(changes, '用例名称', before.name ?? before.title, after.name ?? after.title);
    pushChange(changes, '负责人', before.owner, after.owner);
    pushChange(changes, '用例状态', labelOf(TEST_CASE_STATUS_LABELS, before.status), labelOf(TEST_CASE_STATUS_LABELS, after.status));
    pushChange(changes, '步骤', before.steps, after.steps);
    pushChange(changes, '预期结果', before.expectedResult ?? before.expected_result, after.expectedResult ?? after.expected_result);
    return changes;
  }

  if (record.action.startsWith('document.')) {
    pushChange(changes, '文档标题', before.title ?? before.name, after.title ?? after.name);
    pushChange(changes, '文档分类', labelOf(DOCUMENT_CATEGORY_LABELS, before.category), labelOf(DOCUMENT_CATEGORY_LABELS, after.category));
    pushChange(changes, '所属项目', before.projectName ?? before.projectId, after.projectName ?? after.projectId);
    return changes;
  }

  if (record.action === 'product.update') {
    pushChange(changes, '产品名称', before.name, after.name);
    pushChange(changes, '产品阶段', before.stage, after.stage);
    pushChange(changes, '系统版本', before.systemVersion, after.systemVersion);
    pushChange(changes, '应用版本', before.appVersion, after.appVersion);
    return changes;
  }

  if (record.action === 'work_log.create') {
    pushChange(changes, '所属项目', before.project, after.project);
    pushChange(changes, '工作内容', before.content, after.content);
    pushChange(changes, '阻塞项', before.blockers, after.blockers);
    pushChange(changes, '下一步计划', before.nextPlan, after.nextPlan);
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

function createEntry(record: AuditLogRecord): TimelineEntry {
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
        title: `${actor}禁用了账号`,
        detail: `已将 ${after.name ?? record.resourceId ?? '目标用户'} 设置为已禁用。`,
        actionLabel: '禁用账号',
        category,
        categoryLabel: categoryMeta.label,
        categoryVariant: categoryMeta.variant,
        isImportant: true,
        resourceLabel,
      };
    }

    if (beforeStatus !== afterStatus && afterStatus === 'active') {
      return {
        record,
        title: `${actor}启用了账号`,
        detail: `已恢复 ${after.name ?? record.resourceId ?? '目标用户'} 的登录权限。`,
        actionLabel: '启用账号',
        category,
        categoryLabel: categoryMeta.label,
        categoryVariant: categoryMeta.variant,
        isImportant: true,
        resourceLabel,
      };
    }
  }

  const base: Omit<TimelineEntry, 'title' | 'detail' | 'actionLabel'> = {
    record,
    category,
    categoryLabel: categoryMeta.label,
    categoryVariant: categoryMeta.variant,
    isImportant: isImportantAction(record),
    resourceLabel,
  };

  switch (record.action) {
    case 'auth.login':
      return { ...base, title: `${actor}登录了平台`, detail: '成功进入管理平台。', actionLabel: '登录' };
    case 'auth.login_failed':
      return { ...base, title: `${actor}登录失败`, detail: '账号或密码校验未通过。', actionLabel: '登录失败' };
    case 'auth.login_disabled':
      return { ...base, title: `${actor}尝试登录被拦截`, detail: '该账号已被禁用，平台拒绝登录。', actionLabel: '账号禁用' };
    case 'page.view': {
      const pageName = getPageLabel(after.page ?? record.resourceId);
      return { ...base, title: `${actor}进入了${pageName}`, detail: `访问页面：${pageName}。`, actionLabel: '进入页面' };
    }
    case 'project.create':
      return { ...base, title: `${actor}新建了项目`, detail: `已创建 ${resourceLabel}。`, actionLabel: '新建项目' };
    case 'project.update':
      return { ...base, title: `${actor}更新了项目`, detail: `已调整 ${resourceLabel} 的信息。`, actionLabel: '更新项目' };
    case 'project.status_update':
      return { ...base, title: `${actor}更新了项目状态`, detail: `已推进 ${resourceLabel} 的状态。`, actionLabel: '项目状态变更' };
    case 'project.member_add':
      return { ...base, title: `${actor}为项目添加了成员`, detail: `已把 ${after.userName ?? after.name ?? '新成员'} 加入 ${resourceLabel}。`, actionLabel: '添加成员' };
    case 'project.member_remove':
      return { ...base, title: `${actor}从项目中移除了成员`, detail: `已将 ${before.userName ?? before.name ?? '成员'} 从 ${resourceLabel} 移出。`, actionLabel: '移除成员' };
    case 'product.create':
      return { ...base, title: `${actor}新建了产品`, detail: `已创建 ${resourceLabel}。`, actionLabel: '新建产品' };
    case 'product.update':
      return { ...base, title: `${actor}编辑了产品`, detail: `已更新 ${resourceLabel} 的资料。`, actionLabel: '编辑产品' };
    case 'product.delete':
      return { ...base, title: `${actor}删除了产品`, detail: `已删除 ${resourceLabel}。`, actionLabel: '删除产品' };
    case 'document.upload':
      return { ...base, title: `${actor}上传了文档`, detail: `已新增 ${resourceLabel}。`, actionLabel: '上传文档' };
    case 'document.update':
      return { ...base, title: `${actor}更新了文档`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新文档' };
    case 'document.delete':
      return { ...base, title: `${actor}删除了文档`, detail: `已删除 ${resourceLabel}。`, actionLabel: '删除文档' };
    case 'work_log.create':
      return { ...base, title: `${actor}提交了日报`, detail: `已提交 ${resourceLabel}，可用于周报汇总。`, actionLabel: '提交日报' };
    case 'requirement.create':
      return { ...base, title: `${actor}创建了需求`, detail: `已新增 ${resourceLabel}。`, actionLabel: '创建需求' };
    case 'requirement.update':
      return { ...base, title: `${actor}更新了需求`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新需求' };
    case 'requirement.status_update':
      return { ...base, title: `${actor}推进了需求状态`, detail: `已更新 ${resourceLabel} 的当前阶段。`, actionLabel: '需求状态变更' };
    case 'defect.create':
      return { ...base, title: `${actor}提交了缺陷`, detail: `已新增 ${resourceLabel}。`, actionLabel: '提交缺陷' };
    case 'defect.update':
      return { ...base, title: `${actor}更新了缺陷`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新缺陷' };
    case 'defect.status_update':
      return { ...base, title: `${actor}推进了缺陷状态`, detail: `已更新 ${resourceLabel} 的处理进度。`, actionLabel: '缺陷状态变更' };
    case 'test_case.create':
      return { ...base, title: `${actor}创建了测试用例`, detail: `已新增 ${resourceLabel}。`, actionLabel: '创建用例' };
    case 'test_case.update':
      return { ...base, title: `${actor}更新了测试用例`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新用例' };
    case 'task.create':
      return { ...base, title: `${actor}创建了任务`, detail: `已新增 ${resourceLabel}。`, actionLabel: '创建任务' };
    case 'task.update':
      return { ...base, title: `${actor}更新了任务`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新任务' };
    case 'task.status_update':
      return { ...base, title: `${actor}更新了任务状态`, detail: `已推进 ${resourceLabel} 的执行进度。`, actionLabel: '任务状态变更' };
    case 'task.kanban_move':
      return { ...base, title: `${actor}移动了任务卡片`, detail: `已调整 ${resourceLabel} 的看板位置。`, actionLabel: '移动卡片' };
    case 'release.create':
      return { ...base, title: `${actor}创建了发布计划`, detail: `已新增 ${resourceLabel}。`, actionLabel: '创建发布' };
    case 'release.update':
      return { ...base, title: `${actor}更新了发布计划`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新发布' };
    case 'release.delete':
      return { ...base, title: `${actor}删除了发布计划`, detail: `已删除 ${resourceLabel}。`, actionLabel: '删除发布' };
    case 'build.create':
      return { ...base, title: `${actor}创建了构建记录`, detail: `已新增 ${resourceLabel}。`, actionLabel: '创建构建' };
    case 'build.update':
      return { ...base, title: `${actor}更新了构建记录`, detail: `已修改 ${resourceLabel}。`, actionLabel: '更新构建' };
    default:
      return { ...base, title: `${actor}执行了一次操作`, detail: `操作类型：${record.action}，关联对象：${resourceLabel}。`, actionLabel: '其他操作' };
  }
}

function DiffView({ record }: { record: AuditLogRecord }) {
  const changes = buildChangeSummary(record);

  if (!changes.length) {
    return <div className="body-text">这次操作没有需要展开的字段变化，通常是登录、进入页面或简单新增删除。</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {changes.map((change) => (
        <div key={`${change.label}-${change.before}-${change.after}`} className="detail-field" style={{ alignItems: 'flex-start' }}>
          <span className="detail-label" style={{ minWidth: 120 }}>{change.label}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-secondary, #64748b)', textDecoration: 'line-through' }}>{change.before}</div>
            <div style={{ color: 'var(--color-success, #16a34a)', marginTop: 4 }}>{change.after}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DynamicPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [includePageViews, setIncludePageViews] = useState(false);
  const [importantOnly, setImportantOnly] = useState(false);
  const serverFilters = useMemo<AuditLogFilters>(() => ({
    ...dateRangeFor(timeRange),
    resourceType: resourceTypeFilter === 'all' ? undefined : resourceTypeFilter,
    action: actionFilter === 'all' ? undefined : actionFilter,
    includePageViews: includePageViews ? '1' : undefined,
  }), [actionFilter, includePageViews, resourceTypeFilter, timeRange]);
  const { data, loading, error, reload } = useAsync<AuditLogRecord[]>(
    () => fetchAuditLogs(serverFilters),
    [serverFilters.dateFrom ?? '', serverFilters.dateTo ?? '', serverFilters.resourceType ?? '', serverFilters.action ?? '', serverFilters.includePageViews ?? ''],
  );

  const timeline = useMemo(
    () => (data ?? []).map(createEntry),
    [data],
  );

  const filteredTimeline = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return timeline.filter((item) => {
      const roleLabel = getRoleLabel(item.record);
      if (roleFilter !== 'all' && roleLabel !== roleFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (importantOnly && !item.isImportant) return false;
      if (!text) return true;
      const searchText = [
        item.title,
        item.detail,
        item.resourceLabel,
        item.actionLabel,
        item.record.actorName,
        roleLabel,
      ].join(' ').toLowerCase();
      return searchText.includes(text);
    });
  }, [categoryFilter, importantOnly, keyword, roleFilter, timeline]);

  const stats = useMemo(() => {
    const importantCount = timeline.filter((item) => item.isImportant).length;
    const loginCount = timeline.filter((item) => item.category === 'auth').length;
    const changeCount = timeline.filter((item) => shouldShowDiff(item.record)).length;
    const riskCount = timeline.filter((item) => ['risk', 'blocked'].includes(item.categoryVariant)).length;
    const todayCount = timeline.filter((item) => item.record.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
    return { importantCount, loginCount, changeCount, riskCount, todayCount };
  }, [timeline]);

  const categoryCounts = useMemo(
    () => Object.entries(CATEGORY_META).map(([key, meta]) => ({
      key,
      label: meta.label,
      variant: meta.variant,
      count: timeline.filter((item) => item.category === key).length,
    })).filter((item) => item.count > 0),
    [timeline],
  );

  const attentionQueue = useMemo(
    () => timeline.filter((item) => item.isImportant || ['risk', 'blocked'].includes(item.categoryVariant)).slice(0, 6),
    [timeline],
  );

  const roleOptions = useMemo(() => {
    const roles = Array.from(new Set(timeline.map((item) => getRoleLabel(item.record)).filter(Boolean)));
    return roles;
  }, [timeline]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading || error || !data) {
    return (
      <div>
        <PageHeader title="动态中心" description="按时间查看谁进入了哪些页面、做了什么操作，以及关键对象发生了哪些变化。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="stack dynamic-glass-page">
      <PageHeader
        title="动态中心"
        description={`按时间倒序查看所有角色的登录、增删改、日报和文档操作，共 ${timeline.length} 条记录。`}
        actions={<button className="btn btn-secondary btn-sm" onClick={reload}><RefreshCw size={14} /> 刷新</button>}
      />

      <div className="dynamic-summary-grid">
        <div className="dynamic-summary-card">
          <div className="dynamic-summary-label"><Activity size={14} /> 当前动态</div>
          <div className="dynamic-summary-value">{timeline.length}</div>
          <div className="dynamic-summary-tip">{timeRange === 'week' ? '最近 7 天' : timeRange === 'today' ? '今日范围' : '全部范围'}操作轨迹</div>
        </div>
        <div className="dynamic-summary-card dynamic-summary-card-important">
          <div className="dynamic-summary-label"><AlertTriangle size={14} /> 重点关注</div>
          <div className="dynamic-summary-value">{stats.importantCount}</div>
          <div className="dynamic-summary-tip">登录失败、删改、状态变更</div>
        </div>
        <div className="dynamic-summary-card">
          <div className="dynamic-summary-label"><Clock3 size={14} /> 今日动态</div>
          <div className="dynamic-summary-value">{stats.todayCount}</div>
          <div className="dynamic-summary-tip">当天新增的审计记录</div>
        </div>
        <div className="dynamic-summary-card">
          <div className="dynamic-summary-label"><Radar size={14} /> 风险信号</div>
          <div className="dynamic-summary-value">{stats.riskCount}</div>
          <div className="dynamic-summary-tip">账号、测试、删除、发布风险</div>
        </div>
      </div>

      <div className="dynamic-workbench dynamic-command-center">
        <aside className="dynamic-rail">
          <div className="dynamic-rail-header">
            <span>待关注</span>
            <strong>{attentionQueue.length}</strong>
          </div>
          {attentionQueue.length ? (
            <div className="dynamic-attention-list">
              {attentionQueue.map((item) => (
                <button key={item.record.id} className="dynamic-attention-item" onClick={() => setExpanded((prev) => new Set(prev).add(item.record.id))}>
                  <span>{item.actionLabel}</span>
                  <strong>{item.title}</strong>
                  <small>{formatTime(item.record.createdAt)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="body-text">当前范围内暂无需要优先关注的动态。</div>
          )}
        </aside>

        <section className="dynamic-timeline-stage">
          <div className="dynamic-stage-toolbar">
            <FilterBar
              label={<span className="dynamic-filter-label"><Search size={14} /> 筛选</span>}
              trailing={
                <button
                  className={`btn btn-sm ${importantOnly ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setImportantOnly((value) => !value)}
                >
                  <Eye size={14} /> {importantOnly ? '已只看重点' : '只看重点'}
                </button>
              }
            >
              <input
                className="input"
                style={{ minWidth: 220 }}
                placeholder="搜索人员、页面、对象、动作"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <select className="select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">全部角色</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select className="select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">全部分类</option>
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </FilterBar>
          </div>

          {filteredTimeline.length === 0 ? (
            <p className="body-text" style={{ margin: 0 }}>当前筛选条件下没有匹配的动态记录。</p>
          ) : (
            <div className="timeline dynamic-timeline">
              {filteredTimeline.map((item) => {
                const isOpen = expanded.has(item.record.id);
                const roleLabel = getRoleLabel(item.record);
                const canExpand = shouldShowDiff(item.record);

                return (
                  <div key={item.record.id} className={`timeline-item dynamic-timeline-item${item.isImportant ? ' is-important' : ''}`}>
                    <div className={`timeline-dot dynamic-timeline-dot ${item.categoryVariant}`} />
                    <div className="timeline-content dynamic-timeline-content">
                      <div className="dynamic-timeline-top">
                        <div className="dynamic-timeline-heading">
                          <span className="font-medium">{item.title}</span>
                          {item.isImportant ? <span className="tag risk">重点</span> : null}
                        </div>
                        <span className="text-secondary dynamic-timeline-time">{formatTime(item.record.createdAt)}</span>
                      </div>

                      <div className="dynamic-timeline-meta">
                        <StatusBadge status={item.record.action} label={item.actionLabel} showDot={false} />
                        <span className={`tag ${item.categoryVariant === 'neutral' ? '' : item.categoryVariant}`}>{item.categoryLabel}</span>
                        {roleLabel ? <span className="tag">{roleLabel}</span> : null}
                      </div>

                      <div className="body-text dynamic-timeline-detail">{item.detail}</div>
                      <div className="dynamic-timeline-footer">
                        <div className="text-secondary dynamic-timeline-resource">关联对象：{item.resourceLabel}</div>
                        {getResourceTarget(item.record) ? (
                          <button className="btn btn-secondary btn-xs" onClick={() => openResource(item.record)}>
                            <ExternalLink size={12} /> 打开对象
                          </button>
                        ) : null}
                      </div>

                      {canExpand ? (
                        <button className="btn btn-text btn-xs" style={{ padding: '2px 0', marginTop: 8 }} onClick={() => toggle(item.record.id)}>
                          {isOpen ? '收起变更详情' : '查看变更详情'}
                        </button>
                      ) : null}

                      {isOpen ? (
                        <div className="timeline-diff" style={{ marginTop: 10 }}>
                          <DiffView record={item.record} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="dynamic-filter-panel">
          <div className="dynamic-filter-panel-title"><SlidersHorizontal size={15} /> 筛选策略</div>
          <div className="dynamic-filter-grid">
            <div className="form-group">
              <label className="form-label">时间范围</label>
              <select className="form-select" value={timeRange} onChange={(event) => setTimeRange(event.target.value as TimeRange)}>
                <option value="today">今天</option>
                <option value="week">最近 7 天</option>
                <option value="all">全部</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">资源类型</label>
              <select className="form-select" value={resourceTypeFilter} onChange={(event) => setResourceTypeFilter(event.target.value)}>
                <option value="all">全部资源</option>
                <option value="project">项目</option>
                <option value="requirement">需求</option>
                <option value="task">任务</option>
                <option value="defect">缺陷</option>
                <option value="test_case">测试用例</option>
                <option value="document">文档</option>
                <option value="work_log">日报</option>
                <option value="build">构建</option>
                <option value="release">发布</option>
                <option value="user">用户</option>
                <option value="page">页面</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">动作类型</label>
              <select className="form-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">全部动作</option>
                <option value="auth.">登录</option>
                <option value="project.">项目</option>
                <option value="requirement.">需求</option>
                <option value="task.">任务</option>
                <option value="defect.">缺陷</option>
                <option value="test_case.">测试</option>
                <option value="document.">文档</option>
                <option value="work_log.">日报</option>
                <option value="build.">构建</option>
                <option value="release.">发布</option>
                <option value="user.">用户</option>
              </select>
            </div>
            <label className="form-checkbox dynamic-filter-checkbox">
              <input type="checkbox" checked={includePageViews} onChange={(event) => setIncludePageViews(event.target.checked)} />
              <span>包含页面访问</span>
            </label>
          </div>
          <div className="dynamic-category-dock">
            {categoryCounts.map((item) => (
              <button
                key={item.key}
                className={`dynamic-category-chip ${item.variant}${categoryFilter === item.key ? ' active' : ''}`}
                onClick={() => setCategoryFilter(categoryFilter === item.key ? 'all' : item.key)}
              >
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default DynamicPage;
