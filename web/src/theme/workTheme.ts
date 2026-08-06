export type WorkThemeId = 'kaneo';
export type WorkThemeMode = 'dark' | 'light';
export type WorkThemeDensity = 'standard' | 'compact';
export type WorkThemeContrast = 'default' | 'high';
export type WorkThemeFont = 'system' | 'sans' | 'noto' | 'misans' | 'puhui';

export interface WorkThemeSettings {
  // Keep the neutral theme id in the persisted shape for compatibility with callers.
  theme: WorkThemeId;
  mode: WorkThemeMode;
  density: WorkThemeDensity;
  contrast: WorkThemeContrast;
  reduceMotion: boolean;
  fontSize: number;
  fontFamily: WorkThemeFont;
  contentPadding: number;
}

interface WorkThemePalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  accentHover: string;
  border: string;
  input: string;
  ring: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  info: string;
  infoForeground: string;
  blocked: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  accentRgb: string;
  successRgb: string;
  warningRgb: string;
  blockedRgb: string;
  page: string;
  content: string;
  topbar: string;
  tertiary: string;
}

export interface WorkThemePreset {
  id: WorkThemeId;
  label: string;
  blurb: string;
  preview: {
    dark: { bg: string; gradient: [string, string, string] };
    light: { bg: string; gradient: [string, string, string] };
  };
  dark: WorkThemePalette;
  light: WorkThemePalette;
}

export const WORK_THEME_STORAGE_KEY = 'work-theme-settings';
const LEGACY_WORK_THEME_STORAGE_KEYS = ['work-glass-theme-settings'] as const;
const ALL_WORK_THEME_STORAGE_KEYS = [WORK_THEME_STORAGE_KEY, ...LEGACY_WORK_THEME_STORAGE_KEYS] as const;

export const defaultWorkThemeSettings: WorkThemeSettings = {
  theme: 'kaneo',
  mode: 'dark',
  density: 'standard',
  contrast: 'default',
  reduceMotion: false,
  fontSize: 15,
  fontFamily: 'system',
  contentPadding: 24,
};

const KANEO_LIGHT: WorkThemePalette = {
  background: '#ffffff',
  foreground: '#1a1c1f',
  card: '#ffffff',
  cardForeground: '#1a1c1f',
  popover: '#ffffff',
  popoverForeground: '#1a1c1f',
  primary: '#1f7fdf',
  primaryForeground: '#ffffff',
  secondary: '#f5f5f5',
  secondaryForeground: '#1a1c1f',
  muted: '#f5f5f5',
  mutedForeground: '#656d76',
  accent: '#e8f2ff',
  accentForeground: '#1a1c1f',
  accentHover: '#d0e7ff',
  border: '#e5e5e5',
  input: '#e5e5e5',
  ring: '#339cff',
  destructive: '#ba2623',
  destructiveForeground: '#ffffff',
  success: '#00a240',
  successForeground: '#ffffff',
  warning: '#9a6700',
  warningForeground: '#ffffff',
  info: '#1f7fdf',
  infoForeground: '#ffffff',
  blocked: '#924ff7',
  sidebar: '#fafafa',
  sidebarForeground: '#1a1c1f',
  sidebarPrimary: '#1f7fdf',
  sidebarPrimaryForeground: '#ffffff',
  sidebarAccent: '#f0f0f0',
  sidebarAccentForeground: '#1a1c1f',
  sidebarBorder: '#e5e5e5',
  sidebarRing: '#339cff',
  accentRgb: '31, 127, 223',
  successRgb: '0, 162, 64',
  warningRgb: '154, 103, 0',
  blockedRgb: '146, 79, 247',
  page: '#ffffff',
  content: '#ffffff',
  topbar: '#ffffff',
  tertiary: '#8c959f',
};

const KANEO_DARK: WorkThemePalette = {
  background: '#181818',
  foreground: '#ffffff',
  card: '#1f1f1f',
  cardForeground: '#ffffff',
  popover: '#242424',
  popoverForeground: '#ffffff',
  primary: '#339cff',
  primaryForeground: '#0a0a0a',
  secondary: '#262626',
  secondaryForeground: '#e5e5e5',
  muted: '#262626',
  mutedForeground: '#a0a0a0',
  accent: '#339cff',
  accentForeground: '#0a0a0a',
  accentHover: '#1f7fdf',
  border: '#2e2e2e',
  input: '#2e2e2e',
  ring: '#339cff',
  destructive: '#fa423e',
  destructiveForeground: '#0a0a0a',
  success: '#40c977',
  successForeground: '#0a1a0e',
  warning: '#fbbf24',
  warningForeground: '#1a1403',
  info: '#339cff',
  infoForeground: '#0a1a2a',
  blocked: '#ad7bf9',
  sidebar: '#141414',
  sidebarForeground: '#ffffff',
  sidebarPrimary: '#339cff',
  sidebarPrimaryForeground: '#0a0a0a',
  sidebarAccent: '#1f1f1f',
  sidebarAccentForeground: '#ffffff',
  sidebarBorder: '#2e2e2e',
  sidebarRing: '#339cff',
  accentRgb: '51, 156, 255',
  successRgb: '64, 201, 119',
  warningRgb: '251, 191, 36',
  blockedRgb: '173, 123, 249',
  page: '#181818',
  content: '#1f1f1f',
  topbar: '#1f1f1f',
  tertiary: '#a0a0a0',
};

