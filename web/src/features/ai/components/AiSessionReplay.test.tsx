import { afterEach, describe, expect, it, vi } from 'vitest';
import AiSessionReplay from './AiSessionReplay';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Frozen GET /api/ai/sessions contract sample. */
function sessionsPayload() {
  return {
    data: {
      items: [
        { id: 'SES-100', startedAt: '2026-08-15T02:00:00.000Z', lastEventAt: '2026-08-15T02:05:00.000Z', eventCount: 2 },
        { id: 'SES-101', startedAt: '2026-08-14T08:00:00.000Z', lastEventAt: '2026-08-14T08:01:00.000Z', eventCount: 5 },
      ],
    },
  };
}

/** GET /api/ai/sessions/:id replay detail (same event shape as traces). */
function sessionDetailPayload() {
  return {
    data: {
      id: 'SES-100',
      events: [
        { type: 'tool/call', seq: 1, time: '2026-08-15T02:01:00.000Z', data: { name: 'ui_control' } },
        { type: 'turn/end', seq: 2, time: '2026-08-15T02:05:00.000Z', data: { reason: { kind: 'completed' } } },
      ],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiSessionReplay', () => {
  it('renders the recent session list with event counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url === '/api/ai/sessions?limit=20') return Promise.resolve(jsonResponse(sessionsPayload()));
      return Promise.resolve(jsonResponse(sessionDetailPayload()));
    }));

    const { container, unmount } = renderWithQueryClient(<AiSessionReplay />);
    await flushAct();

    const section = container.querySelector('.ai-session-replay');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('会话回放');

    const items = Array.from(section?.querySelectorAll('.ai-session-item') ?? []);
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('SES-100');
    expect(items[0].textContent).toContain('2 个事件');
    expect(items[1].textContent).toContain('SES-101');
    expect(items[1].textContent).toContain('5 个事件');

    unmount();
  });

  it('expands a session and replays its events through the shared timeline rendering', async () => {
    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url === '/api/ai/sessions?limit=20') return Promise.resolve(jsonResponse(sessionsPayload()));
      if (url === '/api/ai/sessions/SES-100') return Promise.resolve(jsonResponse(sessionDetailPayload()));
      return Promise.resolve(jsonResponse({ data: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderWithQueryClient(<AiSessionReplay />);
    await flushAct();

    const row = container.querySelector<HTMLButtonElement>('.ai-session-item:first-child .ai-session-row');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('aria-expanded')).toBe('false');
    row?.click();
    await flushAct();
    await flushAct();

    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/ai/sessions/SES-100')).toBe(true);

    // The replay uses the same event list markup as the live trace drawer.
    const events = Array.from(container.querySelectorAll('.ai-invocation-event'));
    expect(events).toHaveLength(2);
    // ui_control is translated through the timeline tool-name mapping.
    expect(events[0].textContent).toContain('调整界面');
    expect(events[1].textContent).toContain('正常完成');

    // Collapse again on a second click.
    row?.click();
    await flushAct();
    expect(container.querySelector('.ai-invocation-event')).toBeNull();

    unmount();
  });

  it('shows the empty state when no sessions exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { items: [] } })));

    const { container, unmount } = renderWithQueryClient(<AiSessionReplay />);
    await flushAct();

    expect(container.querySelector('.ai-session-state')?.textContent).toContain('暂无会话记录');

    unmount();
  });
});
