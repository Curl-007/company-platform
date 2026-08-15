import { afterEach, describe, expect, it, vi } from 'vitest';
import AiMaskingAdmin from './AiMaskingAdmin';
import { ConfirmProvider } from '../../../components/common/ConfirmDialog';
import { ToastProvider } from '../../../components/common/Toast';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Frozen GET /api/ai/masking/rules contract sample. */
function rulesPayload() {
  return {
    data: {
      items: [
        {
          id: 'AMR-1',
          name: '身份证号脱敏',
          mode: 'replace',
          pattern: '\\d{17}[0-9X]',
          replacement: '[已脱敏]',
          isRegex: true,
          caseSensitive: false,
          enabled: true,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
        {
          id: 'AMR-2',
          name: '内部报价拦截',
          mode: 'block',
          pattern: '内部报价',
          replacement: null,
          isRegex: false,
          caseSensitive: true,
          enabled: false,
          createdAt: null,
          updatedAt: null,
        },
      ],
    },
  };
}

function patchedRule(overrides: Record<string, unknown>) {
  return {
    data: {
      item: {
        id: 'AMR-1',
        name: '身份证号脱敏',
        mode: 'replace',
        pattern: '\\d{17}[0-9X]',
        replacement: '[已脱敏]',
        isRegex: true,
        caseSensitive: false,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
        ...overrides,
      },
    },
  };
}

function rulesFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn((input: unknown, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url === '/api/ai/masking/rules') return Promise.resolve(jsonResponse(rulesPayload()));
    return Promise.resolve(jsonResponse(patchedRule(overrides)));
  });
}

function renderAdmin() {
  return renderWithQueryClient(
    <ToastProvider>
      <ConfirmProvider>
        <AiMaskingAdmin />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiMaskingAdmin', () => {
  it('renders the rule table with mode badges, patterns and replacements', async () => {
    vi.stubGlobal('fetch', rulesFetch());

    const { container, unmount } = renderAdmin();
    await flushAct();

    const section = container.querySelector('.ai-masking-admin');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('内容脱敏规则');

    const rows = Array.from(section?.querySelectorAll('.ai-masking-table tbody tr') ?? []);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('身份证号脱敏');
    expect(rows[0].textContent).toContain('替换');
    expect(rows[0].textContent).toContain('\\d{17}[0-9X]');
    expect(rows[0].textContent).toContain('[已脱敏]');
    expect(rows[0].querySelector('.ai-masking-mode-badge')?.className).toContain('is-replace');
    expect(rows[1].textContent).toContain('拦截');
    expect(rows[1].querySelector('.ai-masking-mode-badge')?.className).toContain('is-block');

    // Enabled state is reflected on the instant-toggle switch.
    const switches = Array.from(section?.querySelectorAll<HTMLButtonElement>('.ai-masking-switch') ?? []);
    expect(switches[0]?.getAttribute('aria-checked')).toBe('true');
    expect(switches[1]?.getAttribute('aria-checked')).toBe('false');

    unmount();
  });

  it('PATCHes the enabled flag immediately when the switch is toggled', async () => {
    const fetchMock = rulesFetch({ enabled: false });
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderAdmin();
    await flushAct();

    const switches = Array.from(container.querySelectorAll<HTMLButtonElement>('.ai-masking-switch') ?? []);
    switches[0]?.click();
    await flushAct();
    await flushAct();

    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/ai/masking/rules/AMR-1');
    expect(patchCall).toBeDefined();
    expect(patchCall?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });

    unmount();
  });

  it('reflects the toggled state in the UI once the server list refetches (stateful mock)', async () => {
    // 回归:PATCH 响应是 {data:{item}} 包裹;若解包错误会抛错并跳过 invalidate,UI 永不刷新。
    let enabled = true;
    const statefulFetch = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const isGet = !init?.method || init.method === 'GET';
      if (url === '/api/ai/masking/rules' && isGet) {
        return Promise.resolve(jsonResponse({
          data: {
            items: [{
              id: 'AMR-1', name: '身份证号脱敏', mode: 'replace', pattern: 'x', replacement: 'y',
              isRegex: false, caseSensitive: false, enabled, createdAt: null, updatedAt: null,
            }],
          },
        }));
      }
      if (init?.method === 'PATCH') {
        enabled = (JSON.parse(String(init.body)) as { enabled: boolean }).enabled;
      }
      return Promise.resolve(jsonResponse({
        data: {
          item: {
            id: 'AMR-1', name: '身份证号脱敏', mode: 'replace', pattern: 'x', replacement: 'y',
            isRegex: false, caseSensitive: false, enabled, createdAt: null, updatedAt: null,
          },
        },
      }));
    });
    vi.stubGlobal('fetch', statefulFetch);

    const { container, unmount } = renderAdmin();
    await flushAct();

    const switchEl = () => container.querySelector<HTMLButtonElement>('.ai-masking-switch');
    expect(switchEl()?.getAttribute('aria-checked')).toBe('true');

    switchEl()?.click();
    for (let i = 0; i < 6; i += 1) await flushAct();

    expect(enabled).toBe(false);
    expect(switchEl()?.getAttribute('aria-checked')).toBe('false');

    unmount();
  });

  it('opens the create form and POSTs a new replace rule', async () => {
    const fetchMock = rulesFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderAdmin();
    await flushAct();

    const newButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '新建规则');
    expect(newButton).toBeDefined();
    newButton?.click();
    await flushAct();

    const form = container.querySelector('.ai-masking-form') as HTMLFormElement;
    expect(form).not.toBeNull();

    // [name, pattern, replacement] text inputs of the create form.
    const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])'));
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    setInputValue(inputs[0], '手机号脱敏');
    setInputValue(inputs[1], '1\\d{10}');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAct();
    await flushAct();

    const postCall = fetchMock.mock.calls.find((call) =>
      String(call[0]) === '/api/ai/masking/rules' && call[1] && call[1].method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        name: '手机号脱敏',
        mode: 'replace',
        pattern: '1\\d{10}',
        isRegex: false,
        caseSensitive: false,
        enabled: true,
      }),
    });

    unmount();
  });

  it('runs the inline rule tester and renders masked output with matched rules', async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      if (String(input) === '/api/ai/masking/test' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({
          data: {
            masked: '联系电话：[已脱敏]',
            violations: [{ ruleId: 'AMR-1', name: '身份证号脱敏', pattern: '\\d{17}[0-9X]', mode: 'replace' }],
          },
        }));
      }
      return Promise.resolve(jsonResponse(rulesPayload()));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderAdmin();
    await flushAct();

    const textarea = container.querySelector<HTMLTextAreaElement>('.ai-masking-test-input');
    expect(textarea).not.toBeNull();
    setInputValue(textarea!, '联系电话：13800000000');
    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '测试脱敏');
    runButton?.click();
    await flushAct();
    await flushAct();

    const testCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/ai/masking/test');
    expect(testCall).toBeDefined();
    expect(testCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ text: '联系电话：13800000000' }),
    });

    const result = container.querySelector('.ai-masking-test-result');
    expect(result?.textContent).toContain('联系电话：[已脱敏]');
    expect(result?.textContent).toContain('身份证号脱敏');

    unmount();
  });
});

/** React controlled-input update without @testing-library. */
function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
