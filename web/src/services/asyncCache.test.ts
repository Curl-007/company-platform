import { afterEach, describe, expect, it } from 'vitest';
import {
  asyncCacheSize,
  buildAsyncCacheKey,
  clearAsyncCache,
  getAsyncCacheEntry,
  getAsyncCacheUser,
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
    const keyA = buildAsyncCacheKey(async function fetchProjects() {
      return [];
    }, []);
    setAsyncCacheEntry(keyA, [{ id: 'PRJ-A' }]);

    setAsyncCacheUser('USR-B');
    const keyB = buildAsyncCacheKey(async function fetchProjects() {
      return [];
    }, []);
    expect(keyA).not.toBe(keyB);
    expect(getAsyncCacheEntry(keyB)).toBeUndefined();
    expect(getAsyncCacheEntry(keyA)?.data).toEqual([{ id: 'PRJ-A' }]);
  });

  it('clears all entries and resets namespace to anon', () => {
    setAsyncCacheUser('USR-A');
    setAsyncCacheEntry('USR-A:fetchProjects:[]', [1]);
    expect(asyncCacheSize()).toBe(1);

    clearAsyncCache();
    setAsyncCacheUser(null);

    expect(asyncCacheSize()).toBe(0);
    expect(getAsyncCacheUser()).toBe('anon');
  });
});