export const WORK_THEMES: WorkThemePreset[] = [
  {
    id: 'kaneo',
    label: 'Codex',
    blurb: '深色蓝调',
    preview: {
      dark: { bg: KANEO_DARK.background, gradient: [KANEO_DARK.primary, KANEO_DARK.primary, KANEO_DARK.ring] },
      light: { bg: KANEO_LIGHT.background, gradient: [KANEO_LIGHT.primary, KANEO_LIGHT.primary, KANEO_LIGHT.border] },
    },
    dark: KANEO_DARK,
    light: KANEO_LIGHT,
  },
];

export const WORK_FONT_LABELS: Record<WorkThemeFont, string> = {
  system: '系统界面',
  sans: '现代无衬线',
  noto: '思源黑体',
  misans: 'MiSans',
  puhui: '阿里普惠',
};

export function readWorkThemeSettings(): WorkThemeSettings {
  const storage = getStorage();
  if (!storage) return defaultWorkThemeSettings;

  for (const key of ALL_WORK_THEME_STORAGE_KEYS) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      return defaultWorkThemeSettings;
    }
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      const next = normalizeSettings(parsed);
      if (key !== WORK_THEME_STORAGE_KEY || raw !== JSON.stringify(next)) {
        persistSettings(storage, next);
      }
      return next;
    } catch {
      // Try a known legacy key before falling back to defaults.
    }
  }

  return defaultWorkThemeSettings;
}

export function saveWorkThemeSettings(settings: WorkThemeSettings): WorkThemeSettings {
  const next = normalizeSettings(settings);
  const storage = getStorage();
  if (storage) persistSettings(storage, next);
  applyWorkTheme(next);
  return next;
}

/**
 * Same as saveWorkThemeSettings but wraps the DOM update in a View Transition
 * when the browser supports it, so dark/light switching reveals with a radial
 * wipe from the click point. Pass the click coordinates via `origin` (from the
 * triggering button's getBoundingClientRect center, or pointer event coords).
 * Falls back to the plain synchronous apply when the API is unavailable.
 */
export function saveWorkThemeSettingsWithTransition(
  settings: WorkThemeSettings,
  origin?: { x: number; y: number },
): WorkThemeSettings {
  const next = normalizeSettings(settings);
  const storage = getStorage();
  if (storage) persistSettings(storage, next);

  // Only animate when the mode actually flips; other settings (font size,
  // density) change without a theme swap and shouldn't trigger the wipe.
  const doc = typeof document !== 'undefined' ? document : undefined;
  const supportsVT = !!doc && 'startViewTransition' in doc;

  if (supportsVT && doc) {
    const root = doc.documentElement;
    if (origin) {
      root.style.setProperty('--theme-transition-x', `${origin.x}px`);
      root.style.setProperty('--theme-transition-y', `${origin.y}px`);
    }
    (doc as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
      applyWorkTheme(next);
    });
  } else {
    applyWorkTheme(next);
  }
  return next;
}

export function resetWorkThemeSettings(): WorkThemeSettings {
  const storage = getStorage();
  if (storage) {
    for (const key of ALL_WORK_THEME_STORAGE_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Keep reset functional when persistent storage is unavailable.
      }
    }
  }
  applyWorkTheme(defaultWorkThemeSettings);
  return defaultWorkThemeSettings;
}

