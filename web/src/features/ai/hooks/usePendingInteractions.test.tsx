import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { usePendingInteractions } from './usePendingInteractions';
import type { AgentUiSubscriptionHandlers } from '../agentEventSocket';
import { ToastProvider } from '../../../components/common/Toast';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Frozen GET /api/ai/interactions?status=pending contract sample (Sprint 5.1). */
function interactionsPayload(count: number) {
  return {
    data: {
      items: Array.from({ length: count }, (_, index) => ({
        interactionId: `AII-${index + 1}`,
        kind: 'question',
        status: 'pending',
        invocationId: 'AIC-1',
        projectId: 'PRJ-1',
        actorId: 'USR-1',
        payload: {
          questions: [{ id: 'q1', question: `问题 ${index + 1}?` }],
        },
        response: null,
        createdAt: '2026-08-14T00:00:00.000Z',
        expiresAt: '2026-08-14T00:30:00.000Z',
        respondedAt: null,
        respondedBy: null,
      })),
    },
  };
}

let captured: AgentUiSubscriptionHandlers | null = null;

function Probe() {
  const { pending, pendingCount } = usePendingInteractions({
    subscribeInteractions: (handlers) => {
      captured = handlers;
      return () => { captured = null; };
    },
  });
  return <div data-testid="count">{`${pendingCount}:${pending.length}`}</div>;
}

function renderProbe() {
  return renderWithQueryClient(<ToastProvider><Probe /></ToastProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  captured = null;
});

describe('usePendingInteractions', () => {
  it('resolves a 403 answer to an empty list instead of an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'forbidden' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderProbe();
    await flushAct();
    await flushAct();

    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('0:0');
    unmount();
  });

  it('exposes the pending count and stays quiet when it does not rise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(interactionsPayload(1)));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderProbe();
    await flushAct();
    await flushAct();

    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('1:1');
    expect(document.querySelector('.toast')).toBeNull();

    unmount();
  });

  it('accelerates via agent.interaction pushes and toasts when the count rises', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(interactionsPayload(1)))
      .mockResolvedValueOnce(jsonResponse(interactionsPayload(3)));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderProbe();
    await flushAct();
    await flushAct();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // ws push → invalidate → immediate refetch with more pending items.
    await act(async () => {
      captured?.onInteraction?.({ invocationId: 'AIC-1', interaction: null });
    });
    await flushAct();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('3:3');
    expect(document.querySelector('.toast')?.textContent)
      .toContain('AI 有 3 项待处理交互');

    unmount();
  });

  it('does not toast on the initial load even with pending items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(interactionsPayload(2)));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderProbe();
    await flushAct();
    await flushAct();

    expect(document.querySelector('.toast')).toBeNull();

    unmount();
  });
});
