import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshDeclarativeView } from '../models/declarativeViewModel';
import { createMemoryStorage } from '../../../test/memoryStorage';
import {
  dshUiStorageKey,
  openDshView,
  readDshUiState,
  removeDshView,
  setDshLayout,
  setDshSurfaceStyle,
  subscribeDshUiStore,
  upsertDshView,
} from './dshUiStore';

const view: DshDeclarativeView = {
  id: 'pulse',
  title: 'Delivery pulse',
  surface: 'dsh-view:pulse',
  blocks: [{ type: 'stat', id: 'health', label: 'Health', value: 91 }],
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

describe('dshUiStore', () => {
  it('persists views and active selection per authenticated user', () => {
    expect(upsertDshView('user-a', view)).toBe(true);
    expect(readDshUiState('user-a').views).toEqual([view]);
    expect(readDshUiState('user-a').activeViewId).toBe('pulse');
    expect(readDshUiState('user-b').views).toEqual([]);

    const second = { ...view, id: 'risks', title: 'Risk board', surface: 'dsh-view:risks' };
    expect(upsertDshView('user-a', second)).toBe(true);
    expect(openDshView('user-a', 'risks')).toBe(true);
    expect(readDshUiState('user-a').activeViewId).toBe('risks');
    expect(removeDshView('user-a', 'risks')).toBe(true);
    expect(readDshUiState('user-a').activeViewId).toBe('pulse');
  });

  it('persists validated layout/style settings and notifies same-tab consumers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDshUiStore('user-a', listener);

    expect(setDshLayout('user-a', 'project:detail', ['summary', 'delivery'])).toBe(true);
    expect(setDshSurfaceStyle('user-a', 'project:detail', { variant: 'contrast', columns: 2, gap: 24 })).toBe(true);

    const state = readDshUiState('user-a');
    expect(state.layouts).toEqual([{ surface: 'project:detail', order: ['summary', 'delivery'] }]);
    expect(state.surfaceStyles).toEqual([{
      surface: 'project:detail',
      style: { variant: 'contrast', columns: 2, gap: 24 },
    }]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('drops malformed persisted data instead of returning it to the renderer', () => {
    const key = dshUiStorageKey('user-a');
    window.localStorage.setItem(key!, JSON.stringify({
      version: 1,
      activeViewId: 'bad',
      views: [{ id: 'bad', title: 'Bad', blocks: [{ type: 'html', id: 'x', html: '<script />' }] }],
      surfaceStyles: [{ surface: 'x', style: { variant: 'raw-css', columns: 2, gap: 16 } }],
      layouts: [],
    }));

    expect(readDshUiState('user-a')).toEqual({ views: [], activeViewId: null, surfaceStyles: [], layouts: [] });
  });
});
