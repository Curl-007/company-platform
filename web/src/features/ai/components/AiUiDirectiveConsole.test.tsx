import { afterEach, describe, expect, it, vi } from 'vitest';
import AiUiDirectiveConsole from './AiUiDirectiveConsole';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNumberValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderConsole() {
  return renderWithQueryClient(<AiUiDirectiveConsole />);
}

function submitButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="submit"]'))[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiUiDirectiveConsole', () => {
  it('POSTs the selected theme directive and reports the delivered count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { delivered: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderConsole();
    await flushAct();

    const kindSelect = container.querySelector<HTMLSelectElement>('select[aria-label="指令类型"]');
    expect(kindSelect).not.toBeNull();
    // 9 whitelisted directive kinds.
    expect(kindSelect?.querySelectorAll('option')).toHaveLength(9);
    setSelectValue(kindSelect!, 'theme');

    submitButton(container)?.click();
    await flushAct();
    await flushAct();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ai/ui-directives');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ directive: { kind: 'theme', mode: 'dark' } }),
    });

    const delivered = container.querySelector('.ai-ui-console-delivered');
    expect(delivered?.textContent).toContain('已送达 1 个在线端');

    unmount();
  });

  it('sends a valid fontSize directive with the numeric parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { delivered: 2 } }));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderConsole();
    await flushAct();

    setSelectValue(container.querySelector<HTMLSelectElement>('select[aria-label="指令类型"]')!, 'fontSize');
    const numberInput = container.querySelector<HTMLInputElement>('input[type="number"]');
    expect(numberInput).not.toBeNull();
    setNumberValue(numberInput!, '16');

    submitButton(container)?.click();
    await flushAct();
    await flushAct();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({
      body: JSON.stringify({ directive: { kind: 'fontSize', value: 16 } }),
    });
    expect(container.querySelector('.ai-ui-console-delivered')?.textContent).toContain('2');

    unmount();
  });

  it('rejects out-of-range parameters client-side without a request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderConsole();
    await flushAct();

    setSelectValue(container.querySelector<HTMLSelectElement>('select[aria-label="指令类型"]')!, 'fontSize');
    setNumberValue(container.querySelector<HTMLInputElement>('input[type="number"]')!, '99');

    submitButton(container)?.click();
    await flushAct();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('.form-error')?.textContent).toContain('指令参数无效');
    expect(warn).toHaveBeenCalled();

    unmount();
  });

  it('offers only whitelisted pages for navigate directives', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { delivered: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderConsole();
    await flushAct();

    setSelectValue(container.querySelector<HTMLSelectElement>('select[aria-label="指令类型"]')!, 'navigate');
    const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
    const pageSelect = selects[selects.length - 1];
    const pages = Array.from(pageSelect.querySelectorAll('option')).map((option) => option.value);
    expect(pages).toContain('dashboard');
    expect(pages).toContain('ai');
    expect(pages).not.toContain('login');

    submitButton(container)?.click();
    await flushAct();
    await flushAct();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({
      body: JSON.stringify({ directive: { kind: 'navigate', page: 'dashboard' } }),
    });

    unmount();
  });
});
