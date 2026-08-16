import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithQueryClient } from '../../test/renderWithQuery';
import { createMemoryStorage } from '../../test/memoryStorage';
import { UI_COMMAND_EVENT } from '../../features/ai/uiCommandBus';
import { readDshUiState } from '../../features/dshUi/store/dshUiStore';
import SortableSectionLayout, {
  detailLayoutStorageKey,
  reconcileSectionOrder,
} from './SortableSectionLayout';

const sections = [
  { id: 'summary', label: '摘要', content: <section>summary</section> },
  { id: 'activity', label: '动态', content: <section>activity</section> },
  { id: 'notes', label: '备注', content: <section>notes</section> },
];

function renderedOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-layout-section-id]'))
    .map((element) => element.dataset.layoutSectionId ?? '');
}

function renderLayout(userId = 'USR-A', surface = 'projects.detail') {
  return renderWithQueryClient(
    <SortableSectionLayout surface={surface} userId={userId} sections={sections} />,
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('SortableSectionLayout', () => {
  it('reconciles persisted or DSH orders without accepting unknown and duplicate IDs', () => {
    expect(reconcileSectionOrder(
      ['notes', 'unknown', 'notes', '', 'summary'],
      ['summary', 'activity', 'notes', 'activity'],
    )).toEqual(['notes', 'summary', 'activity']);
  });

  it('moves a focused section with the keyboard, persists it, and resets to the declared order', () => {
    const rendered = renderLayout();
    const edit = rendered.container.querySelector<HTMLButtonElement>('.sortable-section-edit');
    expect(edit?.getAttribute('aria-pressed')).toBe('false');
    act(() => { edit?.click(); });
    expect(edit?.getAttribute('aria-pressed')).toBe('true');
    const handle = rendered.container.querySelector<HTMLButtonElement>(
      '[data-layout-section-id="summary"] .sortable-section-handle',
    );
    expect(handle).not.toBeNull();

    act(() => {
      handle?.focus();
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(renderedOrder(rendered.container)).toEqual(['activity', 'summary', 'notes']);
    expect(document.activeElement).toBe(handle);
    expect(rendered.container.querySelector('[aria-live="polite"]')?.textContent).toContain('第2位');
    expect(JSON.parse(window.localStorage.getItem(detailLayoutStorageKey('projects.detail', 'USR-A')!) ?? '[]'))
      .toEqual(['activity', 'summary', 'notes']);
    expect(readDshUiState('USR-A').layouts).toEqual([{
      surface: 'projects.detail',
      order: ['activity', 'summary', 'notes'],
    }]);

    const reset = rendered.container.querySelector<HTMLButtonElement>('.sortable-section-reset');
    expect(reset?.disabled).toBe(false);
    act(() => { reset?.click(); });
    expect(renderedOrder(rendered.container)).toEqual(['summary', 'activity', 'notes']);
    expect(reset?.disabled).toBe(true);
    rendered.unmount();
  });

  it('restores an order only for the matching user and surface', () => {
    const key = detailLayoutStorageKey('documents.detail', 'USR-A');
    window.localStorage.setItem(key!, JSON.stringify(['notes', 'summary']));

    const userA = renderLayout('USR-A', 'documents.detail');
    expect(renderedOrder(userA.container)).toEqual(['notes', 'summary', 'activity']);
    userA.unmount();

    const userB = renderLayout('USR-B', 'documents.detail');
    expect(renderedOrder(userB.container)).toEqual(['summary', 'activity', 'notes']);
    userB.unmount();

    const otherSurface = renderLayout('USR-A', 'requirements.detail');
    expect(renderedOrder(otherSurface.container)).toEqual(['summary', 'activity', 'notes']);
    otherSurface.unmount();
  });

  it('applies a validated layout directive from the shared UI command bus', () => {
    const rendered = renderLayout();
    act(() => {
      window.dispatchEvent(new CustomEvent(UI_COMMAND_EVENT, {
        detail: {
          directive: {
            kind: 'layout',
            surface: 'projects.detail',
            order: ['notes', 'unknown', 'notes', 'summary'],
          },
        },
      }));
    });

    expect(renderedOrder(rendered.container)).toEqual(['notes', 'summary', 'activity']);
    expect(JSON.parse(window.localStorage.getItem(detailLayoutStorageKey('projects.detail', 'USR-A')!) ?? '[]'))
      .toEqual(['notes', 'summary', 'activity']);

    act(() => {
      window.dispatchEvent(new CustomEvent(UI_COMMAND_EVENT, {
        detail: { directive: { kind: 'layout', surface: 'other.detail', order: ['activity'] } },
      }));
    });
    expect(renderedOrder(rendered.container)).toEqual(['notes', 'summary', 'activity']);
    rendered.unmount();
  });

  it('drops duplicate or empty section declarations before rendering controls', () => {
    const rendered = renderWithQueryClient(
      <SortableSectionLayout
        surface="projects.detail"
        userId="USR-A"
        sections={[
          sections[0],
          { ...sections[0], content: <section>duplicate</section> },
          { id: ' ', label: 'empty', content: <section>empty</section> },
          sections[1],
        ]}
      />,
    );
    expect(renderedOrder(rendered.container)).toEqual(['summary', 'activity']);
    expect(rendered.container.querySelectorAll('.sortable-section-handle')).toHaveLength(0);
    act(() => { rendered.container.querySelector<HTMLButtonElement>('.sortable-section-edit')?.click(); });
    expect(rendered.container.querySelectorAll('.sortable-section-handle')).toHaveLength(2);
    rendered.unmount();
  });
});
