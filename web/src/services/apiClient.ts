import { get, post, patch, put, del, type ApiRequestOptions } from './api';
import { clearAsyncCache, invalidateAsyncCache } from './asyncCache';
import type { ApiResponse } from '../types';

export interface MutationOptions {
  /** false: keep cache; true/'all': clear cache; default: path-based key invalidation. */
  invalidateCache?: boolean | 'all';
  /** Explicit useAsync cache namespaces to invalidate after a successful mutation. */
  invalidateKeys?: string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Map API path segments to explicit useAsync cache namespaces.
 * Prefer targeted invalidation over clearAsyncCache.
 */
function cacheKeysForPath(path: string): string[] {
  const normalized = path.split('?')[0].toLowerCase();
  const keys = new Set<string>();

  const add = (...items: string[]) => {
    for (const item of items) keys.add(item);
  };

  if (normalized.includes('/projects') || normalized.includes('/wbs') || normalized.includes('/kanban')) {
    add(
      'projects:list',
      'projects:detail',
      'projects:delivery',
      'projects:risks',
      'projects:decisions',
      'projects:members',
      'projects:kanban',
      'project:flow',
      'project:workflow-binding',
      'flow:overview',
      'dashboard:overview',
      'mywork:dashboard',
      'capacity:overview',
      'testing-quality:snapshot',
    );
  }
  if (normalized.includes('/requirements')) {
    add(
      'requirements:list',
      'requirements:detail',
      'dashboard:overview',
      'mywork:dashboard',
      'projects:list',
      'projects:detail',
      'projects:delivery',
      'delivery:gates',
    );
  }
  if (normalized.includes('/documents')) {
    add('documents:list', 'projects:list', 'ai:summary');
  }
  if (normalized.includes('/work-logs')) {
    add(
      'work-logs:team',
      'work-logs:weekly-summary',
      'mywork:weekly-summary',
      'mywork:dashboard',
      'mywork:capacity',
      'capacity:overview',
      'dashboard:overview',
    );
  }
  if (normalized.includes('/time-entries')) {
    add('time-entries:list', 'mywork:capacity', 'mywork:dashboard', 'capacity:overview', 'dashboard:overview');
  }
  if (normalized.includes('/defects') || normalized.includes('/test-cases') || normalized.includes('/test-runs')) {
    add(
      'defects:list',
      'test-cases:list',
      'testing-quality:snapshot',
      'projects:list',
      'projects:detail',
      'projects:delivery',
      'delivery:gates',
      'dashboard:overview',
      'mywork:dashboard',
    );
  }
  if (normalized.includes('/tasks') || normalized.includes('/status-history') || normalized.includes('/sprints')) {
    add(
      'projects:detail',
      'projects:delivery',
      'projects:kanban',
      'sprints:burndown',
      'sprints:commitment',
      'sprints:scope-changes',
      'tasks:status-history',
      'dashboard:overview',
      'mywork:dashboard',
      'project:flow',
      'flow:overview',
    );
  }
  if (normalized.includes('/users') || normalized.includes('/team') || normalized.includes('/org/')) {
    add('team:members', 'organization:departments', 'capacity:overview', 'dashboard:overview');
  }
  if (normalized.includes('/capacity') || normalized.includes('/allocations')) {
    add('capacity:overview', 'capacity:calendar', 'mywork:capacity', 'projects:list', 'dashboard:overview');
  }
  if (
    normalized.includes('/products')
    || normalized.includes('/programs')
    || normalized.includes('/portfolios')
    || normalized.includes('/strategic-goals')
  ) {
    add(
      'products:list',
      'programs:list',
      'portfolios:list',
      'strategic-goals:list',
      'projects:list',
      'projects:detail',
      'projects:delivery',
      'dashboard:overview',
    );
  }
  if (normalized.includes('/releases') || normalized.includes('/builds') || normalized.includes('/delivery')) {
    add(
      'delivery:builds',
      'delivery:releases',
      'delivery:gates',
      'delivery:release-approvals',
      'delivery:rollback-records',
      'delivery:release-report',
      'projects:list',
      'projects:detail',
      'projects:delivery',
      'dashboard:overview',
    );
  }
  if (normalized.includes('/ai/')) {
    add('ai:summary', 'documents:list', 'dashboard:overview');
  }
  if (normalized.includes('/ai-provider')) {
    add('settings:ai-provider');
  }
  if (normalized.includes('/dashboard')) {
    add('dashboard:overview', 'mywork:dashboard');
  }
  if (normalized.includes('/flow') || normalized.includes('/workflow')) {
    add('workflow:templates', 'project:flow', 'flow:overview', 'project:workflow-binding');
  }

  if (keys.size > 0) add('audit:logs');

  return [...keys];
}

function applyMutationCachePolicy(path: string, options: MutationOptions): void {
  if (options.invalidateCache === false) return;

  if (options.invalidateCache === 'all') {
    clearAsyncCache();
    return;
  }

  if (options.invalidateCache === true && !options.invalidateKeys?.length) {
    clearAsyncCache();
    return;
  }

  const targets = options.invalidateKeys?.length
    ? options.invalidateKeys
    : cacheKeysForPath(path);

  if (targets.length > 0) {
    for (const cacheKey of targets) {
      invalidateAsyncCache(cacheKey);
    }
    return;
  }

  // Unknown writes are rare and must not leave unrelated stale entries behind.
  clearAsyncCache();
}

export async function unwrap<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const res = await get<ApiResponse<T>>(path, options);
  return res.data;
}

export async function unwrapPost<T>(
  path: string,
  body?: unknown,
  options: MutationOptions = {},
): Promise<T> {
  const res = await post<ApiResponse<T>>(path, body, {
    headers: options.headers,
    timeoutMs: options.timeoutMs,
  });
  applyMutationCachePolicy(path, options);
  return res.data;
}

export async function unwrapPatch<T>(
  path: string,
  body?: unknown,
  options: MutationOptions = {},
): Promise<T> {
  const res = await patch<ApiResponse<T>>(path, body, {
    headers: options.headers,
    timeoutMs: options.timeoutMs,
  });
  applyMutationCachePolicy(path, options);
  return res.data;
}

export async function unwrapPut<T>(
  path: string,
  body?: unknown,
  options: MutationOptions = {},
): Promise<T> {
  const res = await put<ApiResponse<T>>(path, body, {
    headers: options.headers,
    timeoutMs: options.timeoutMs,
  });
  applyMutationCachePolicy(path, options);
  return res.data;
}

export async function unwrapDel<T>(
  path: string,
  options: MutationOptions = {},
): Promise<T> {
  const res = await del<ApiResponse<T>>(path);
  applyMutationCachePolicy(path, options);
  return res.data;
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
  );
  if (entries.length === 0) return '';
  const query = new URLSearchParams(entries).toString();
  return `?${query}`;
}
