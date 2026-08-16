import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeAgentUiCommands, type AgentUiSubscriptionHandlers } from '../agentEventSocket';
import { parseAgentUiDirective, type AgentUiDirective } from '../models/uiDirectiveModel';
import { dispatchUiCommand } from '../uiCommandBus';
import { useToast } from '../../../components/common/Toast';
import { KNOWN_PAGES } from '../../../app/pageRegistry';
import type { PageKey } from '../../../types';
import {
  openDshView,
  removeDshView,
  setDshLayout,
  setDshSurfaceStyle,
  upsertDshView,
} from '../../dshUi/store/dshUiStore';
import {
  readWorkThemeSettings,
  saveWorkThemeSettings,
  saveWorkThemeSettingsWithTransition,
} from '../../../theme/workTheme';

// ---------------------------------------------------------------------------
// Consumer of the dsh "ui_control" tool: agent.ui directives arriving on the
// realtime channel are translated into work-theme updates, accent color
// overrides, whitelisted navigation and AI sidebar toggles.
//
// Persistence notes (accepted behaviour):
// - theme/fontSize/fontFamily/density/contentPadding/reduceMotion go through
//   saveWorkThemeSettings, so they persist in localStorage like a manual
//   ThemeSettings change; that is desirable (the AI should not fight the
//   user's saved theme on reload).
// - accentColor only patches CSS variables on documentElement for the current
//   session; the next applyWorkTheme run (any theme save) resets them.
// - directives are not queued: anything sent while the socket is down is lost.
// ---------------------------------------------------------------------------

/** Injection point for tests (same pattern as useInvocationTrace). */
export type SubscribeAgentUiCommands = (handlers: AgentUiSubscriptionHandlers) => () => void;

export interface UseUiCommandExecutorOptions {
  /** App-owned navigation with the user permission check already applied. */
  onNavigate: (page: PageKey, focusId?: string) => void;
  /** Defaults to the shared agent event socket singleton. */
  subscribe?: SubscribeAgentUiCommands;
  /** False (logged out) keeps the channel unsubscribed. */
  enabled?: boolean;
  /** Authenticated owner for user-isolated declarative views and surfaces. */
  userId?: string | null;
}

const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function hexToRgbTriplet(value: string): string {
  const red = parseInt(value.slice(1, 3), 16);
  const green = parseInt(value.slice(3, 5), 16);
  const blue = parseInt(value.slice(5, 7), 16);
  return `${red}, ${green}, ${blue}`;
}

