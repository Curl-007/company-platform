import { afterEach, describe, expect, it, vi } from 'vitest';
import AiInteractionCard from './AiInteractionCard';
import { ToastProvider } from '../../../components/common/Toast';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Frozen GET /api/ai/interactions?status=pending contract sample (Sprint 5.1). */
function interactionsPayload(items: Array<Record<string, unknown>>) {
  return { data: { items } };
}

function questionInteraction() {
  return {
    interactionId: 'AII-1',
    kind: 'question',
    status: 'pending',
    invocationId: 'AIC-1',
    projectId: 'PRJ-1',
    actorId: 'USR-1',
    payload: {
      questions: [
        {
          id: 'q1',
          question: '采用哪种交付模板?',
          header: '模板',
          options: [
            { label: '固定交付', description: '标准门禁' },
            { label: '轻量交付', description: '快速通道' },
          ],
        },
      ],
    },
    response: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    expiresAt: '2026-08-14T00:30:00.000Z',
    respondedAt: null,
    respondedBy: null,
  };
}

function approvalInteraction() {
  return {
    interactionId: 'AII-2',
    kind: 'approval',
    status: 'pending',
    invocationId: 'AIC-2',
    projectId: 'PRJ-1',
    actorId: 'USR-1',
    payload: { toolName: 'requirement_create', reason: '创建草稿需求 REQ-9' },
    response: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    expiresAt: '2026-08-14T00:30:00.000Z',
    respondedAt: null,
    respondedBy: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiInteractionCard', () => {
  it('renders the empty state when no interactions are pending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(interactionsPayload([])));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderWithQueryClient(<ToastProvider><AiInteractionCard /></ToastProvider>);
    await flushAct();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/interactions?status=pending');
    expect(container.querySelector('.ai-interaction-card')).not.toBeNull();
    expect(container.querySelector('.ai-interaction-empty')?.textContent)
      .toContain('当前没有等待回复的 AI 提问或审批');
    expect(container.querySelector('.ai-interaction-item')).toBeNull();

    unmount();
  });

  it('answers a pending question with the selected option', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(interactionsPayload([questionInteraction()])))
      .mockResolvedValueOnce(jsonResponse(interactionsPayload([])));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderWithQueryClient(<ToastProvider><AiInteractionCard /></ToastProvider>);
    await flushAct();

    const card = container.querySelector('.ai-interaction-item.is-question');
    expect(card?.textContent).toContain('采用哪种交付模板?');

    // Submit stays disabled until an option (or custom text) is chosen.
    const submit = card?.querySelector<HTMLButtonElement>('.ai-interaction-item-actions .btn-primary');
    expect(submit?.disabled).toBe(true);

    const options = Array.from(card?.querySelectorAll<HTMLButtonElement>('.ai-interaction-option') ?? []);
    expect(options).toHaveLength(2);
    options[1]?.click();
    await flushAct();
    expect(submit?.disabled).toBe(false);

    submit?.click();
    await flushAct();
    await flushAct();

    const respondCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/respond'));
    expect(respondCall).toBeDefined();
    expect(respondCall?.[0]).toBe('/api/ai/interactions/AII-1/respond');
    expect(respondCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ answer: { answers: [{ id: 'q1', selected: ['轻量交付'] }] } }),
    });

    unmount();
  });

  it('approves and rejects a pending approval request', async () => {
    // Approve and reject each get a fresh render: after one decision the
    // pending list refreshes and the card disappears by design.
    for (const decision of ['approve', 'reject'] as const) {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse(interactionsPayload([approvalInteraction()])))
        .mockResolvedValue(jsonResponse(interactionsPayload([])));
      vi.stubGlobal('fetch', fetchMock);

      const { container, unmount } = renderWithQueryClient(<ToastProvider><AiInteractionCard /></ToastProvider>);
      await flushAct();

      const card = container.querySelector('.ai-interaction-item.is-approval');
      expect(card?.textContent).toContain('requirement_create');
      expect(card?.textContent).toContain('批准仅允许该操作本次执行');

      const buttons = Array.from(card?.querySelectorAll<HTMLButtonElement>('.ai-interaction-item-actions .btn') ?? []);
      const target = buttons.find((button) => button.textContent === (decision === 'approve' ? '批准' : '拒绝'));
      expect(target).toBeDefined();
      target?.click();
      await flushAct();
      await flushAct();

      const respondCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/respond'));
      expect(respondCall?.[0]).toBe('/api/ai/interactions/AII-2/respond');
      expect(respondCall?.[1]).toMatchObject({ body: JSON.stringify({ decision }) });

      unmount();
    }
  });

  it('cancels a pending interaction through the initiator-only route', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(interactionsPayload([questionInteraction()])))
      .mockResolvedValue(jsonResponse(interactionsPayload([])));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderWithQueryClient(<ToastProvider><AiInteractionCard /></ToastProvider>);
    await flushAct();

    const cancel = container.querySelector<HTMLButtonElement>('.ai-interaction-cancel-row .btn');
    expect(cancel).not.toBeNull();
    cancel?.click();
    await flushAct();
    await flushAct();

    const cancelCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/cancel'));
    expect(cancelCall?.[0]).toBe('/api/ai/interactions/AII-1/cancel');
    expect(cancelCall?.[1]).toMatchObject({ method: 'POST' });

    unmount();
  });

  it('degrades to the load-failed line when the list endpoint errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 500)));

    const { container, unmount } = renderWithQueryClient(<ToastProvider><AiInteractionCard /></ToastProvider>);
    await flushAct();

    expect(container.querySelector('.ai-interaction-empty')?.textContent).toContain('AI 交互读取失败');
    expect(container.querySelector('.ai-interaction-item')).toBeNull();

    unmount();
  });
});
