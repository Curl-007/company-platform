import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import {
  ASYNC_CACHE_FRESH_MS,
  buildAsyncCacheKey,
  clearAsyncCache,
  deleteAsyncCacheEntry,
  getAsyncCacheEntry,
  invalidateAsyncCache,
  setAsyncCacheEntry,
  setAsyncCacheUser,
} from '../services/asyncCache';

// ---------------------------------------------------------------------------
// useAsync: run an async loader on mount (and on dependency change), exposing
// loading / error / data / reload. Keeps every page's fetch lifecycle uniform.
//
// Cache storage lives in services/asyncCache.ts so session expiry can clear
// and re-scope entries without a circular import with the HTTP client.
// ---------------------------------------------------------------------------

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function messageFromError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '数据加载时发生意外错误';
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Track whether we've already served stale data, so we don't show a spinner
  // on top of it during the background revalidation.
  const servedStale = useRef(false);

  const key = buildAsyncCacheKey(loader, deps);
  const reload = useCallback(() => {
    deleteAsyncCacheEntry(key);
    servedStale.current = false;
    setNonce((value) => value + 1);
  }, [key]);

  useEffect(() => {
    let active = true;

    // Stale-while-revalidate: if we have cached (possibly stale) data, show it
    // immediately without a loading spinner, then refresh in the background.
    const cached = getAsyncCacheEntry<T>(key);
    const isFresh = cached ? Date.now() - cached.at < ASYNC_CACHE_FRESH_MS : false;
    if (cached) {
      setData(cached.data);
      setError(null);
      setLoading(false);
      servedStale.current = true;
    } else {
      servedStale.current = false;
      setLoading(true);
    }
    setError(null);

    if (isFresh) {
      return () => {
        active = false;
      };
    }

    loader()
      .then((result) => {
        if (active) {
          setData(result);
          setAsyncCacheEntry(key, result);
        }
      })
      .catch((err: unknown) => {
        if (active && !servedStale.current) setError(messageFromError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // deps is intentionally the caller's dependency list plus reload nonce
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}

// Re-export registry helpers so existing imports from hooks/useAsync keep working.
export { clearAsyncCache, invalidateAsyncCache, setAsyncCacheUser };
