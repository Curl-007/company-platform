import type { AiProviderHealth } from '../../types';

export type AiTestState =
  | { status: 'idle'; message: string }
  | { status: 'success'; message: string; latencyMs: number; sample: string; testedAt: string }
  | { status: 'error'; message: string; testedAt: string };

export const SETTINGS_STORAGE_KEYS = {
  api: 'settings:api',
  aiPrefs: 'settings:ai:prefs',
  notifications: 'settings:notifications',
} as const;

export const DEFAULT_API_CONFIG = {
  endpoint: 'http://localhost:4010',
  timeout: 15,
  logRequests: false,
};

export const DEFAULT_AI_PREFS = {
  confidenceThreshold: 80,
  autoAnalyze: false,
};

export const DEFAULT_NOTIF_CONFIG = {
  riskAlerts: true,
  aiAlerts: true,
  weeklyDigest: false,
};

export function loadConfig<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaults;
  } catch {
    return defaults;
  }
}

export function formatTestTime(value?: string) {
  if (!value) return '未测试';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '刚刚';
  }
}

export function formatHealthTime(value?: string | null) {
  if (!value) return '暂无记录';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '刚刚';
  }
}

export function aiHealthLabel(status?: AiProviderHealth['status']) {
  const labels: Record<AiProviderHealth['status'], string> = {
    healthy: '健康',
    degraded: '降级',
    unavailable: '不可用',
    unconfigured: '未配置',
    unknown: '待验证',
    disabled: '已禁用',
  };
  return labels[status || 'unknown'];
}

export function aiHealthVariant(status?: AiProviderHealth['status']) {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'unavailable') return 'risk';
  if (status === 'unconfigured') return 'neutral';
  if (status === 'disabled') return 'neutral';
  return 'info';
}
