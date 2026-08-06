import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageState from './PageState';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe('PageState', () => {
  it('renders the shared Spinner primitive while loading', async () => {
    await act(async () => {
      root.render(createElement(PageState, { loading: true, error: null }));
    });

    expect(container.querySelector('.page-state-panel.panel')).not.toBeNull();
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(container.querySelector('.data-table-loading[role="status"]')).not.toBeNull();
  });

  it('renders the shared Empty primitive and keeps retry behavior', async () => {
    const onRetry = vi.fn();

    await act(async () => {
      root.render(createElement(PageState, {
        loading: false,
        error: '请求失败',
        onRetry,
      }));
    });

    expect(container.querySelector('.empty-state[data-slot="empty"]')).not.toBeNull();
    expect(container.querySelector('.empty-state-block')).not.toBeNull();
    expect(container.querySelector('.empty-state-title')?.textContent).toBe('数据加载失败');
    expect(container.querySelector('.empty-state-desc')?.textContent).toBe('请求失败');

    await act(async () => container.querySelector<HTMLButtonElement>('.page-state-retry')?.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the configured empty copy and returns null for the ready state', async () => {
    await act(async () => {
      root.render(createElement(PageState, {
        loading: false,
        error: null,
        isEmpty: true,
        emptyTitle: '暂无项目',
        emptyDescription: '先创建一个项目。',
      }));
    });

    expect(container.querySelector('.empty-state-title')?.textContent).toBe('暂无项目');
    expect(container.querySelector('.empty-state-desc')?.textContent).toBe('先创建一个项目。');

    await act(async () => {
      root.render(createElement(PageState, { loading: false, error: null }));
    });
    expect(container.firstElementChild).toBeNull();
  });
});
