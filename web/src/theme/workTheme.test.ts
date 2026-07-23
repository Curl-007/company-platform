import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORK_THEME_STORAGE_KEY,
  applyWorkTheme,
  defaultWorkThemeSettings,
  readWorkThemeSettings,
  resetWorkThemeSettings,
  saveWorkThemeSettings,
} from './workTheme';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

describe('work theme settings', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses current defaults for missing fields in older stored settings', () => {
    window.localStorage.setItem(WORK_THEME_STORAGE_KEY, JSON.stringify({ theme: 'scholar' }));

    expect(readWorkThemeSettings()).toEqual(defaultWorkThemeSettings);
  });

  it('migrates the previous scholar default to the richer current default', () => {
    window.localStorage.setItem(WORK_THEME_STORAGE_KEY, JSON.stringify({
      theme: 'scholar',
      mode: 'light',
      density: 'compact',
      contrast: 'default',
      reduceMotion: false,
      ambient: false,
      fontSize: 14,
      fontFamily: 'system',
      navLayout: 'expanded',
      radius: 6,
      glassBlur: 0,
      contentPadding: 20,
    }));

    expect(readWorkThemeSettings()).toEqual(defaultWorkThemeSettings);
  });

  it('applies typography scale and high contrast tokens to the root element', () => {
    applyWorkTheme({
      ...defaultWorkThemeSettings,
      fontSize: 18,
      contrast: 'high',
    });

    const root = document.documentElement;
    expect(root.dataset.workContrast).toBe('high');
    expect(root.style.getPropertyValue('--fs-body')).toBe('18px');
    expect(root.style.getPropertyValue('--fs-page-title')).toBe('25px');
    expect(root.style.getPropertyValue('--border-default')).toContain('color-mix');
    expect(root.style.getPropertyValue('--text-secondary')).toContain('88%');
  });

  it('keeps save and reset usable when local storage rejects writes', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => saveWorkThemeSettings({ ...defaultWorkThemeSettings, mode: 'dark' })).not.toThrow();
    expect(document.documentElement.dataset.workMode).toBe('dark');

    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => resetWorkThemeSettings()).not.toThrow();
    expect(document.documentElement.dataset.workMode).toBe('light');
  });
});
