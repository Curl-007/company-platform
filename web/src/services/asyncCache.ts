// ---------------------------------------------------------------------------
// Shared async response cache registry.
//
// Kept outside React hooks and the HTTP client so session expiry / login can
// clear or re-scope the cache without import cycles:
//   api.ts  → asyncCache.ts
//   useAsync.ts → asyncCache.ts
//   auth.ts → asyncCache.ts / api.ts
// ---------------------------------------------------------------------------

export interface CacheEntry<T = unknown> {
  data: T;
  at: number;
}

const cache = new Map<string, CacheEntry>();

/** Fresh window for stale-while-revalidate consumers (ms). */
export const ASYNC_CACHE_FRESH_MS = 20_000;

// Scope cache keys by authenticated user so a re-login as another account
// cannot reuse the previous user's entries even if TTL has not expired.
let cacheUserKey = 'anon';

/** Bind the async cache namespace to the current user id (or anon when logged out). */
export function setAsyncCacheUser(userId: string | null | undefined): void {
  cacheUserKey = userId && String(userId).trim() ? String(userId).trim() : 'anon';
}

export function getAsyncCacheUser(): string {
  return cacheUserKey;
}

/** Build a user-scoped key from an explicit, stable cache namespace. */
export function buildAsyncCacheKey(cacheKey: string, deps: readonly unknown[] = []): string {
  const namespace = cacheKey.trim();
  if (!namespace) {
    throw new TypeError('useAsync cacheKey must be a non-empty string');
  }

  let serializedDeps: string | undefined;
  try {
    serializedDeps = JSON.stringify(deps, (_key, value: unknown) => {
      if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
        throw new TypeError('useAsync dependencies must be JSON-serializable');
      }
      return value;
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('useAsync dependencies')) {
      throw error;
    }
    throw new TypeError(
      `useAsync dependencies must be JSON-serializable: ${error instanceof Error ? error.message : 'unknown value'}`,
    );
  }

  if (serializedDeps === undefined) {
    throw new TypeError('useAsync dependencies must be JSON-serializable');
  }

  return `${cacheUserKey}:${namespace}:${serializedDeps}`;
}

export function getAsyncCacheEntry<T>(key: string): CacheEntry<T> | undefined {
  return cache.get(key) as CacheEntry<T> | undefined;
}

export function setAsyncCacheEntry<T>(key: string, data: T, at: number = Date.now()): void {
  cache.set(key, { data, at });
}

export function deleteAsyncCacheEntry(key: string): void {
  cache.delete(key);
}

/** Invalidate every cached entry (e.g. on logout / 401). */
export function clearAsyncCache(): void {
  cache.clear();
}

/**
 * Invalidate selected cache entries.
 * - string: exact cache namespace for the active user (all dependency variants)
 * - RegExp: tested against the cache key
 * - function: predicate over the cache key
 */
export function invalidateAsyncCache(
  match: string | RegExp | ((key: string) => boolean),
): number {
  let removed = 0;
  const namespacePrefix =
    typeof match === 'string' ? `${cacheUserKey}:${match.trim()}:` : null;
  for (const key of [...cache.keys()]) {
    if (match instanceof RegExp) match.lastIndex = 0;
    const hit =
      typeof match === 'function'
        ? match(key)
        : match instanceof RegExp
          ? match.test(key)
          : Boolean(namespacePrefix && key.startsWith(namespacePrefix));
    if (hit) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Test helper: current key count in the registry. */
export function asyncCacheSize(): number {
  return cache.size;
}
