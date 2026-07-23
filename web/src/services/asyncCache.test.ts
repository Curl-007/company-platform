import { afterEach, describe, expect, it } from 'vitest';
import {
  asyncCacheSize,
  buildAsyncCacheKey,
  clearAsyncCache,
  getAsyncCacheEntry,
  getAsyncCacheUser,
  invalidateAsyncCache,
  setAsyncCacheEntry,
  setAsyncCacheUser,
} from './asyncCache';

afterEach(() => {
  clearAsyncCache();
  setAsyncCacheUser(null);
});

describe('asyncCache user namespace', () => {
  it('scopes keys by the bound user id', () => {
    setAsyncCacheUser('USR-A');
    const keyA = buildAsyncCacheKey('projects:list', []);
    setAsyncCacheEntry(keyA, [{ id: 'PRJ-A' }]);

    setAsyncCacheUser('USR-B');
    const keyB = buildAsyncCacheKey('projects:list', []);
    expect(keyA).not.toBe(keyB);
    expect(getAsyncCacheEntry(keyB)).toBeUndefined();
    expect(getAsyncCacheEntry(keyA)?.data).toEqual([{ id: 'PRJ-A' }]);
  });

  it('clears all entries and resets namespace to anon', () => {
    setAsyncCacheUser('USR-A');
    setAsyncCacheEntry(buildAsyncCacheKey('projects:list'), [1]);
    expect(asyncCacheSize()).toBe(1);

    clearAsyncCache();
    setAsyncCacheUser(null);

    expect(asyncCacheSize()).toBe(0);
    expect(getAsyncCacheUser()).toBe('anon');
  });

  it('invalidates an exact namespace across dependency variants', () => {
    setAsyncCacheUser('USR-A');
    const first = buildAsyncCacheKey('projects:list', ['active']);
    const second = buildAsyncCacheKey('projects:list', ['archived']);
    const similarlyNamed = buildAsyncCacheKey('projects:list-summary', []);
    setAsyncCacheEntry(first, [1]);
    setAsyncCacheEntry(second, [2]);
    setAsyncCacheEntry(similarlyNamed, [3]);

    expect(invalidateAsyncCache('projects:list')).toBe(2);
    expect(getAsyncCacheEntry(first)).toBeUndefined();
    expect(getAsyncCacheEntry(second)).toBeUndefined();
    expect(getAsyncCacheEntry(similarlyNamed)?.data).toEqual([3]);
  });

  it('rejects empty namespaces and non-serializable dependencies', () => {
    expect(() => buildAsyncCacheKey('   ')).toThrow(/non-empty/);
    expect(() => buildAsyncCacheKey('projects:list', [1n])).toThrow(/JSON-serializable/);
  });
});
