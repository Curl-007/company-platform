import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASYNC_REFRESH_FAILURE_EVENT,
  dispatchAsyncRefreshFailure,
} from '../../services/asyncRefreshEvents';
import { ToastProvider } from './Toast';

let container: HTMLDivElement;
let root: Root;
let mounted: boolean;

beforeEach(async () => {
  vi.useFakeTimers();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(ToastProvider, null, createElement('span', null, 'content')));
  });
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('ToastProvider async refresh failures', () => {
  it('deduplicates failures by cache key and retries the latest request', async () => {
    const firstRetry = vi.fn();
    const latestRetry = vi.fn();

    await act(async () => {
      dispatchAsyncRefreshFailure({ cacheKey: 'projects:[1]', message: 'first failure', retry: firstRetry });
      dispatchAsyncRefreshFailure({ cacheKey: 'projects:[1]', message: 'latest failure', retry: latestRetry });
    });

    expect(container.querySelectorAll('.toast')).toHaveLength(1);
    expect(container.querySelector('.toast-message')?.textContent).toContain('latest failure');

    const retryButton = container.querySelector<HTMLButtonElement>('.toast-action');
    expect(retryButton?.textContent).toContain('重试');
    await act(async () => retryButton?.click());

    expect(firstRetry).not.toHaveBeenCalled();
    expect(latestRetry).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('removes its event listener and pending dismiss timers on unmount', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    await act(async () => {
      dispatchAsyncRefreshFailure({ cacheKey: 'dashboard', message: 'offline', retry: vi.fn() });
    });
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => root.unmount());
    mounted = false;

    expect(removeListener).toHaveBeenCalledWith(
      ASYNC_REFRESH_FAILURE_EVENT,
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