export function applyWorkTheme(settings: WorkThemeSettings): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const normalized = normalizeSettings(settings);
  const palette = normalized.mode === 'dark' ? KANEO_DARK : KANEO_LIGHT;
  const highContrast = normalized.contrast === 'high';
  const secondaryText = highContrast
    ? `color-mix(in srgb, ${palette.foreground} 88%, transparent)`
    : palette.mutedForeground;
  const tertiaryText = highContrast
    ? `color-mix(in srgb, ${palette.foreground} 72%, transparent)`
    : palette.tertiary;
  const border = highContrast
    ? `color-mix(in srgb, ${palette.foreground} ${normalized.mode === 'dark' ? '34%' : '28%'}, transparent)`
    : palette.border;
  const borderStrong = highContrast
    ? `color-mix(in srgb, ${palette.foreground} ${normalized.mode === 'dark' ? '48%' : '40%'}, transparent)`
    : palette.border;
  const fontStack = fontStackOf(normalized.fontFamily);
  const primaryGradient = `linear-gradient(135deg, ${palette.primary}, ${palette.primary})`;
  const primaryHoverGradient = `linear-gradient(135deg, ${palette.accentHover}, ${palette.accentHover})`;

  root.setAttribute('data-theme', 'kaneo');
  root.setAttribute('data-mode', normalized.mode);
  root.setAttribute('data-reduce-motion', String(normalized.reduceMotion));
  root.setAttribute('data-work-theme', 'kaneo');
  root.setAttribute('data-work-mode', normalized.mode);
  root.setAttribute('data-work-density', normalized.density);
  root.setAttribute('data-work-contrast', normalized.contrast);
  root.setAttribute('data-work-motion', normalized.reduceMotion ? 'reduced' : 'standard');
  root.setAttribute('data-work-font', normalized.fontFamily);
  root.classList.toggle('dark', normalized.mode === 'dark');

  // Old attributes are removed so a previous skin cannot keep affecting the document.
  root.removeAttribute('data-ambient');
  root.removeAttribute('data-work-ambient');
  root.removeAttribute('data-work-nav-layout');

  setProperties(root, {
    '--background': palette.background,
    '--foreground': palette.foreground,
    '--card': palette.card,
    '--card-foreground': palette.cardForeground,
    '--popover': palette.popover,
    '--popover-foreground': palette.popoverForeground,
    '--primary': palette.primary,
    '--primary-foreground': palette.primaryForeground,
    '--secondary': palette.secondary,
    '--secondary-foreground': palette.secondaryForeground,
    '--muted': palette.muted,
    '--muted-foreground': secondaryText,
    '--accent': palette.accent,
    '--accent-foreground': palette.accentForeground,
    '--border': border,
    '--input': highContrast ? borderStrong : palette.input,
    '--ring': palette.ring,
    '--destructive': palette.destructive,
    '--destructive-foreground': palette.destructiveForeground,
    '--success': palette.success,
    '--success-foreground': palette.successForeground,
    '--warning': palette.warning,
    '--warning-foreground': palette.warningForeground,
    '--info': palette.info,
    '--info-foreground': palette.infoForeground,
    '--sidebar': palette.sidebar,
    '--sidebar-foreground': palette.sidebarForeground,
    '--sidebar-primary': palette.sidebarPrimary,
    '--sidebar-primary-foreground': palette.sidebarPrimaryForeground,
    '--sidebar-accent': palette.sidebarAccent,
    '--sidebar-accent-foreground': palette.sidebarAccentForeground,
    '--sidebar-border': highContrast ? border : palette.sidebarBorder,
    '--sidebar-ring': palette.sidebarRing,
    '--color-primary': palette.primary,
    '--color-success': palette.success,
    '--color-success-bg': `color-mix(in srgb, ${palette.success} 14%, transparent)`,
    '--color-warning': palette.warning,
    '--color-warning-bg': `color-mix(in srgb, ${palette.warning} 16%, transparent)`,
    '--color-risk': palette.destructive,
    '--color-risk-bg': `color-mix(in srgb, ${palette.destructive} 14%, transparent)`,
    '--color-info': palette.info,
    '--color-info-bg': `color-mix(in srgb, ${palette.info} 14%, transparent)`,
    '--color-blocked': palette.blocked,
    '--color-blocked-bg': `color-mix(in srgb, ${palette.blocked} 14%, transparent)`,
    '--contrast-border-width': highContrast ? '2px' : '1px',
    '--focus-ring-width': highContrast ? '3px' : '2px',
    '--fs-display': `${normalized.fontSize + 10}px`,
    '--fs-page-title': `${normalized.fontSize + 7}px`,
    '--fs-section-title': `${normalized.fontSize + 2}px`,
    '--fs-body': `${normalized.fontSize}px`,
    '--fs-helper': `${Math.max(12, normalized.fontSize - 2)}px`,
    '--fs-table-body': `${Math.max(12, normalized.fontSize - 1)}px`,
    '--fs-kpi-value': `${normalized.fontSize + 13}px`,
    '--font-size-body': `${normalized.fontSize}px`,
    '--font-size-page-title': `${normalized.fontSize + 7}px`,
    '--font-size-section-title': `${normalized.fontSize + 2}px`,
    '--font-size-helper': `${Math.max(12, normalized.fontSize - 2)}px`,
    '--font-size-table': `${Math.max(12, normalized.fontSize - 1)}px`,
    '--content-padding': `${normalized.contentPadding}px`,
    '--content-gutter': `${normalized.contentPadding}px`,
    '--density-content-padding': `${normalized.contentPadding}px`,
    '--bg-page': palette.page,
    '--bg-content': palette.content,
    '--bg-sidebar': palette.sidebar,
    '--bg-topbar': palette.topbar,
    '--bg-sidebar-hover': `color-mix(in srgb, ${palette.sidebarForeground} 7%, ${palette.sidebar})`,
    '--bg-sidebar-active': `color-mix(in srgb, ${palette.primary} 12%, ${palette.sidebar})`,
    '--bg-sidebar-text': secondaryText,
    '--bg-sidebar-text-active': palette.foreground,
    '--bg-primary': palette.card,
    '--bg-secondary': palette.secondary,
    '--bg-default': palette.muted,
    '--bg-hover': palette.accent,
    '--bg-active': `color-mix(in srgb, ${palette.primary} 14%, ${palette.card})`,
    '--bg-subtle': palette.muted,
    '--text-primary': palette.foreground,
    '--text-secondary': secondaryText,
    '--text-tertiary': tertiaryText,
    '--text-inverse': palette.primaryForeground,
    '--border-default': border,
    '--border-divider': border,
    '--border-sidebar': highContrast ? border : palette.sidebarBorder,
    '--border-light': highContrast ? border : palette.border,
    '--border-strong': borderStrong,
    '--accent-hover': palette.accentHover,
    '--accent-soft': palette.accent === palette.primary ? palette.secondary : palette.accent,
    '--accent-bg': `color-mix(in srgb, ${palette.accent} 14%, transparent)`,
    '--accent-contrast': palette.accentForeground,
    '--gradient-holographic': primaryGradient,
    '--gradient-holographic-hover': primaryHoverGradient,
    '--font-cn': fontStack,
    '--font-en': fontStack,
    '--radius-sm': '4px',
    '--radius-card': '6px',
    '--radius-button': '6px',
    '--radius-input': '6px',
    '--radius-modal': '8px',
    // Fixed compatibility values keep the legacy stylesheet neutral without a user setting.
    '--work-glass-blur': '0px',
    '--work-accent-rgb': palette.accentRgb,
    '--work-magenta-rgb': palette.accentRgb,
    '--work-amber-rgb': palette.warningRgb,
    '--work-emerald-rgb': palette.successRgb,
    '--work-violet-rgb': palette.blockedRgb,
  });
}

