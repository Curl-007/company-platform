import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiCommandExecutor } from './useUiCommandExecutor';
import type { AgentUiSubscriptionHandlers, AgentUiDirectivePayload } from '../agentEventSocket';
import { subscribeToUiCommands } from '../uiCommandBus';
import { ToastProvider } from '../../../components/common/Toast';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';
import {
  readWorkThemeSettings,
  saveWorkThemeSettings,
  saveWorkThemeSettingsWithTransition,
} from '../../../theme/workTheme';

// workTheme is mocked so assertions stay on the merged settings objects and
// no real DOM theme side effects leak between cases.
vi.mock('../../../theme/workTheme', () => ({
  readWorkThemeSettings: vi.fn(),
  saveWorkThemeSettings: vi.fn(),
  saveWorkThemeSettingsWithTransition: vi.fn(),
  applyWorkTheme: vi.fn(),
}));

const baseSettings = {
  theme: 'kaneo' as const,
  mode: 'light' as const,
  density: 'standard' as const,
  contrast: 'default' as const,
  reduceMotion: false,
  fontSize: 14,
  fontFamily: 'noto' as const,
  contentPadding: 32,
};

let captured: AgentUiSubscriptionHandlers | null = null;
const onNavigate = vi.fn();

function Probe() {
  useUiCommandExecutor({
    onNavigate,
    subscribe: (handlers) => {
      captured = handlers;
      return () => { captured = null; };
    },
  });
  return null;
}

function renderProbe() {
  return renderWithQueryClient(<ToastProvider><Probe /></ToastProvider>);
}

function pushDirective(payload: unknown): void {
  expect(captured).not.toBeNull();
  captured?.onUiDirective?.(payload as AgentUiDirectivePayload);
}

beforeEach(() => {
  vi.mocked(readWorkThemeSettings).mockReturnValue({ ...baseSettings });
  onNavigate.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useUiCommandExecutor', () => {
  it('applies theme directives through the transition save with merged settings', async () => {
    const { unmount } = renderProbe();
    await flushAct();

    pushDirective({ kind: 'theme', mode: 'dark' });
    await flushAct();

    expect(saveWorkThemeSettingsWithTransition).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveWorkThemeSettingsWithTransition).mock.calls[0]?.[0]).toMatchObject({
      mode: 'dark',
      fontSize: 14,
      fontFamily: 'noto',
    });
    expect(saveWorkThemeSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('applies fontSize directives through the plain save', async () => {
    const { unmount } = renderProbe();
    await flushAct();

    pushDirective({ kind: 'fontSize', value: 17 });
    await flushAct();

    expect(saveWorkThemeSettings).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveWorkThemeSettings).mock.calls[0]?.[0]).toMatchObject({
      fontSize: 17,
      mode: 'light',
      contentPadding: 32,
    });
    expect(saveWorkThemeSettingsWithTransition).not.toHaveBeenCalled();
    // A toast confirms the applied change.
    expect(document.querySelector('.toast')?.textContent).toContain('AI 已调整界面');

    unmount();
  });

  it('ignores unknown kinds and out-of-range values with a console warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = renderProbe();
    await flushAct();

    pushDirective({ kind: 'selfDestruct' });
    pushDirective({ kind: 'fontSize', value: 99 });
    await flushAct();

    expect(saveWorkThemeSettings).not.toHaveBeenCalled();
    expect(saveWorkThemeSettingsWithTransition).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('navigates only for pages inside the pageRegistry whitelist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = renderProbe();
    await flushAct();

    pushDirective({ kind: 'navigate', page: 'projects' });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('projects');

    pushDirective({ kind: 'navigate', page: 'not-a-page' });
    pushDirective({ kind: 'navigate', page: 'login' });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('republishes openAiSidebar directives on the ui command bus', async () => {
    const { unmount } = renderProbe();
    await flushAct();

    const received: Array<{ detail: { directive: unknown } }> = [];
    const unsubscribe = subscribeToUiCommands((event) => received.push(event));
    pushDirective({ kind: 'openAiSidebar', open: true });
    await flushAct();

    expect(received).toHaveLength(1);
    expect(received[0].detail.directive).toEqual({ kind: 'openAiSidebar', open: true });

    unsubscribe();
    unmount();
  });

  it('patches the accent variable family for accentColor directives', async () => {
    const { unmount } = renderProbe();
    await flushAct();

    pushDirective({ kind: 'accentColor', value: '#10B981' });
    await flushAct();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--accent')).toBe('#10b981');
    expect(root.style.getPropertyValue('--accent-bg')).toContain('color-mix');
    expect(root.style.getPropertyValue('--work-accent-rgb')).toBe('16, 185, 129');

    unmount();
  });
});
