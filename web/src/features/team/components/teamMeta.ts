import type { TeamMemberOverview } from '../../../types';

export type PresenceFilter = 'all' | 'online' | 'away' | 'offline';

export const PRESENCE_LABELS: Record<string, string> = {
  online: '在线',
  away: '活跃过',
  offline: '离线',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  pm: '项目经理',
  pdm: '产品经理',
  dev: '开发',
  qa: '测试',
};

export const ROLE_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'admin', label: '系统管理员' },
  { value: 'pm', label: '项目经理' },
  { value: 'pdm', label: '产品经理' },
  { value: 'dev', label: '开发' },
  { value: 'qa', label: '测试' },
];

export const PRESENCE_OPTIONS: Array<{ value: PresenceFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'online', label: '在线' },
  { value: 'away', label: '活跃过' },
  { value: 'offline', label: '离线' },
];

export const USER_STATUS_LABELS: Record<string, string> = {
  active: '已启用',
  disabled: '已停用',
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

export function statusLabel(map: Record<string, string>, value?: string | null): string {
  if (!value) return '未设置';
  return map[value] ?? value;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 2);
  return trimmed
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(value?: string | null): string {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function workloadRate(member: TeamMemberOverview): number {
  const total = member.stats.estimatedHours || member.stats.actualHours + member.stats.remainingHours;
  if (!total) return 0;
  return Math.min(100, Math.round(((member.stats.actualHours + member.stats.remainingHours) / total) * 100));
}

export function navigateTo(page: string, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  window.location.hash = params.size ? `#/${page}?${params.toString()}` : `#/${page}`;
}
