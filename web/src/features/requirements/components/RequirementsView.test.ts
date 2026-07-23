import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RequirementCompletionCell } from './RequirementsView';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe('RequirementCompletionCell', () => {
  it.each([0, 100])('renders %i%% once and lets the bar fill the remaining width', async (completion) => {
    await act(async () => {
      root.render(createElement(RequirementCompletionCell, { completion }));
    });

    expect(container.textContent).toBe(`${completion}%`);
    expect(container.querySelector('.progress-bar-label')).toBeNull();
    const barLayout = container.querySelector<HTMLElement>('.requirement-completion-bar');
    expect(barLayout?.style.flexGrow).toBe('1');
    expect(Number.parseFloat(barLayout?.style.minWidth ?? 'NaN')).toBe(0);

    const progressbar = container.querySelector<HTMLElement>('[role="progressbar"]');
    expect(progressbar?.getAttribute('aria-valuenow')).toBe(String(completion));
    expect(progressbar?.style.width).toBe(`${completion}%`);
  });
});
