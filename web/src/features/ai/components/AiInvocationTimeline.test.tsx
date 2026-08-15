import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiInvocationTimeline from './AiInvocationTimeline';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';
import { resetAgentEventSocket } from '../agentEventSocket';
import { setToken } from '../../../services/api';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function minutesAgo(count: number): string {
  return new Date(Date.now() - count * 60000).toISOString();
}

/** Frozen /api/ai/capabilities/invocations/:id contract sample (dsh rc.6). */
function invocationDetailPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'INV-42',
      capabilityId: 'project-snapshot',
      capabilityVersion: '1.0.0',
      status: 'completed',
      projectId: 'PRJ-1',
      actorId: 'user-1',
      errorCode: null,
      createdAt: minutesAgo(3),
      startedAt: minutesAgo(3),
      completedAt: minutesAgo(2),
      events: [
        {
          type: 'assistant/message',
          seq: 3,
          time: minutesAgo(3),
          data: { usage: { inputTokens: 120, outputTokens: 45 } },
        },
        { type: 'tool/call', seq: 7, time: minutesAgo(3), data: { name: 'project_snapshot' } },
        { type: 'tool/call', seq: 8, time: minutesAgo(3), data: { name: 'legacy_probe' } },
        { type: 'turn/end', seq: 12, time: minutesAgo(2), data: { reason: { kind: 'completed' } } },
        { type: 'turn/end', seq: 13, time: minutesAgo(2), data: { reason: { kind: 'error' } } },
        { type: 'harness/future-event', seq: 20, time: minutesAgo(2), data: { mystery: true } },
      ],
      tokenUsage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
      result: { summary: 'ok' },
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetAgentEventSocket();
  setToken(null);
  FakeWebSocket.reset();
});

// ---------------------------------------------------------------------------
// Realtime stream (Sprint 3): a mock WebSocket exposing server-side helpers.
// ---------------------------------------------------------------------------

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static lastInstance(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  readonly url: string;
  readonly protocols: string[];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, protocols: string[] = []) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }

  /** Test-side server actions. */
  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  serverEmit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  sentMessages(): unknown[] {
    return this.sent.map((raw) => JSON.parse(raw));
  }
}

function runningInvocationPayload() {
  return invocationDetailPayload({
    status: 'running',
    events: [
      { type: 'assistant/message', seq: 1, time: minutesAgo(1), data: { usage: { inputTokens: 20, outputTokens: 10 } } },
    ],
    tokenUsage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    result: null,
  });
}

function completedInvocationPayload() {
  return invocationDetailPayload({
    events: [
      { type: 'assistant/message', seq: 1, time: minutesAgo(1), data: { usage: { inputTokens: 120, outputTokens: 45 } } },
      { type: 'tool/call', seq: 2, time: minutesAgo(1), data: { name: 'project_snapshot' } },
      { type: 'turn/end', seq: 3, time: minutesAgo(1), data: { reason: { kind: 'completed' } } },
    ],
  });
}

