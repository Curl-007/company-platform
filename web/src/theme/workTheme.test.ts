import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORK_THEME_STORAGE_KEY,
  WORK_THEMES,
  applyWorkTheme,
  defaultWorkThemeSettings,
  readWorkThemeSettings,
  resetWorkThemeSettings,
  saveWorkThemeSettings,
} from './workTheme';

const LEGACY_WORK_THEME_STORAGE_KEY = 'work-glass-theme-settings';

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
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-ambient');
    document.documentElement.removeAttribute('data-work-ambient');
    document.documentElement.removeAttribute('data-work-nav-layout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the single Codex theme and current defaults', () => {
    expect(WORK_THEMES).toHaveLength(1);
    expect(WORK_THEMES[0].id).toBe('kaneo');
    expect(WORK_THEMES[0].label).toBe('Codex');
    expect(defaultWorkThemeSettings).toEqual({
      theme: 'kaneo',
      mode: 'dark',
      density: 'standard',
      contrast: 'default',
      reduceMotion: false,
      fontSize: 15,
      fontFamily: 'system',
      contentPadding: 24,
    });
    expect(readWorkThemeSettings()).toEqual(defaultWorkThemeSettings);
  });

  it('migrates allowed fields from an old object and writes canonical settings', () => {
    window.localStorage.setItem(WORK_THEME_STORAGE_KEY, JSON.stringify({
      theme: 'scholar',
      mode: 'dark',
      density: 'compact',
      contrast: 'high',
      reduceMotion: true,
      fontSize: 18,
      fontFamily: 'noto',
      contentPadding: 40,
      ambient: true,
      glassBlur: 22,
      navLayout: 'mini',
      radius: 18,
    }));

    const migrated = readWorkThemeSettings();

    expect(migrated).toEqual({
      theme: 'kaneo',
      mode: 'dark',
      density: 'compact',
      contrast: 'high',
      reduceMotion: true,
      fontSize: 18,
      fontFamily: 'noto',
      contentPadding: 40,
    });
    expect(JSON.parse(window.localStorage.getItem(WORK_THEME_STORAGE_KEY) ?? '')).toEqual(migrated);
    expect(window.localStorage.getItem(LEGACY_WORK_THEME_STORAGE_KEY)).toBeNull();
  });

  it('reads the historical key and removes it after migration', () => {
    window.localStorage.setItem(LEGACY_WORK_THEME_STORAGE_KEY, JSON.stringify({
      theme: 'aurora',
      mode: 'dark',
      density: 'compact',
      fontSize: 16,
      fontFamily: 'sans',
      contentPadding: 32,
      ambient: false,
      glass: true,
      navLayout: 'horizontal',
    }));

    expect(readWorkThemeSettings()).toEqual({
      ...defaultWorkThemeSettings,
      mode: 'dark',
      density: 'compact',
      fontSize: 16,
      fontFamily: 'sans',
      contentPadding: 32,
    });
    expect(window.localStorage.getItem(LEGACY_WORK_THEME_STORAGE_KEY)).toBeNull();
  });

  it('applies Kaneo semantic tokens, data-work-mode, and dark class', () => {
    const root = document.documentElement;
    root.setAttribute('data-work-ambient', 'on');
    root.setAttribute('data-work-nav-layout', 'mini');
    root.classList.add('dark');

    applyWorkTheme({
      ...defaultWorkThemeSettings,
      mode: 'dark',
      fontSize: 18,
      contrast: 'high',
    });

    expect(root.dataset.workTheme).toBe('kaneo');
    expect(root.dataset.workMode).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.workAmbient).toBeUndefined();
    expect(root.dataset.workNavLayout).toBeUndefined();
    expect(root.style.getPropertyValue('--background')).toBe('#181818');
    expect(root.style.getPropertyValue('--primary')).toBe('#339cff');
    expect(root.style.getPropertyValue('--fs-body')).toBe('18px');
    expect(root.style.getPropertyValue('--border-default')).toContain('color-mix');
    expect(root.style.getPropertyValue('--text-secondary')).toContain('88%');
    expect(root.style.getPropertyValue('--work-glass-blur')).toBe('0px');
  });

  it('persists only canonical settings', () => {
    const saved = saveWorkThemeSettings({
      ...defaultWorkThemeSettings,
      mode: 'dark',
      density: 'compact',
      contentPadding: 40,
    });
    const persisted = JSON.parse(window.localStorage.getItem(WORK_THEME_STORAGE_KEY) ?? '') as Record<string, unknown>;

    expect(persisted).toEqual(saved);
    expect(persisted).not.toHaveProperty('ambient');
    expect(persisted).not.toHaveProperty('glassBlur');
    expect(persisted).not.toHaveProperty('navLayout');
    expect(document.documentElement.dataset.workMode).toBe('dark');
  });

  it('resets persisted settings and the document to defaults', () => {
    saveWorkThemeSettings({ ...defaultWorkThemeSettings, mode: 'dark', density: 'compact' });
    window.localStorage.setItem(LEGACY_WORK_THEME_STORAGE_KEY, 'stale');

    expect(resetWorkThemeSettings()).toEqual(defaultWorkThemeSettings);
    expect(window.localStorage.getItem(WORK_THEME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_WORK_THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.workMode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
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
    expect(document.documentElement.dataset.workMode).toBe('dark');
  });
});
