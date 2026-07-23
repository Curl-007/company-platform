export type WorkThemeId = 'aurora' | 'cyber' | 'sunset' | 'forest' | 'scholar';
export type WorkThemeMode = 'dark' | 'light';
export type WorkThemeDensity = 'standard' | 'compact';
export type WorkThemeContrast = 'default' | 'high';
export type WorkThemeFont = 'system' | 'sans' | 'noto' | 'misans' | 'puhui';
export type WorkThemeNavLayout = 'expanded' | 'mini' | 'horizontal';

export interface WorkThemeSettings {
  theme: WorkThemeId;
  mode: WorkThemeMode;
  density: WorkThemeDensity;
  contrast: WorkThemeContrast;
  reduceMotion: boolean;
  ambient: boolean;
  fontSize: number;
  fontFamily: WorkThemeFont;
  navLayout: WorkThemeNavLayout;
  radius: number;
  glassBlur: number;
  contentPadding: number;
}

export interface WorkThemePreset {
  id: WorkThemeId;
  label: string;
  blurb: string;
  preview: {
    dark: { bg: string; gradient: [string, string, string] };
    light: { bg: string; gradient: [string, string, string] };
  };
  signature: {
    gradient: [string, string, string];
    accentRgb: string;
    magentaRgb: string;
    amberRgb: string;
    holoForeground: string;
    radius: number;
    glassBlur: number;
  };
  dark: {
    page: string;
    content: string;
    sidebar: string;
    topbar: string;
    border: string;
    borderStrong: string;
    text: string;
    secondary: string;
    tertiary: string;
    accent: string;
    accentHover: string;
    accentRgb: string;
  };
  light: {
    page: string;
    content: string;
    sidebar: string;
    topbar: string;
    border: string;
    borderStrong: string;
    text: string;
    secondary: string;
    tertiary: string;
    accent: string;
    accentHover: string;
    accentRgb: string;
  };
}

export const WORK_THEME_STORAGE_KEY = 'work-glass-theme-settings';

export const defaultWorkThemeSettings: WorkThemeSettings = {
  theme: 'scholar',
  mode: 'light',
  density: 'standard',
  contrast: 'default',
  reduceMotion: false,
  ambient: false,
  fontSize: 15,
  fontFamily: 'system',
  navLayout: 'expanded',
  radius: 6,
  glassBlur: 0,
  contentPadding: 24,
};

