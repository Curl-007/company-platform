import { get, post, patch, put, del } from './api';
import { clearAsyncCache, invalidateAsyncCache } from './asyncCache';
import type { ApiResponse } from '../types';

export interface MutationOptions {
  /** false: do not invalidate; true/'all': broader invalidation; default: path heuristics */
  invalidateCache?: boolean | 'all';
  /** Optional explicit loader-name prefixes to invalidate (e.g. ['fetchProjects', 'fetchDashboard']) */
  invalidatePrefixes?: string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Map API path segments to useAsync cache key prefixes (loader function names).
 * Prefer targeted invalidation over clearAsyncCache.
 */
function cachePrefixesForPath(path: string): string[] {
  const normalized = path.split('?')[0].toLowerCase();
  const prefixes = new Set<string>();

  const add = (...items: string[]) => {
    for (const item of items) prefixes.add(item);
  };

  if (normalized.includes('/projects') || normalized.includes('/wbs') || normalized.includes('/kanban')) {
    add('fetchProjects', 'fetchDashboard', 'fetchProject');
  }
  if (normalized.includes('/requirements')) {
    add('fetchRequirements', 'fetchDashboard', 'fetchProjects');
  }
  if (normalized.includes('/documents')) {
    add('fetchDocuments', 'fetchProjects');
  }
  if (normalized.includes('/work-logs')) {
    add('fetchWorkLogs', 'fetchTeamWorkLogs', 'fetchWeekly', 'fetchMyCapacity', 'fetchDashboard');
  }
  if (normalized.includes('/time-entries')) {
    add('fetchTimeEntries', 'fetchMyCapacity', 'fetchCapacity', 'fetchDashboard');
  }
  if (normalized.includes('/defects') || normalized.includes('/test-cases') || normalized.includes('/test-runs')) {
    add('fetchDefects', 'fetchTestCases', 'fetchProjects', 'fetchDashboard');
  }
  if (normalized.includes('/tasks') || normalized.includes('/status-history')) {
    add('fetchTasks', 'fetchProject', 'fetchDashboard', 'fetchStatusHistory');
  }
  if (normalized.includes('/users') || normalized.includes('/team') || normalized.includes('/org/')) {
    add('fetchUsers', 'fetchTeam', 'fetchDepartments', 'fetchOrganization');
  }
  if (normalized.includes('/capacity') || normalized.includes('/allocations')) {
    add('fetchCapacity', 'fetchMyCapacity', 'fetchProjects', 'fetchDashboard');
  }
  if (normalized.includes('/products') || normalized.includes('/programs') || normalized.includes('/portfolios')) {
    add('fetchProducts', 'fetchPrograms', 'fetchPortfolios', 'fetchProjects', 'fetchDashboard');
  }
  if (normalized.includes('/releases') || normalized.includes('/builds') || normalized.includes('/delivery')) {
    add('fetchReleases', 'fetchBuilds', 'fetchDelivery', 'fetchProjects', 'fetchDashboard');
  }
  if (normalized.includes('/ai/')) {
    add('fetchAi', 'fetchDocuments');
  }
  if (normalized.includes('/dashboard')) {
    add('fetchDashboard');
  }
  if (normalized.includes('/flow') || normalized.includes('/workflow')) {
    add('fetchWorkflowTemplates', 'fetchProjectFlow', 'fetchFlowOverview', 'fetchProjectWorkflowBinding');
  }

  return [...prefixes];
}

function applyMutationCachePolicy(path: string, options: MutationOptions): void {
  if (options.invalidateCache === false) return;

  if (options.invalidateCache === 'all') {
    clearAsyncCache();
    return;
  }

  const prefixes = [
    ...(options.invalidatePrefixes || []),
    ...(options.invalidateCache === true ? [] : cachePrefixesForPath(path)),
  ];

  // true with no prefixes: still try path heuristics once, then fall back carefully
  const heuristic = options.invalidateCache === true ? cachePrefixesForPath(path) : [];
  const targets = prefixes.length > 0 ? prefixes : heuristic;

  if (targets.length > 0) {
    for (const prefix of targets) {
      invalidateAsyncCache(prefix);
    }
    return;
  }

  // Last resort: invalidate by first path segment after /api/
  const segment = path.split('?')[0].replace(/^\/api\//, '').split('/')[0];
  if (segment) {
    invalidateAsyncCache(segment);
    return;
  }

  clearAsyncCache();
}

export async function unwrap<T>(path: string): Promise<T> {
  const res = await get<ApiResponse<T>>(path);
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
