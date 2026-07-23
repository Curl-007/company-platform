import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAsyncCacheKey,
  clearAsyncCache,
  getAsyncCacheEntry,
  setAsyncCacheEntry,
  setAsyncCacheUser,
} from './asyncCache';
import { unwrapPost } from './apiClient';

beforeEach(() => {
  sessionStorage.clear();
  clearAsyncCache();
  setAsyncCacheUser('USR-A');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { id: 'PRJ-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearAsyncCache();
  setAsyncCacheUser(null);
  sessionStorage.clear();
});

describe('mutation cache invalidation', () => {
  it('invalidates explicit project namespaces while retaining unrelated data', async () => {
    const projectList = buildAsyncCacheKey('projects:list');
    const projectDetail = buildAsyncCacheKey('projects:detail', ['PRJ-1']);
    const dashboard = buildAsyncCacheKey('dashboard:overview');
    const products = buildAsyncCacheKey('products:list');
    setAsyncCacheEntry(projectList, [{ id: 'old-project' }]);
    setAsyncCacheEntry(projectDetail, { id: 'old-project' });
    setAsyncCacheEntry(dashboard, { projectCount: 1 });
    setAsyncCacheEntry(products, [{ id: 'PRODUCT-1' }]);

    await unwrapPost('/api/projects', { name: 'New project' });

    expect(getAsyncCacheEntry(projectList)).toBeUndefined();
    expect(getAsyncCacheEntry(projectDetail)).toBeUndefined();
    expect(getAsyncCacheEntry(dashboard)).toBeUndefined();
    expect(getAsyncCacheEntry(products)?.data).toEqual([{ id: 'PRODUCT-1' }]);
  });
});
