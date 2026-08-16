import { beforeEach, describe, expect, it } from 'vitest';
import { subscribeToUiCommands } from '../../ai/uiCommandBus';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';
import { createMemoryStorage } from '../../../test/memoryStorage';
import { setDshLayout, setDshSurfaceStyle } from '../store/dshUiStore';
import { useDshSurfaceRuntime } from './useDshSurfaceRuntime';

function Probe() {
  useDshSurfaceRuntime('user-a');
  return <div data-layout-surface="projects.detail" />;
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

describe('useDshSurfaceRuntime', () => {
  it('applies finite style tokens and replays the saved order when a surface mounts', async () => {
    setDshSurfaceStyle('user-a', 'projects.detail', { variant: 'contrast', columns: 3, gap: 24 });
    setDshLayout('user-a', 'projects.detail', ['workspace', 'hero']);
    const commands: unknown[] = [];
    const unsubscribe = subscribeToUiCommands((event) => commands.push(event.detail.directive));

    const rendered = renderWithQueryClient(<Probe />);
    await flushAct();
    const surface = rendered.container.querySelector<HTMLElement>('[data-layout-surface]');

    expect(surface?.dataset.dshSurfaceVariant).toBe('contrast');
    expect(surface?.style.getPropertyValue('--dsh-surface-columns')).toBe('3');
    expect(surface?.style.getPropertyValue('--dsh-surface-gap')).toBe('24px');
    expect(commands).toContainEqual({
      kind: 'layout',
      surface: 'projects.detail',
      order: ['workspace', 'hero'],
    });

    unsubscribe();
    rendered.unmount();
  });
});
