import type { TeamMemberOverview } from '../../../types';
import { getInterfaceLocale } from '../../../i18n';
import i18n from '../../../i18n';

export type PresenceFilter = 'all' | 'online' | 'away' | 'offline';

export const PRESENCE_LABELS: Record<string, string> = {
  online: 'enums.presence.online',
  away: 'enums.presence.away',
  offline: 'enums.presence.offline',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'enums.userRole.admin',
  pm: 'enums.userRole.pm',
  pdm: 'enums.userRole.pdm',
  dev: 'enums.userRole.dev',
  qa: 'enums.userRole.qa',
};

export const ROLE_OPTIONS = [
  { value: '', label: 'features.team.teamMeta.roleOptions.all' },
  { value: 'admin', label: 'features.team.teamMeta.roleOptions.admin' },
  { value: 'pm', label: 'features.team.teamMeta.roleOptions.pm' },
  { value: 'pdm', label: 'features.team.teamMeta.roleOptions.pdm' },
  { value: 'dev', label: 'features.team.teamMeta.roleOptions.dev' },
  { value: 'qa', label: 'features.team.teamMeta.roleOptions.qa' },
];

export const PRESENCE_OPTIONS: Array<{ value: PresenceFilter; label: string }> = [
  { value: 'all', label: 'features.team.teamMeta.presenceOptions.all' },
  { value: 'online', label: 'enums.presence.online' },
  { value: 'away', label: 'enums.presence.away' },
  { value: 'offline', label: 'enums.presence.offline' },
];

export const USER_STATUS_LABELS: Record<string, string> = {
  active: 'enums.userStatus.active',
  disabled: 'enums.userStatus.disabled',
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

export function statusLabel(map: Record<string, string>, value?: string | null): string {
  if (!value) return i18n.t('enums.unset');
  const tKey = map[value];
  if (!tKey) return value;
  return i18n.t(tKey);
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
  if (!value) return i18n.t('features.team.teamMeta.noRecord');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(getInterfaceLocale(), { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
