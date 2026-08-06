import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient for the progressive useAsync → TanStack Query migration.
 * staleTime matches ASYNC_CACHE_FRESH_MS in asyncCache.ts (20s). Kept as a
 * literal here to avoid a circular import with asyncCache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

/** Prefix used by useAsync query keys: ['async', buildAsyncCacheKey(...)] */
export const ASYNC_QUERY_PREFIX = 'async' as const;

export function asyncQueryKey(cacheKey: string) {
  return [ASYNC_QUERY_PREFIX, cacheKey] as const;
}

/** Drop every React Query entry (logout / hard reset). */
export function clearQueryClientCache(): void {
  queryClient.clear();
}

/**
 * Invalidate React Query entries that correspond to asyncCache keys.
 * Mirrors invalidateAsyncCache matching rules so mutation sites keep working.
 */
export function invalidateQueryClientCache(
  match: string | RegExp | ((key: string) => boolean),
  userKey: string,
): void {
  const namespacePrefix =
    typeof match === 'string' ? `${userKey}:${match.trim()}:` : null;

  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[1];
      if (typeof key !== 'string') return false;
      if (match instanceof RegExp) {
        match.lastIndex = 0;
        return match.test(key);
      }
      if (typeof match === 'function') return match(key);
      return Boolean(namespacePrefix && key.startsWith(namespacePrefix));
    },
  });
}
