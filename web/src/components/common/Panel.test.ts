import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Panel from './Panel';

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

describe('Panel', () => {
  it('keeps panel slots while using the Kaneo surface tokens', async () => {
    await act(async () => {
      root.render(createElement(
        Panel,
        {
          title: '工作区',
          headingLevel: 3,
          subtitle: '共享内容',
          icon: createElement('span', { className: 'panel-icon' }, 'P'),
          toolbar: createElement('button', { type: 'button' }, '操作'),
          footer: '页脚',
          className: 'custom-panel',
          style: { marginTop: 4 },
          noPadding: true,
        },
        createElement('div', { className: 'panel-content' }, '内容'),
      ));
    });

    const panel = container.querySelector<HTMLElement>('.panel');
    const body = container.querySelector<HTMLElement>('.panel-body');

    expect(panel?.getAttribute('data-slot')).toBe('panel');
    expect(panel?.classList.contains('surface-panel')).toBe(true);
    expect(panel?.classList.contains('bg-[var(--card)]')).toBe(true);
    expect(container.querySelector('h3.panel-title')?.textContent).toBe('工作区');
    expect(container.querySelector('.panel-header')?.getAttribute('data-slot')).toBe('panel-header');
    expect(container.querySelector('.panel-body')?.getAttribute('data-slot')).toBe('panel-body');
    expect(body?.style.padding).toBe('0px');
    expect(container.querySelector('.panel-footer')?.textContent).toBe('页脚');
  });
});