function normalizeSettings(value: unknown): WorkThemeSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  return {
    theme: 'kaneo',
    mode: input.mode === 'dark' || input.mode === 'light' ? input.mode : defaultWorkThemeSettings.mode,
    density: input.density === 'compact' || input.density === 'standard' ? input.density : defaultWorkThemeSettings.density,
    contrast: input.contrast === 'high' || input.contrast === 'default' ? input.contrast : defaultWorkThemeSettings.contrast,
    reduceMotion: typeof input.reduceMotion === 'boolean' ? input.reduceMotion : defaultWorkThemeSettings.reduceMotion,
    fontSize: clampNumber(input.fontSize, 13, 18, defaultWorkThemeSettings.fontSize),
    fontFamily: isWorkFont(input.fontFamily) ? input.fontFamily : defaultWorkThemeSettings.fontFamily,
    contentPadding: clampNumber(input.contentPadding, 0, 240, defaultWorkThemeSettings.contentPadding),
  };
}

function isWorkFont(value: unknown): value is WorkThemeFont {
  return value === 'system' || value === 'sans' || value === 'noto' || value === 'misans' || value === 'puhui';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persistSettings(storage: Storage, settings: WorkThemeSettings): void {
  let persisted = false;
  try {
    storage.setItem(WORK_THEME_STORAGE_KEY, JSON.stringify(settings));
    persisted = true;
  } catch {
    // Storage may be disabled; the active document should still update.
  }

  if (!persisted) return;
  for (const key of LEGACY_WORK_THEME_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // A legacy key is best-effort cleanup only.
    }
  }
}

function setProperties(root: HTMLElement, properties: Record<string, string>): void {
  for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
}

function fontStackOf(font: WorkThemeFont): string {
  switch (font) {
    case 'sans':
      return '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
    case 'noto':
      return '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
    case 'misans':
      return '"MiSans", "Segoe UI Variable Text", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
    case 'puhui':
      return '"Alibaba PuHuiTi", "Segoe UI Variable Text", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
    default:
      return '"Segoe UI Variable Text", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif';
  }
}
