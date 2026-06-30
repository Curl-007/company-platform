import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';

// ---------------------------------------------------------------------------
// useAsync: run an async loader on mount (and on dependency change), exposing
// loading / error / data / reload. Keeps every page's fetch lifecycle uniform.
//
// Includes a module-level stale-while-revalidate cache so navigating away from
// a page and back shows the previous data instantly, then refreshes in the
// background (no blank spinner). The cache key is derived from `deps`.
// ---------------------------------------------------------------------------

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface CacheEntry<T> {
  data: T;
  at: number;
}

// Module-level cache shared across all useAsync calls in the session.
const cache = new Map<string, CacheEntry<unknown>>();
// TTL: cached data is "fresh" for this long; after that it's stale (shown
// immediately but re-fetched in the background).
const FRESH_MS = 20_000;

function cacheKey(loader: () => Promise<unknown>, deps: unknown[]): string {
  // Use the loader function's name + deps as the cache key so that different
  // resources (e.g. fetchDashboard vs fetchProjects, both with deps []) don't
  // collide on the same cache slot.
  const name = loader.name || (loader.toString().match(/=>\s*(\w+)/)?.[1] ?? 'anon');
  try { return name + ':' + JSON.stringify(deps); } catch { return name + ':' + deps.length; }
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

  const key = cacheKey(loader, deps);
  const reload = useCallback(() => {
    cache.delete(key);
    servedStale.current = false;
    setNonce((value) => value + 1);
  }, [key]);

  useEffect(() => {
    let active = true;

    // Stale-while-revalidate: if we have cached (possibly stale) data, show it
    // immediately without a loading spinner, then refresh in the background.
    const cached = cache.get(key) as CacheEntry<T> | undefined;
    const isFresh = cached ? Date.now() - cached.at < FRESH_MS : false;
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
          cache.set(key, { data: result, at: Date.now() });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}

/** Invalidate every cached entry (e.g. on logout). */
export function clearAsyncCache(): void {
  cache.clear();
}
