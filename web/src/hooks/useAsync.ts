import { useCallback, useEffect, useRef, useState } from 'react';
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

// ---------------------------------------------------------------------------
// useAsync: run an async loader on mount (and on dependency change), exposing
// loading / error / data / reload. Keeps every page's fetch lifecycle uniform.
//
// Cache storage lives in services/asyncCache.ts so session expiry can clear
// and re-scope entries without a circular import with the HTTP client.
//
// Every caller supplies an explicit cache namespace. Cached data remains visible
// while stale entries refresh, with refresh failures reported separately.
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
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const visibleDataKey = useRef<string | null>(null);
  const hasVisibleData = useRef(false);
  const forceRefreshKey = useRef<string | null>(null);

  const key = buildAsyncCacheKey(options.cacheKey, deps);
  const reload = useCallback(() => {
    forceRefreshKey.current = key;
    setNonce((value) => value + 1);
  }, [key]);

  useEffect(() => {
    let active = true;

    const cached = getAsyncCacheEntry<T>(key);
    const isFresh = cached ? Date.now() - cached.at < ASYNC_CACHE_FRESH_MS : false;
    const forceRefresh = forceRefreshKey.current === key;
    if (forceRefresh) forceRefreshKey.current = null;
    const canKeepVisibleData = visibleDataKey.current === key && hasVisibleData.current;
    const hasData = Boolean(cached) || canKeepVisibleData;

    if (cached) {
      setData(cached.data);
      visibleDataKey.current = key;
      hasVisibleData.current = true;
    } else if (!canKeepVisibleData) {
      setData(null);
      visibleDataKey.current = key;
      hasVisibleData.current = false;
    }

    setError(null);
    setRefreshError(null);
    setLoading(!hasData);
    setRefreshing(hasData && (forceRefresh || !isFresh));

    if (isFresh && !forceRefresh) {
      setRefreshing(false);
      return () => {
        active = false;
      };
    }

    loader()
      .then((result) => {
        if (active) {
          setData(result);
          setAsyncCacheEntry(key, result);
          visibleDataKey.current = key;
          hasVisibleData.current = true;
          setError(null);
          setRefreshError(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = messageFromError(err);
        if (hasData) {
          setRefreshError(message);
          dispatchAsyncRefreshFailure({ cacheKey: key, message, retry: reload });
        } else {
          setError(message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [key, nonce]);

  return { data, loading, error, refreshing, refreshError, reload };
}

// Re-export registry helpers so existing imports from hooks/useAsync keep working.
export { clearAsyncCache, invalidateAsyncCache, setAsyncCacheUser };
