import { useEffect } from 'react';
import { dispatchUiCommand } from '../../ai/uiCommandBus';
import { readDshUiState, subscribeDshUiStore } from '../store/dshUiStore';

const SURFACE_SELECTOR = '[data-layout-surface]';

function clearSurfaceStyle(element: HTMLElement): void {
  delete element.dataset.dshSurfaceStyled;
  delete element.dataset.dshSurfaceVariant;
  element.style.removeProperty('--dsh-surface-columns');
  element.style.removeProperty('--dsh-surface-gap');
}

/**
 * Applies only enum/range-validated values as data attributes and CSS custom
 * properties. It never evaluates CSS supplied by a directive.
 */
export function useDshSurfaceRuntime(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId || typeof document === 'undefined') return undefined;
    const replayedLayouts = new WeakMap<HTMLElement, string>();
    const apply = () => {
      const state = readDshUiState(userId);
      const styles = new Map(state.surfaceStyles.map((entry) => [entry.surface, entry.style]));
      const layouts = new Map(state.layouts.map((entry) => [entry.surface, entry.order]));

      document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR).forEach((element) => {
        const surface = element.dataset.layoutSurface ?? '';
        const style = styles.get(surface);
        if (style) {
          element.dataset.dshSurfaceStyled = 'true';
          element.dataset.dshSurfaceVariant = style.variant;
          element.style.setProperty('--dsh-surface-columns', String(style.columns));
          element.style.setProperty('--dsh-surface-gap', `${style.gap}px`);
        } else {
          clearSurfaceStyle(element);
        }

        const order = layouts.get(surface);
        if (!order) return;
        const signature = order.join('\u001f');
        if (replayedLayouts.get(element) === signature) return;
        replayedLayouts.set(element, signature);
        dispatchUiCommand({ kind: 'layout', surface, order });
      });
    };

    apply();
    const unsubscribe = subscribeDshUiStore(userId, apply);
    const observer = new MutationObserver(apply);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      unsubscribe();
      observer.disconnect();
      document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR).forEach(clearSurfaceStyle);
    };
  }, [userId]);
}
