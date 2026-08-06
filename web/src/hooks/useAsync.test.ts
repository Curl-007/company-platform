import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASYNC_CACHE_FRESH_MS,
  buildAsyncCacheKey,
  clearAsyncCache,
  setAsyncCacheEntry,
  setAsyncCacheUser,
} from '../services/asyncCache';
import {
  ASYNC_REFRESH_FAILURE_EVENT,
  type AsyncRefreshFailureEvent,
} from '../services/asyncRefreshEvents';
import { queryClient } from '../lib/queryClient';
import { useAsync } from './useAsync';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

interface ObservedState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refreshError: string | null;
  reload: () => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** Flush React Query + React state updates that settle on microtasks/macrotasks. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderHook<T>(
  loader: () => Promise<T>,
  cacheKey: string,
): Promise<{ root: Root; state: () => ObservedState<T> }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let current: ObservedState<T> | null = null;

  function Probe() {
    current = useAsync(loader, [], { cacheKey });
    return null;
  }

  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)),
    );
  });
  await flush();

  return {
    root,
    state: () => {
      if (!current) throw new Error('hook did not render');
      return current;
    },
  };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearAsyncCache();
  queryClient.clear();
  setAsyncCacheUser('USR-A');
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAsyncCache();
  queryClient.clear();
  setAsyncCacheUser(null);
  document.body.replaceChildren();
});

describe('useAsync stale-while-revalidate state', () => {
  it('reports a first-load failure through error', async () => {
    const refreshFailureListener = vi.fn();
    window.addEventListener(ASYNC_REFRESH_FAILURE_EVENT, refreshFailureListener);
    const request = deferred<string[]>();
    const hook = await renderHook(() => request.promise, 'test:initial');

    expect(hook.state()).toMatchObject({
      data: null,
      loading: true,
      error: null,
      refreshing: false,
      refreshError: null,
    });

    await act(async () => {
      request.reject(new Error('initial failed'));
      await request.promise.catch(() => undefined);
    });
    await flush();

    expect(hook.state()).toMatchObject({
      data: null,
      loading: false,
      error: 'initial failed',
      refreshing: false,
      refreshError: null,
    });
    expect(refreshFailureListener).not.toHaveBeenCalled();
    window.removeEventListener(ASYNC_REFRESH_FAILURE_EVENT, refreshFailureListener);
    await act(async () => hook.root.unmount());
  });

  it('keeps stale data visible and reports a background refresh failure separately', async () => {
    const refreshFailures: AsyncRefreshFailureEvent[] = [];
    const refreshFailureListener: EventListener = (event) => {
      refreshFailures.push(event as AsyncRefreshFailureEvent);
    };
    window.addEventListener(ASYNC_REFRESH_FAILURE_EVENT, refreshFailureListener);
    const cacheKey = 'test:background';
    setAsyncCacheEntry(
      buildAsyncCacheKey(cacheKey),
      ['cached'],
      Date.now() - ASYNC_CACHE_FRESH_MS - 1,
    );
    const request = deferred<string[]>();
    const hook = await renderHook(() => request.promise, cacheKey);

    expect(hook.state()).toMatchObject({
      data: ['cached'],
      loading: false,
      error: null,
      refreshing: true,
      refreshError: null,
    });

    await act(async () => {
      request.reject(new Error('refresh failed'));
      await request.promise.catch(() => undefined);
    });
    await flush();

    expect(hook.state()).toMatchObject({
      data: ['cached'],
      loading: false,
      error: null,
      refreshing: false,
      refreshError: 'refresh failed',
    });
    expect(refreshFailures).toHaveLength(1);
    expect(refreshFailures[0].detail).toMatchObject({
      cacheKey: buildAsyncCacheKey(cacheKey),
      message: 'refresh failed',
    });
    expect(typeof refreshFailures[0].detail.retry).toBe('function');
    window.removeEventListener(ASYNC_REFRESH_FAILURE_EVENT, refreshFailureListener);
    await act(async () => hook.root.unmount());
  });

  it('serves a fresh entry and preserves it when a forced refresh fails', async () => {
    const cacheKey = 'test:fresh';
    setAsyncCacheEntry(buildAsyncCacheKey(cacheKey), ['fresh']);
    const loader = vi.fn<() => Promise<string[]>>().mockResolvedValue(['network']);
    const hook = await renderHook(loader, cacheKey);

    expect(hook.state()).toMatchObject({
      data: ['fresh'],
      loading: false,
      refreshing: false,
      refreshError: null,
    });
    expect(loader).not.toHaveBeenCalled();

    const request = deferred<string[]>();
    loader.mockImplementation(() => request.promise);
    await act(async () => {
      hook.state().reload();
    });
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(hook.state()).toMatchObject({ data: ['fresh'], loading: false, refreshing: true });

    await act(async () => {
      request.reject(new Error('manual refresh failed'));
      await request.promise.catch(() => undefined);
    });
    await flush();
    expect(hook.state()).toMatchObject({
      data: ['fresh'],
      error: null,
      refreshing: false,
      refreshError: 'manual refresh failed',
    });
    await act(async () => hook.root.unmount());
  });
});