describe('AiInvocationTimeline', () => {
  it('renders the drawer with summary header, event timeline, usage bar and result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(invocationDetailPayload())));

    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await flushAct();

    const drawer = container.querySelector('.ai-invocation-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute('role')).toBe('dialog');

    // Header summary: mapped status label, capability, invocation id.
    expect(drawer?.textContent).toContain('已完成');
    expect(drawer?.textContent).toContain('project-snapshot');
    expect(drawer?.textContent).toContain('INV-42');

    const events = Array.from(drawer?.querySelectorAll('.ai-invocation-event') ?? []);
    expect(events).toHaveLength(6);

    // turn/end colored by reason kind: completed green, error red.
    const completedRow = events.find((row) => row.textContent?.includes('正常完成'));
    const errorRow = events.find((row) => row.textContent?.includes('执行出错'));
    expect(completedRow?.classList.contains('is-success')).toBe(true);
    expect(errorRow?.classList.contains('is-error')).toBe(true);

    // tool/call highlighted with the tool themed border and friendly names.
    const toolRows = events.filter((row) => row.classList.contains('is-tool'));
    expect(toolRows).toHaveLength(2);
    expect(drawer?.textContent).toContain('读取项目快照');
    expect(drawer?.textContent).toContain('legacy_probe');

    // assistant/message shows the token delta from event usage.
    expect(drawer?.textContent).toContain('输入 120');
    expect(drawer?.textContent).toContain('输出 45');

    // Unknown event types degrade to a generic node with the raw type text.
    const unknownRow = events.find((row) => row.textContent?.includes('harness/future-event'));
    expect(unknownRow).toBeDefined();
    expect(unknownRow?.classList.contains('is-tool')).toBe(false);

    // Token usage summary bar + legend.
    const usage = drawer?.querySelector('.ai-invocation-usage');
    expect(usage?.textContent).toContain('输入 300');
    expect(usage?.textContent).toContain('输出 100');
    expect(usage?.textContent).toContain('合计 400');
    const segments = Array.from(usage?.querySelectorAll('.ai-invocation-usage-segment') ?? []);
    expect(segments).toHaveLength(2);
    expect(segments[0].getAttribute('style')).toContain('75%');

    // Collapsed JSON result preview.
    const result = drawer?.querySelector('.ai-invocation-result');
    expect(result).not.toBeNull();
    expect(result?.querySelector('pre')?.textContent).toContain('"summary"');

    unmount();
  });

  it('renders the empty state without events and zeroes usage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(invocationDetailPayload({
      status: 'running',
      events: [],
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      result: null,
    }))));

    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await flushAct();

    const drawer = container.querySelector('.ai-invocation-drawer');
    expect(drawer?.textContent).toContain('暂无事件记录');
    expect(drawer?.querySelectorAll('.ai-invocation-event')).toHaveLength(0);
    expect(drawer?.querySelector('.ai-invocation-result')).toBeNull();
    expect(drawer?.textContent).toContain('合计 0');

    unmount();
  });

  it('shows a load failure message instead of crashing when the detail request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 500)));

    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await flushAct();

    expect(container.querySelector('.ai-invocation-drawer')).not.toBeNull();
    expect(container.textContent).toContain('执行轨迹读取失败');
    expect(container.querySelectorAll('.ai-invocation-event')).toHaveLength(0);

    unmount();
  });

  it('closes on overlay click and Escape key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(invocationDetailPayload())));

    let closed = 0;
    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => { closed += 1; }} />,
    );
    await flushAct();

    (container.querySelector('.ai-invocation-overlay') as HTMLElement).click();
    expect(closed).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(2);

    unmount();
  });

  it('streams live events over ws, dedupes by seq, finalizes on terminal turn/end and pulls the final detail', async () => {
    setToken('test-token');
    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      fetchCount += 1;
      return jsonResponse(fetchCount === 1 ? runningInvocationPayload() : completedInvocationPayload());
    }));
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await flushAct();
    expect(fetchCount).toBe(1);

    // The stream connection follows the platform ws conventions (/ws path + pm.jwt subprotocol auth).
    const ws = FakeWebSocket.lastInstance();
    expect(ws).toBeDefined();
    expect(ws.url).toContain('/ws/agent');
    expect(ws.protocols).toEqual(['pm.jwt', 'test-token']);

    act(() => ws.serverOpen());
    expect(ws.sentMessages()).toContainEqual({ type: 'agent.subscribe', invocationId: 'INV-42' });
    act(() => ws.serverEmit({ type: 'agent.subscribed', invocationId: 'INV-42' }));
    // Subscribed: the live badge appears.
    expect(container.querySelector('.ai-invocation-live-badge')?.textContent).toContain('实时');

    act(() => {
      // seq 1 duplicates the already-fetched event and must be skipped by seq dedupe.
      ws.serverEmit({
        type: 'agent.event',
        invocationId: 'INV-42',
        event: { type: 'assistant/message', seq: 1, time: minutesAgo(1), data: { usage: { inputTokens: 20, outputTokens: 10 } } },
      });
      ws.serverEmit({
        type: 'agent.event',
        invocationId: 'INV-42',
        event: { type: 'tool/call', seq: 2, time: minutesAgo(1), data: { name: 'project_snapshot' } },
      });
      ws.serverEmit({
        type: 'agent.event',
        invocationId: 'INV-42',
        event: { type: 'turn/end', seq: 3, time: minutesAgo(1), data: { reason: { kind: 'completed' } } },
      });
    });
    await flushAct();

    const drawer = container.querySelector('.ai-invocation-drawer');
    const rows = Array.from(drawer?.querySelectorAll('.ai-invocation-event') ?? []);
    // Distinct seqs 1 (detail) + 2, 3 (live): three merged, seq-ordered rows.
    expect(rows).toHaveLength(3);
    expect(drawer?.textContent).toContain('读取项目快照');
    const turnEndRow = rows.find((row) => row.textContent?.includes('正常完成'));
    expect(turnEndRow?.classList.contains('is-success')).toBe(true);

    // Terminal turn/end: unsubscribe sent, one final detail pull, badge removed, polling stops.
    expect(ws.sentMessages()).toContainEqual({ type: 'agent.unsubscribe', invocationId: 'INV-42' });
    expect(fetchCount).toBe(2);
    expect(drawer?.textContent).toContain('已完成');
    expect(drawer?.textContent).toContain('合计 400');
    expect(container.querySelector('.ai-invocation-live-badge')).toBeNull();

    unmount();
  });

  it('silently falls back to polling when the realtime stream never acks', async () => {
    vi.useFakeTimers();
    setToken('test-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(runningInvocationPayload()));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });

    // Connection created but the server never opens/acks it.
    expect(container.querySelector('.ai-invocation-live-badge')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    // 5s ack budget exhausted: one corner note, no badge, no crash.
    const note = container.querySelector('.ai-invocation-live-note');
    expect(note?.textContent).toContain('实时连接不可用，已回落轮询');
    expect(container.querySelector('.ai-invocation-live-badge')).toBeNull();

    // Polling stays alive in fallback mode: the 8s trace refetch fires again.
    const callsBeforePoll = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforePoll);

    unmount();
  });

  it('falls back silently on agent.error and drops the connection', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(runningInvocationPayload())));
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const { container, unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await flushAct();

    const ws = FakeWebSocket.lastInstance();
    act(() => ws.serverOpen());
    act(() => ws.serverEmit({ type: 'agent.subscribed', invocationId: 'INV-42' }));
    expect(container.querySelector('.ai-invocation-live-badge')).not.toBeNull();

    // Permission errors are fatal for the stream: no retries, just the fallback note.
    act(() => ws.serverEmit({ type: 'agent.error', code: 'PERMISSION_DENIED', message: 'no access' }));
    expect(container.querySelector('.ai-invocation-live-note')?.textContent).toContain('实时连接不可用，已回落轮询');
    expect(container.querySelector('.ai-invocation-live-badge')).toBeNull();
    expect(ws.readyState).toBe(3);

    unmount();
  });

  it('unsubscribes and closes the socket when the drawer unmounts', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(runningInvocationPayload())));
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const { unmount } = renderWithQueryClient(
      <AiInvocationTimeline invocationId="INV-42" onClose={() => {}} />,
    );
    await flushAct();

    const ws = FakeWebSocket.lastInstance();
    act(() => ws.serverOpen());
    expect(ws.sentMessages()).toContainEqual({ type: 'agent.subscribe', invocationId: 'INV-42' });

    unmount();
    expect(ws.sentMessages()).toContainEqual({ type: 'agent.unsubscribe', invocationId: 'INV-42' });
    expect(ws.readyState).toBe(3);
  });
});