export const WORK_THEMES: WorkThemePreset[] = [
  {
    id: 'aurora',
    label: '极光全息',
    blurb: '冷·玻璃·全息',
    preview: {
      dark: { bg: '#0a0a0f', gradient: ['#00d4ff', '#ff2d92', '#ffb347'] },
      light: { bg: '#eef1f6', gradient: ['#00d4ff', '#ff2d92', '#ffb347'] },
    },
    signature: {
      gradient: ['#00d4ff', '#ff2d92', '#ffb347'],
      accentRgb: '0, 212, 255',
      magentaRgb: '255, 45, 146',
      amberRgb: '255, 179, 71',
      holoForeground: '#0a0a0f',
      radius: 14,
      glassBlur: 24,
    },
    dark: {
      page: '#0a0a0f',
      content: 'rgba(255, 255, 255, 0.07)',
      sidebar: 'rgba(10, 10, 15, 0.60)',
      topbar: 'rgba(10, 10, 15, 0.50)',
      border: 'rgba(255, 255, 255, 0.08)',
      borderStrong: 'rgba(255, 255, 255, 0.15)',
      text: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.72)',
      tertiary: 'rgba(255, 255, 255, 0.50)',
      accent: '#00d4ff',
      accentHover: '#ff2d92',
      accentRgb: '0, 212, 255',
    },
    light: {
      page: '#eef1f6',
      content: 'rgba(255, 255, 255, 0.72)',
      sidebar: 'rgba(255, 255, 255, 0.78)',
      topbar: 'rgba(255, 255, 255, 0.72)',
      border: 'rgba(20, 24, 40, 0.10)',
      borderStrong: 'rgba(20, 24, 40, 0.18)',
      text: '#10131c',
      secondary: 'rgba(16, 19, 28, 0.72)',
      tertiary: 'rgba(16, 19, 28, 0.55)',
      accent: '#00d4ff',
      accentHover: '#ff2d92',
      accentRgb: '0, 212, 255',
    },
  },
  {
    id: 'cyber',
    label: '赛博霓虹',
    blurb: '霓虹·OLED·强发光',
    preview: {
      dark: { bg: '#000000', gradient: ['#a855f7', '#ec4899', '#38bdf8'] },
      light: { bg: '#f4f4f7', gradient: ['#a855f7', '#ec4899', '#38bdf8'] },
    },
    signature: {
      gradient: ['#a855f7', '#ec4899', '#38bdf8'],
      accentRgb: '168, 85, 247',
      magentaRgb: '236, 72, 153',
      amberRgb: '56, 189, 248',
      holoForeground: '#0a0a0f',
      radius: 8,
      glassBlur: 26,
    },
    dark: {
      page: '#000000',
      content: 'rgba(255, 255, 255, 0.07)',
      sidebar: 'rgba(0, 0, 0, 0.60)',
      topbar: 'rgba(0, 0, 0, 0.55)',
      border: 'rgba(180, 120, 255, 0.12)',
      borderStrong: 'rgba(180, 120, 255, 0.20)',
      text: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.72)',
      tertiary: 'rgba(255, 255, 255, 0.50)',
      accent: '#a855f7',
      accentHover: '#ec4899',
      accentRgb: '168, 85, 247',
    },
    light: {
      page: '#f4f4f7',
      content: 'rgba(255, 255, 255, 0.74)',
      sidebar: 'rgba(255, 255, 255, 0.80)',
      topbar: 'rgba(255, 255, 255, 0.74)',
      border: 'rgba(120, 60, 200, 0.12)',
      borderStrong: 'rgba(120, 60, 200, 0.20)',
      text: '#15121d',
      secondary: 'rgba(21, 18, 29, 0.72)',
      tertiary: 'rgba(21, 18, 29, 0.55)',
      accent: '#a855f7',
      accentHover: '#ec4899',
      accentRgb: '168, 85, 247',
    },
  },
  {
    id: 'sunset',
    label: '暖阳极简',
    blurb: '暖·扁平·柔影',
    preview: {
      dark: { bg: '#1a1714', gradient: ['#ff8a4c', '#ff5d8f', '#ffb347'] },
      light: { bg: '#faf6f0', gradient: ['#ff8a4c', '#ff5d8f', '#ffb347'] },
    },
    signature: {
      gradient: ['#ff8a4c', '#ff5d8f', '#ffb347'],
      accentRgb: '255, 138, 76',
      magentaRgb: '255, 93, 143',
      amberRgb: '255, 179, 71',
      holoForeground: '#2a1206',
      radius: 18,
      glassBlur: 0,
    },
    dark: {
      page: '#1a1714',
      content: '#221c17',
      sidebar: '#1a1714',
      topbar: '#1a1714',
      border: 'rgba(255, 235, 220, 0.10)',
      borderStrong: 'rgba(255, 235, 220, 0.18)',
      text: '#fbf4ee',
      secondary: 'rgba(251, 244, 238, 0.72)',
      tertiary: 'rgba(251, 244, 238, 0.50)',
      accent: '#ff8a4c',
      accentHover: '#ff5d8f',
      accentRgb: '255, 138, 76',
    },
    light: {
      page: '#faf6f0',
      content: '#ffffff',
      sidebar: '#fffdf9',
      topbar: '#fffdf9',
      border: 'rgba(60, 40, 25, 0.10)',
      borderStrong: 'rgba(60, 40, 25, 0.18)',
      text: '#2a1d12',
      secondary: 'rgba(42, 29, 18, 0.72)',
      tertiary: 'rgba(42, 29, 18, 0.55)',
      accent: '#ff8a4c',
      accentHover: '#ff5d8f',
      accentRgb: '255, 138, 76',
    },
  },
  {
    id: 'forest',
    label: '森林自然',
    blurb: '绿·柔和·有机',
    preview: {
      dark: { bg: '#0b1410', gradient: ['#10b981', '#14b8a6', '#84cc16'] },
      light: { bg: '#eef3ee', gradient: ['#10b981', '#14b8a6', '#84cc16'] },
    },
    signature: {
      gradient: ['#10b981', '#14b8a6', '#84cc16'],
      accentRgb: '16, 185, 129',
      magentaRgb: '20, 184, 166',
      amberRgb: '132, 204, 22',
      holoForeground: '#04140d',
      radius: 14,
      glassBlur: 18,
    },
    dark: {
      page: '#0b1410',
      content: 'rgba(220, 255, 235, 0.07)',
      sidebar: 'rgba(8, 18, 12, 0.60)',
      topbar: 'rgba(8, 18, 12, 0.55)',
      border: 'rgba(120, 220, 170, 0.10)',
      borderStrong: 'rgba(120, 220, 170, 0.18)',
      text: '#eafff4',
      secondary: 'rgba(234, 255, 244, 0.72)',
      tertiary: 'rgba(234, 255, 244, 0.50)',
      accent: '#10b981',
      accentHover: '#14b8a6',
      accentRgb: '16, 185, 129',
    },
    light: {
      page: '#eef3ee',
      content: 'rgba(255, 255, 255, 0.74)',
      sidebar: 'rgba(255, 255, 255, 0.80)',
      topbar: 'rgba(255, 255, 255, 0.74)',
      border: 'rgba(16, 40, 28, 0.10)',
      borderStrong: 'rgba(16, 40, 28, 0.18)',
      text: '#0e1f16',
      secondary: 'rgba(14, 31, 22, 0.72)',
      tertiary: 'rgba(14, 31, 22, 0.55)',
      accent: '#10b981',
      accentHover: '#14b8a6',
      accentRgb: '16, 185, 129',
    },
  },
  {
    id: 'scholar',
    label: '专业工作台',
    blurb: '中性·清晰·高密度',
    preview: {
      dark: { bg: '#17201e', gradient: ['#2f9b7d', '#4f7db8', '#c18a3b'] },
      light: { bg: '#f4f6f4', gradient: ['#176b57', '#2f6fad', '#b77722'] },
    },
    signature: {
      gradient: ['#176b57', '#2f6fad', '#b77722'],
      accentRgb: '23, 107, 87',
      magentaRgb: '47, 111, 173',
      amberRgb: '183, 119, 34',
      holoForeground: '#ffffff',
      radius: 6,
      glassBlur: 0,
    },
    dark: {
      page: '#151b1a',
      content: '#1d2523',
      sidebar: '#18201f',
      topbar: '#1d2523',
      border: 'rgba(229, 236, 232, 0.11)',
      borderStrong: 'rgba(229, 236, 232, 0.20)',
      text: '#edf2ef',
      secondary: 'rgba(237, 242, 239, 0.72)',
      tertiary: 'rgba(237, 242, 239, 0.52)',
      accent: '#4ab394',
      accentHover: '#62c3a7',
      accentRgb: '74, 179, 148',
    },
    light: {
      page: '#eef2ef',
      content: '#ffffff',
      sidebar: '#f7f9f7',
      topbar: '#ffffff',
      border: '#d6ddd8',
      borderStrong: '#bdc9c1',
      text: '#15201c',
      secondary: '#4c5d56',
      tertiary: '#72817b',
      accent: '#15654f',
      accentHover: '#0f4f3e',
      accentRgb: '21, 101, 79',
    },
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
  if (typeof window === 'undefined') return defaultWorkThemeSettings;
  try {
    const raw = window.localStorage.getItem(WORK_THEME_STORAGE_KEY);
    if (!raw) return defaultWorkThemeSettings;
    const parsed = JSON.parse(raw);
    if (isLegacyScholarDefault(parsed)) return defaultWorkThemeSettings;
    return normalizeSettings(parsed);
  } catch {
    return defaultWorkThemeSettings;
  }
}

