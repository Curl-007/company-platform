import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInvocationTrace, type InvocationTraceState, type SubscribeAgentEvents } from './useInvocationTrace';
import type { AgentEventSubscriptionHandlers } from '../agentEventSocket';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

// ---------------------------------------------------------------------------
// Hook-level coverage for useInvocationTrace: subscribe/merge/finalize flows
// with an injected subscription (same injection style as the AgentEventSocket
// socketFactory tests; no global WebSocket stub needed here).
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function minutesAgo(count: number): string {
  return new Date(Date.now() - count * 60000).toISOString();
}

function detailPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'INV-42',
      capabilityId: 'project-snapshot',
      capabilityVersion: '1.0.0',
      status: 'running',
      createdAt: minutesAgo(1),
      events: [
        { type: 'assistant/message', seq: 1, time: minutesAgo(1), data: { usage: { inputTokens: 20, outputTokens: 10 } } },
      ],
      tokenUsage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      result: null,
      ...overrides,
    },
  };
}

function completedPayload() {
  return detailPayload({
    status: 'completed',
    events: [
      { type: 'assistant/message', seq: 1, time: minutesAgo(1), data: { usage: { inputTokens: 20, outputTokens: 10 } } },
      { type: 'turn/end', seq: 3, time: minutesAgo(1), data: { reason: { kind: 'completed' } } },
    ],
    tokenUsage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
    result: { summary: 'ok' },
  });
}

/** Captures the latest hook state during render (probe component pattern). */
const state: { current: InvocationTraceState | null } = { current: null };

function TraceProbe({ invocationId, subscribe }: {
  invocationId: string;
  subscribe: SubscribeAgentEvents;
}) {
  state.current = useInvocationTrace({ invocationId, subscribe });
  return null;
}

interface SubscriptionHarness {
  invocationId: string | null;
  handlers: AgentEventSubscriptionHandlers | null;
  unsubscribed: number;
}

function createSubscribeHarness(): { subscribe: SubscribeAgentEvents; harness: SubscriptionHarness } {
  const harness: SubscriptionHarness = {
    invocationId: null,
    handlers: null,
    unsubscribed: 0,
  };
  const subscribe: SubscribeAgentEvents = (invocationId, handlers) => {
    harness.invocationId = invocationId;
    harness.handlers = handlers;
    return () => { harness.unsubscribed += 1; };
  };
  return { subscribe, harness };
}

afterEach(() => {
  vi.unstubAllGlobals();
  state.current = null;
});

describe('useInvocationTrace', () => {
  it('subscribes while running, merges live events by seq and reports the live mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(detailPayload())));
    const { subscribe, harness } = createSubscribeHarness();

    const { unmount } = renderWithQueryClient(<TraceProbe invocationId="INV-42" subscribe={subscribe} />);
    await flushAct();

    // Polled detail first: one event, invocation still running.
    expect(state.current?.invocationRunning).toBe(true);
    expect(state.current?.liveMode).toBe('connecting');
    expect(state.current?.events.map((event) => event.seq)).toEqual([1]);

    // Ack flips the mode to live.
    act(() => harness.handlers?.onSubscribed?.());
    expect(state.current?.liveMode).toBe('live');

    // A duplicate seq is dropped; a new seq appends in order.
    act(() => {
      harness.handlers?.onEvent({ type: 'assistant/message', seq: 1, time: minutesAgo(1), data: null });
      harness.handlers?.onEvent({ type: 'tool/call', seq: 2, time: minutesAgo(1), data: { name: 'project_snapshot' } });
    });
    expect(state.current?.events.map((event) => event.seq)).toEqual([1, 2]);
    expect(state.current?.events[1].category).toBe('tool-call');

    unmount();
    expect(harness.unsubscribed).toBe(1);
  });

  it('finalizes on terminal turn/end: unsubscribes, pulls the final detail and stops streaming', async () => {
    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      fetchCount += 1;
      return jsonResponse(fetchCount === 1 ? detailPayload() : completedPayload());
    }));
    const { subscribe, harness } = createSubscribeHarness();

    const { unmount } = renderWithQueryClient(<TraceProbe invocationId="INV-42" subscribe={subscribe} />);
    await flushAct();
    expect(fetchCount).toBe(1);
    expect(state.current?.streamFinalized).toBe(false);

    act(() => harness.handlers?.onSubscribed?.());
    act(() => {
      harness.handlers?.onEvent({ type: 'turn/end', seq: 3, time: minutesAgo(1), data: { reason: { kind: 'completed' } } });
    });
    await flushAct();

    // Terminal event: stream finalized + unsubscribed (idempotent unsubscribe;
    // the effect cleanup re-calls it once polling observes the terminal status),
    // one final detail pull.
    expect(state.current?.streamFinalized).toBe(true);
    expect(state.current?.liveMode).toBe('off');
    expect(harness.unsubscribed).toBeGreaterThanOrEqual(1);
    expect(fetchCount).toBe(2);
    expect(state.current?.detail?.status).toBe('completed');
    expect(state.current?.invocationRunning).toBe(false);
    // Final payload events replace the partial trace (merged by seq against live events).
    expect(state.current?.events.map((event) => event.seq)).toEqual([1, 3]);

    unmount();
  });

  it('degrades to polling when the stream errors and keeps the polled events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(detailPayload())));
    const { subscribe, harness } = createSubscribeHarness();

    const { unmount } = renderWithQueryClient(<TraceProbe invocationId="INV-42" subscribe={subscribe} />);
    await flushAct();

    act(() => harness.handlers?.onError({ code: 'AGENT_ERROR', message: 'boom' }));
    expect(state.current?.liveMode).toBe('fallback');
    expect(state.current?.streamFinalized).toBe(false);
    expect(state.current?.invocationRunning).toBe(true);
    expect(state.current?.events.map((event) => event.seq)).toEqual([1]);

    unmount();
  });

  it('never subscribes for an already-terminal invocation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(completedPayload())));
    const { subscribe } = createSubscribeHarness();
    const subscribeSpy = vi.fn(subscribe);

    const { unmount } = renderWithQueryClient(<TraceProbe invocationId="INV-42" subscribe={subscribeSpy} />);
    await flushAct();

    expect(state.current?.invocationRunning).toBe(false);
    expect(state.current?.liveMode).toBe('off');
    expect(subscribeSpy).not.toHaveBeenCalled();

    unmount();
  });
});
