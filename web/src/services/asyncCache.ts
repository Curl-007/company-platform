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

export function buildAsyncCacheKey(loader: () => Promise<unknown>, deps: unknown[]): string {
  // Prefer a stable function name; for anonymous loaders include a short body
  // fingerprint so two different () => fetchX() closures don't collide.
  const named = loader.name && loader.name !== 'anonymous' ? loader.name : '';
  let bodyHint = '';
  if (!named) {
    try {
      const src = loader.toString().replace(/\s+/g, ' ').slice(0, 120);
      bodyHint = `anon:${src}`;
    } catch {
      bodyHint = 'anon';
    }
  }
  const name = named || bodyHint;
  try {
    return `${cacheUserKey}:${name}:${JSON.stringify(deps)}`;
  } catch {
    return `${cacheUserKey}:${name}:${deps.length}`;
  }
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
 * - string: case-insensitive substring match against the cache key
 * - RegExp: tested against the cache key
 * - function: predicate over the cache key
 */
export function invalidateAsyncCache(
  match: string | RegExp | ((key: string) => boolean),
): number {
  let removed = 0;
  for (const key of [...cache.keys()]) {
    const hit =
      typeof match === 'function'
        ? match(key)
        : match instanceof RegExp
          ? match.test(key)
          : key.toLowerCase().includes(String(match).toLowerCase());
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
