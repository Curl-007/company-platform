// ---------------------------------------------------------------------------
// AI UI directive contract (agent.ui wire payloads + /api/ai/ui-directives).
//
// The server only forwards whitelisted directives; this module re-validates on
// the client so an unknown kind or an out-of-range value degrades to a
// console.warn and never throws inside the realtime consumer.
// ---------------------------------------------------------------------------

export type UiDirectiveThemeMode = 'dark' | 'light';
export type UiDirectiveFontFamily = 'system' | 'sans' | 'noto' | 'misans' | 'puhui';
/** Wire density vocabulary; workTheme stores 'comfortable' as 'standard'. */
export type UiDirectiveDensity = 'compact' | 'comfortable';

export type AgentUiDirective =
  | { kind: 'theme'; mode: UiDirectiveThemeMode }
  | { kind: 'fontSize'; value: number }
  | { kind: 'fontFamily'; value: UiDirectiveFontFamily }
  | { kind: 'density'; value: UiDirectiveDensity }
  | { kind: 'accentColor'; value: string }
  | { kind: 'contentPadding'; value: number }
  | { kind: 'reduceMotion'; value: boolean }
  | { kind: 'navigate'; page: string }
  | { kind: 'openAiSidebar'; open: boolean };

export type UiDirectiveKind = AgentUiDirective['kind'];

export const UI_DIRECTIVE_KINDS: UiDirectiveKind[] = [
  'theme',
  'fontSize',
  'fontFamily',
  'density',
  'accentColor',
  'contentPadding',
  'reduceMotion',
  'navigate',
  'openAiSidebar',
];

export const UI_THEME_MODE_VALUES: UiDirectiveThemeMode[] = ['dark', 'light'];
export const UI_FONT_FAMILY_VALUES: UiDirectiveFontFamily[] = ['system', 'sans', 'noto', 'misans', 'puhui'];
export const UI_DENSITY_VALUES: UiDirectiveDensity[] = ['compact', 'comfortable'];
export const UI_FONT_SIZE_MIN = 13;
export const UI_FONT_SIZE_MAX = 18;
export const UI_CONTENT_PADDING_MIN = 0;
export const UI_CONTENT_PADDING_MAX = 240;
const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function warnIgnored(reason: string, value: unknown): void {
  // Silent for the UI: an invalid directive must never break the stream.
  console.warn(`[agentUiDirective] ignored directive (${reason})`, value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Whitelist + range validation for one wire directive payload. */
export function parseAgentUiDirective(value: unknown): AgentUiDirective | null {
  if (!isRecord(value)) {
    warnIgnored('not an object', value);
    return null;
  }
  switch (value.kind) {
    case 'theme':
      if (value.mode === 'dark' || value.mode === 'light') return { kind: 'theme', mode: value.mode };
      warnIgnored('invalid theme mode', value.mode);
      return null;
    case 'fontSize':
      if (isIntegerInRange(value.value, UI_FONT_SIZE_MIN, UI_FONT_SIZE_MAX)) {
        return { kind: 'fontSize', value: value.value };
      }
      warnIgnored(`fontSize must be ${UI_FONT_SIZE_MIN}-${UI_FONT_SIZE_MAX}`, value.value);
      return null;
    case 'fontFamily':
      if (UI_FONT_FAMILY_VALUES.includes(value.value as UiDirectiveFontFamily)) {
        return { kind: 'fontFamily', value: value.value as UiDirectiveFontFamily };
      }
      warnIgnored('unknown fontFamily', value.value);
      return null;
    case 'density':
      if (value.value === 'compact' || value.value === 'comfortable') {
        return { kind: 'density', value: value.value };
      }
      warnIgnored('invalid density', value.value);
      return null;
    case 'accentColor':
      if (typeof value.value === 'string' && ACCENT_COLOR_PATTERN.test(value.value)) {
        return { kind: 'accentColor', value: value.value.toLowerCase() };
      }
      warnIgnored('accentColor must be #rrggbb', value.value);
      return null;
    case 'contentPadding':
      if (isIntegerInRange(value.value, UI_CONTENT_PADDING_MIN, UI_CONTENT_PADDING_MAX)) {
        return { kind: 'contentPadding', value: value.value };
      }
      warnIgnored(`contentPadding must be ${UI_CONTENT_PADDING_MIN}-${UI_CONTENT_PADDING_MAX}`, value.value);
      return null;
    case 'reduceMotion':
      if (typeof value.value === 'boolean') return { kind: 'reduceMotion', value: value.value };
      warnIgnored('reduceMotion must be boolean', value.value);
      return null;
    case 'navigate':
      if (typeof value.page === 'string' && value.page.trim()) {
        return { kind: 'navigate', page: value.page.trim() };
      }
      warnIgnored('navigate requires a page', value);
      return null;
    case 'openAiSidebar':
      if (typeof value.open === 'boolean') return { kind: 'openAiSidebar', open: value.open };
      warnIgnored('openAiSidebar requires a boolean', value);
      return null;
    default:
      warnIgnored('unknown kind', value.kind);
      return null;
  }
}