function isLightColor(value: string): boolean {
  const red = parseInt(value.slice(1, 3), 16) / 255;
  const green = parseInt(value.slice(3, 5), 16) / 255;
  const blue = parseInt(value.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.6;
}

/**
 * Patches the accent variable family that applyWorkTheme writes (see
 * workTheme.ts): --accent / --accent-hover / --accent-soft / --accent-bg /
 * --accent-contrast plus the legacy rgb triplets.
 */
export function applyAccentColor(value: string): void {
  if (typeof document === 'undefined' || !ACCENT_COLOR_PATTERN.test(value)) return;
  const root = document.documentElement;
  const triplet = hexToRgbTriplet(value);
  root.style.setProperty('--accent', value);
  root.style.setProperty('--accent-hover', `color-mix(in srgb, ${value} 86%, #000000)`);
  root.style.setProperty('--accent-soft', value);
  root.style.setProperty('--accent-bg', `color-mix(in srgb, ${value} 14%, transparent)`);
  root.style.setProperty('--accent-contrast', isLightColor(value) ? '#0a0a0a' : '#ffffff');
  root.style.setProperty('--work-accent-rgb', triplet);
  root.style.setProperty('--work-magenta-rgb', triplet);
}

type Translator = (key: string, options?: Record<string, unknown>) => string;

function describeDirective(directive: AgentUiDirective, t: Translator): string {
  const prefix = 'features.ai.uiCommandExecutor';
  switch (directive.kind) {
    case 'theme':
      return t(`${prefix}.kindTheme`, {
        mode: t(directive.mode === 'dark' ? `${prefix}.modeDark` : `${prefix}.modeLight`),
      });
    case 'fontSize':
      return t(`${prefix}.kindFontSize`, { value: directive.value });
    case 'fontFamily':
      return t(`${prefix}.kindFontFamily`, {
        value: t(`${prefix}.font_${directive.value}`),
      });
    case 'density':
      return t(`${prefix}.kindDensity`, {
        value: t(directive.value === 'compact' ? `${prefix}.densityCompact` : `${prefix}.densityComfortable`),
      });
    case 'accentColor':
      return t(`${prefix}.kindAccentColor`, { value: directive.value });
    case 'contentPadding':
      return t(`${prefix}.kindContentPadding`, { value: directive.value });
    case 'reduceMotion':
      return t(`${prefix}.kindReduceMotion`, {
        value: t(directive.value ? `${prefix}.reduceMotionOn` : `${prefix}.reduceMotionOff`),
      });
    case 'navigate':
      return t(`${prefix}.kindNavigate`, { page: directive.page });
    case 'openAiSidebar':
      return t(`${prefix}.kindOpenAiSidebar`, {
        value: t(directive.open ? `${prefix}.openAiSidebarOpen` : `${prefix}.openAiSidebarClose`),
      });
    case 'layout':
      return t(`${prefix}.kindLayout`, { surface: directive.surface });
    case 'surfaceStyle':
      return t(`${prefix}.kindSurfaceStyle`, { surface: directive.surface });
    case 'viewUpsert':
      return t(`${prefix}.kindViewUpsert`, { title: directive.view.title });
    case 'viewRemove':
      return t(`${prefix}.kindViewRemove`, { viewId: directive.viewId });
    case 'viewOpen':
      return t(`${prefix}.kindViewOpen`, { viewId: directive.viewId });
  }
}

/**
 * Executes one validated UI directive. Returns false when the directive was
 * ignored (already warned by parseAgentUiDirective / the navigate whitelist).
 */
export function useUiCommandExecutor({
  onNavigate,
  subscribe = subscribeAgentUiCommands,
  enabled = true,
  userId,
}: UseUiCommandExecutorOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const executeDirective = useCallback((directive: AgentUiDirective | null): boolean => {
    if (!directive) return false;
    switch (directive.kind) {
      case 'theme':
        // Mode flips get the same View Transition reveal as ThemeSettings.
        saveWorkThemeSettingsWithTransition({ ...readWorkThemeSettings(), mode: directive.mode });
        break;
      case 'fontSize':
        saveWorkThemeSettings({ ...readWorkThemeSettings(), fontSize: directive.value });
        break;
      case 'fontFamily':
        saveWorkThemeSettings({ ...readWorkThemeSettings(), fontFamily: directive.value });
        break;
      case 'density':
        // Wire vocabulary ('comfortable') maps onto workTheme's 'standard'.
        saveWorkThemeSettings({
          ...readWorkThemeSettings(),
          density: directive.value === 'compact' ? 'compact' : 'standard',
        });
        break;
      case 'contentPadding':
        saveWorkThemeSettings({ ...readWorkThemeSettings(), contentPadding: directive.value });
        break;
      case 'reduceMotion':
        saveWorkThemeSettings({ ...readWorkThemeSettings(), reduceMotion: directive.value });
        break;
      case 'accentColor':
        applyAccentColor(directive.value);
        break;
      case 'navigate': {
        // pageRegistry whitelist only; 'login' renders nothing and is excluded.
        if (directive.page === 'login' || !KNOWN_PAGES.includes(directive.page as PageKey)) {
          console.warn('[uiCommandExecutor] navigate directive ignored: page not in KNOWN_PAGES', directive.page);
          return false;
        }
        if (directive.focus) onNavigateRef.current(directive.page as PageKey, directive.focus);
        else onNavigateRef.current(directive.page as PageKey);
        break;
      }
      case 'openAiSidebar':
        // Layout owns the sidebar state and reacts through the bus.
        dispatchUiCommand(directive);
        break;
      case 'layout':
        if (!userId || !setDshLayout(userId, directive.surface, directive.order)) {
          console.warn('[uiCommandExecutor] layout directive could not be persisted', directive.surface);
          return false;
        }
        // SortableSectionLayout consumes this bus; manual moves sync the store.
        dispatchUiCommand(directive);
        break;
      case 'surfaceStyle':
        if (!userId || !setDshSurfaceStyle(userId, directive.surface, directive.style)) {
          console.warn('[uiCommandExecutor] surfaceStyle directive could not be persisted', directive.surface);
          return false;
        }
        // Consumers outside the generic runtime may also react immediately.
        dispatchUiCommand(directive);
        break;
      case 'viewUpsert':
        if (!userId || !upsertDshView(userId, directive.view)) {
          console.warn('[uiCommandExecutor] viewUpsert directive could not be persisted', directive.view.id);
          return false;
        }
        break;
      case 'viewRemove':
        if (!userId || !removeDshView(userId, directive.viewId)) {
          console.warn('[uiCommandExecutor] viewRemove directive could not be applied', directive.viewId);
          return false;
        }
        break;
      case 'viewOpen':
        if (!userId || !openDshView(userId, directive.viewId)) {
          console.warn('[uiCommandExecutor] viewOpen directive ignored: unknown view', directive.viewId);
          return false;
        }
        onNavigateRef.current('dsh-ui');
        break;
      default:
        return false;
    }
    toast.success(t('features.ai.uiCommandExecutor.applied', {
      detail: describeDirective(directive, t),
    }));
    return true;
  }, [t, toast, userId]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribe({
      onUiDirective: (payload) => {
        executeDirective(parseAgentUiDirective(payload));
      },
    });
  }, [enabled, executeDirective, subscribe]);

  return { executeDirective };
}
