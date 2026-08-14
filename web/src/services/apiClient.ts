import { get, post, patch, put, del, type ApiRequestOptions } from './api';
import { clearAsyncCache, invalidateAsyncCache } from './asyncCache';
import {
  mutationInvalidationKeys,
  type AsyncQueryKey,
  type MutationInvalidation,
} from './queryKeyRegistry';
import type { ApiResponse } from '../types';

export interface MutationOptions {
  /** false: keep cache; true/'all': clear all caches; default: use a named invalidation group. */
  invalidateCache?: boolean | 'all';
  /** Named cache invalidation group from the typed registry. */
  invalidation?: MutationInvalidation;
  /** Explicit useAsync cache namespaces to invalidate after a successful mutation. */
  invalidateKeys?: readonly AsyncQueryKey[];
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function applyMutationCachePolicy(options: MutationOptions): void {
  if (options.invalidateCache === false) return;

  if (options.invalidateCache === 'all') {
    clearAsyncCache();
    return;
  }

  const targets = options.invalidateKeys?.length
    ? options.invalidateKeys
    : options.invalidation
      ? mutationInvalidationKeys[options.invalidation]
      : undefined;

  if (options.invalidateCache === true && !targets) {
    clearAsyncCache();
    return;
  }

  if (targets?.length) {
    for (const cacheKey of targets) {
      invalidateAsyncCache(cacheKey);
    }
    return;
  }

  // Unknown writes are rare and must not leave unrelated stale entries behind.
  // Callers should opt into a named group above as soon as the route is known.
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
  applyMutationCachePolicy(options);
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
  applyMutationCachePolicy(options);
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
  applyMutationCachePolicy(options);
  return res.data;
}

export async function unwrapDel<T>(
  path: string,
  options: MutationOptions = {},
): Promise<T> {
  const res = await del<ApiResponse<T>>(path);
  applyMutationCachePolicy(options);
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