function isLegacyScholarDefault(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<WorkThemeSettings>;
  return input.theme === 'scholar'
    && input.mode === 'light'
    && input.density === 'compact'
    && input.contrast === 'default'
    && input.reduceMotion === false
    && input.ambient === false
    && input.fontSize === 14
    && input.fontFamily === 'system'
    && input.navLayout === 'expanded'
    && input.radius === 6
    && input.glassBlur === 0
    && input.contentPadding === 20;
}

export function saveWorkThemeSettings(settings: WorkThemeSettings): WorkThemeSettings {
  const next = normalizeSettings(settings);
  try {
    window.localStorage.setItem(WORK_THEME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be disabled; the active document should still update.
  }
  applyWorkTheme(next);
  return next;
}

export function resetWorkThemeSettings(): WorkThemeSettings {
  try {
    window.localStorage.removeItem(WORK_THEME_STORAGE_KEY);
  } catch {
    // Keep reset functional even when persistent storage is unavailable.
  }
  applyWorkTheme(defaultWorkThemeSettings);
  return defaultWorkThemeSettings;
}

export function applyWorkTheme(settings: WorkThemeSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const normalized = normalizeSettings(settings);
  const preset = WORK_THEMES.find((item) => item.id === normalized.theme) ?? WORK_THEMES[0];
  const colors = preset[normalized.mode];
  const radiusValue = preset.signature.radius;
  const blurValue = preset.signature.glassBlur;
  const radius = `${radiusValue}px`;
  const fontStack = fontStackOf(normalized.fontFamily);
  const [gradientStart, gradientMiddle, gradientEnd] = preset.signature.gradient;
  const highContrast = normalized.contrast === 'high';
  const secondaryText = highContrast
    ? `color-mix(in srgb, ${colors.text} 88%, transparent)`
    : colors.secondary;
  const tertiaryText = highContrast
    ? `color-mix(in srgb, ${colors.text} 72%, transparent)`
    : colors.tertiary;
  const border = highContrast
    ? `color-mix(in srgb, ${colors.text} ${normalized.mode === 'dark' ? '34%' : '28%'}, transparent)`
    : colors.border;
  const borderStrong = highContrast
    ? `color-mix(in srgb, ${colors.text} ${normalized.mode === 'dark' ? '48%' : '40%'}, transparent)`
    : colors.borderStrong;

  root.setAttribute('data-theme', normalized.theme);
  root.setAttribute('data-mode', normalized.mode);
  root.setAttribute('data-reduce-motion', String(normalized.reduceMotion));
  root.setAttribute('data-ambient', normalized.ambient ? 'on' : 'off');
  root.setAttribute('data-work-theme', normalized.theme);
  root.setAttribute('data-work-mode', normalized.mode);
  root.setAttribute('data-work-density', normalized.density);
  root.setAttribute('data-work-contrast', normalized.contrast);
  root.setAttribute('data-work-motion', normalized.reduceMotion ? 'reduced' : 'standard');
  root.setAttribute('data-work-ambient', normalized.ambient ? 'on' : 'off');
  root.setAttribute('data-work-font', normalized.fontFamily);
  root.setAttribute('data-work-nav-layout', normalized.navLayout);
  root.style.fontSize = `${normalized.fontSize}px`;
  root.style.setProperty('--fs-display', `${normalized.fontSize + 10}px`);
  root.style.setProperty('--fs-page-title', `${normalized.fontSize + 7}px`);
  root.style.setProperty('--fs-section-title', `${normalized.fontSize + 2}px`);
  root.style.setProperty('--fs-body', `${normalized.fontSize}px`);
  root.style.setProperty('--fs-helper', `${Math.max(12, normalized.fontSize - 2)}px`);
  root.style.setProperty('--fs-table-body', `${Math.max(12, normalized.fontSize - 1)}px`);
  root.style.setProperty('--fs-kpi-value', `${normalized.fontSize + 13}px`);
  root.style.setProperty('--content-padding', `${normalized.contentPadding}px`);
  root.style.setProperty('--content-gutter', `${normalized.contentPadding}px`);
  root.style.setProperty('--work-glass-blur', `${blurValue}px`);
  root.style.setProperty('--work-accent-rgb', preset.signature.accentRgb);
  root.style.setProperty('--work-magenta-rgb', preset.signature.magentaRgb);
  root.style.setProperty('--work-amber-rgb', preset.signature.amberRgb);
  root.style.setProperty('--work-emerald-rgb', normalized.theme === 'forest' ? preset.signature.accentRgb : '0, 255, 148');
  root.style.setProperty('--bg-page', colors.page);
  root.style.setProperty('--bg-content', colors.content);
  root.style.setProperty('--bg-sidebar', colors.sidebar);
  root.style.setProperty('--bg-topbar', colors.topbar);
  root.style.setProperty('--bg-sidebar-hover', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(20, 24, 40, 0.06)');
  root.style.setProperty('--bg-sidebar-active', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(20, 24, 40, 0.10)');
  root.style.setProperty('--bg-sidebar-text', highContrast ? secondaryText : normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.60)' : 'rgba(16, 19, 28, 0.62)');
  root.style.setProperty('--bg-sidebar-text-active', colors.text);
  root.style.setProperty('--bg-primary', colors.content);
  root.style.setProperty('--bg-secondary', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(20, 24, 40, 0.04)');
  root.style.setProperty('--bg-default', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(20, 24, 40, 0.04)');
  root.style.setProperty('--bg-hover', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(20, 24, 40, 0.08)');
  root.style.setProperty('--bg-active', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(20, 24, 40, 0.12)');
  root.style.setProperty('--bg-subtle', normalized.mode === 'dark' ? 'rgba(255, 255, 255, 0.055)' : 'rgba(20, 24, 40, 0.045)');
  root.style.setProperty('--text-primary', colors.text);
  root.style.setProperty('--text-secondary', secondaryText);
  root.style.setProperty('--text-tertiary', tertiaryText);
  root.style.setProperty('--text-inverse', preset.signature.holoForeground);
  root.style.setProperty('--border-default', border);
  root.style.setProperty('--border-divider', border);
  root.style.setProperty('--border-sidebar', border);
  root.style.setProperty('--border-light', border);
  root.style.setProperty('--border-strong', borderStrong);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-hover', colors.accentHover);
  root.style.setProperty('--accent-soft', `rgba(${preset.signature.accentRgb}, 0.14)`);
  root.style.setProperty('--accent-bg', `rgba(${preset.signature.accentRgb}, 0.13)`);
  root.style.setProperty('--accent-contrast', preset.signature.holoForeground);
  root.style.setProperty('--gradient-holographic', `linear-gradient(135deg, ${gradientStart}, ${gradientMiddle}, ${gradientEnd})`);
  root.style.setProperty('--gradient-holographic-hover', `linear-gradient(135deg, ${lightenHex(gradientStart, 0.12)}, ${lightenHex(gradientMiddle, 0.12)}, ${lightenHex(gradientEnd, 0.12)})`);
  root.style.setProperty('--font-cn', fontStack);
  root.style.setProperty('--font-en', fontStack);
  root.style.setProperty('--radius-sm', radius);
  root.style.setProperty('--radius-card', radius);
  root.style.setProperty('--radius-button', radius);
  root.style.setProperty('--radius-input', radius);
  root.style.setProperty('--radius-modal', `${Math.max(radiusValue, 10)}px`);
}

function normalizeSettings(value: unknown): WorkThemeSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<WorkThemeSettings>;
  const theme = WORK_THEMES.some((item) => item.id === input.theme) ? input.theme! : defaultWorkThemeSettings.theme;
  const mode = input.mode === 'light' || input.mode === 'dark' ? input.mode : defaultWorkThemeSettings.mode;
  const density = input.density === 'compact' || input.density === 'standard' ? input.density : defaultWorkThemeSettings.density;
  const contrast = input.contrast === 'high' || input.contrast === 'default' ? input.contrast : defaultWorkThemeSettings.contrast;
  const fontFamily = isWorkFont(input.fontFamily) ? input.fontFamily : defaultWorkThemeSettings.fontFamily;
  const navLayout = isWorkNavLayout(input.navLayout) ? input.navLayout : defaultWorkThemeSettings.navLayout;

  return {
    theme,
    mode,
    density,
    contrast,
    reduceMotion: typeof input.reduceMotion === 'boolean' ? input.reduceMotion : defaultWorkThemeSettings.reduceMotion,
    ambient: typeof input.ambient === 'boolean' ? input.ambient : defaultWorkThemeSettings.ambient,
    fontSize: clampNumber(input.fontSize, 13, 18, defaultWorkThemeSettings.fontSize),
    fontFamily,
    navLayout,
    radius: clampNumber(input.radius, 4, 18, defaultWorkThemeSettings.radius),
    glassBlur: clampNumber(input.glassBlur, 0, 36, defaultWorkThemeSettings.glassBlur),
    contentPadding: clampNumber(input.contentPadding, 0, 240, defaultWorkThemeSettings.contentPadding),
  };
}

function isWorkFont(value: unknown): value is WorkThemeFont {
  return value === 'system' || value === 'sans' || value === 'noto' || value === 'misans' || value === 'puhui';
}

function isWorkNavLayout(value: unknown): value is WorkThemeNavLayout {
  return value === 'expanded' || value === 'mini' || value === 'horizontal';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function lightenHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const channels = [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16));
  if (channels.some((channel) => Number.isNaN(channel))) return hex;
  const next = channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');
  return `#${next}`;
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
