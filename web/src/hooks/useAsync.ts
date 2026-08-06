import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../services/api';
import {
  ASYNC_CACHE_FRESH_MS,
  buildAsyncCacheKey,
  clearAsyncCache,
  getAsyncCacheEntry,
  invalidateAsyncCache,
  setAsyncCacheEntry,
  setAsyncCacheUser,
} from '../services/asyncCache';
import { dispatchAsyncRefreshFailure } from '../services/asyncRefreshEvents';
import { asyncQueryKey } from '../lib/queryClient';

// ---------------------------------------------------------------------------
// useAsync: progressive adapter over TanStack Query.
//
// External contract is unchanged so the ~40 call sites keep working:
//   useAsync(loader, deps, { cacheKey }) →
//     { data, loading, error, refreshing, refreshError, reload }
//
// Behaviour preserved from the hand-rolled SWR implementation:
// - explicit cacheKey namespace + deps → stable cache key
// - stale-while-revalidate (staleTime = ASYNC_CACHE_FRESH_MS)
// - first-load failures → error; background failures → refreshError + event
// - reload() forces a refetch even when the entry is still fresh
// - asyncCache Map still seeds initialData and is written on success so
//   auth/apiClient clear+invalidate keep working across both caches
// ---------------------------------------------------------------------------

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refreshError: string | null;
  reload: () => void;
}

export interface UseAsyncOptions {
  /** Stable cache namespace used by mutation invalidation. */
  cacheKey: string;
}

function messageFromError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '数据加载时发生意外错误';
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  options: UseAsyncOptions,
): AsyncState<T> {
  const key = buildAsyncCacheKey(options.cacheKey, deps);
  const queryKey = asyncQueryKey(key);

  // Keep the latest loader without putting it in the queryKey (callers pass a
  // new function every render; deps already encode the inputs that matter).
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const seed = getAsyncCacheEntry<T>(key);

  const query = useQuery<T, Error>({
    queryKey,
    queryFn: async () => {
      const result = await loaderRef.current();
      setAsyncCacheEntry(key, result);
      return result;
    },
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.at,
    staleTime: ASYNC_CACHE_FRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const hasData = query.data !== undefined;
  const data = hasData ? (query.data as T) : null;

  // Dual error channel: first load → error; background refresh → refreshError.
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const lastFailureAt = useRef<number>(0);
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (query.isFetching) {
      setRefreshError(null);
      return;
    }
    if (!query.isError || !query.error) return;

    const message = messageFromError(query.error);
    if (hasData) {
      setRefreshError(message);
      // Dedupe: React Query may re-notify the same failure across renders.
      if (query.errorUpdatedAt !== lastFailureAt.current) {
        lastFailureAt.current = query.errorUpdatedAt;
        dispatchAsyncRefreshFailure({
          cacheKey: key,
          message,
          retry: () => {
            reloadRef.current();
          },
        });
      }
    } else {
      setRefreshError(null);
    }
  }, [query.isFetching, query.isError, query.error, query.errorUpdatedAt, hasData, key]);

  const reload = useCallback(() => {
    setRefreshError(null);
    void query.refetch();
  }, [query.refetch]);
  reloadRef.current = reload;

  const loading = !hasData && (query.isPending || query.isFetching);
  const refreshing = hasData && query.isFetching;
  const error =
    !hasData && query.isError && query.error
      ? messageFromError(query.error)
      : null;

  return { data, loading, error, refreshing, refreshError, reload };
}

// Re-export registry helpers so existing imports from hooks/useAsync keep working.
export { clearAsyncCache, invalidateAsyncCache, setAsyncCacheUser };
