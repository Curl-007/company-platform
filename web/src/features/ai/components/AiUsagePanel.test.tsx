import { afterEach, describe, expect, it, vi } from 'vitest';
import AiUsagePanel from './AiUsagePanel';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';
import type { Project } from '../../../types';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Frozen /api/ai/usage/summary contract sample (Sprint 1.2 + 5.3 byDay). */
function usagePayload() {
  return {
    data: {
      total: { invocations: 3, promptTokens: 310, completionTokens: 205, totalTokens: 515 },
      byCapability: [
        {
          capabilityId: 'project-snapshot',
          capabilityVersion: '1.0.0',
          invocations: 2,
          promptTokens: 300,
          completionTokens: 200,
          totalTokens: 500,
        },
        {
          capabilityId: 'risk-digest',
          capabilityVersion: '1.1.0',
          invocations: 1,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      ],
      byDay: [
        { date: '2026-08-13', invocations: 1, promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        { date: '2026-08-14', invocations: 2, promptTokens: 210, completionTokens: 155, totalTokens: 365 },
      ],
    },
  };
}

const PROJECTS: Project[] = [
  { id: 'PRJ-1', name: 'Apollo' },
  { id: 'PRJ-2', name: 'Borealis' },
] as unknown as Project[];

function renderPanel(projectId = '') {
  const onProjectChange = vi.fn();
  const result = renderWithQueryClient(
    <AiUsagePanel projects={PROJECTS} projectId={projectId} onProjectChange={onProjectChange} />,
  );
  return { ...result, onProjectChange };
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiUsagePanel', () => {
  it('renders the capability summary table with token totals', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(usagePayload())));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderPanel();
    await flushAct();

    const card = container.querySelector('.ai-usage-card');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('AI 用量看板');
    expect(card?.textContent).toContain('3 次调用 · 515 tokens');

    const rows = Array.from(card?.querySelectorAll('.ai-usage-table tbody tr') ?? []);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('project-snapshot');
    expect(rows[0].textContent).toContain('v1.0.0');
    expect(rows[0].textContent).toContain('500');
    expect(rows[1].textContent).toContain('risk-digest');

    // Default view: capability grouping, last-7-days window, no project scope.
    const [url] = requestedUrls(fetchMock);
    expect(url).toContain('/api/ai/usage/summary?');
    expect(url).toContain('groupBy=capability');
    expect(url).toContain('from=');
    expect(url).not.toContain('projectId=');

    unmount();
  });

  it('switches to the by-day view and renders CSS bars', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(usagePayload())));
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = renderPanel();
    await flushAct();

    const dayToggle = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === '按日');
    expect(dayToggle).toBeDefined();
    dayToggle?.click();
    await flushAct();

    expect(container.querySelector('.ai-usage-table')).toBeNull();
    const days = Array.from(container.querySelectorAll('.ai-usage-day') ?? []);
    expect(days).toHaveLength(2);
    expect(days[0].textContent).toContain('2026-08-13');
    expect(days[0].textContent).toContain('1 次');
    const fills = Array.from(container.querySelectorAll('.ai-usage-day-fill'));
    expect(fills).toHaveLength(2);
    // 365 is the peak day: the earlier day is scaled to ~41% of it.
    expect(fills[0].getAttribute('style')).toContain('width: 41');
    expect(fills[1].getAttribute('style')).toContain('width: 100%');
    expect(container.querySelector('.ai-usage-note')?.textContent).toContain('近 30 天');

    const urls = requestedUrls(fetchMock);
    expect(urls[urls.length - 1]).toContain('groupBy=day');
    expect(urls[urls.length - 1]).toContain('from=');

    unmount();
  });

  it('shows the empty state when no usage matches the filters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { total: { invocations: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }, byCapability: [] },
    })));

    const { container, unmount } = renderPanel();
    await flushAct();

    const state = container.querySelector('.ai-usage-state');
    expect(state).not.toBeNull();
    expect(state?.textContent).toContain('暂无 AI 用量记录');
    expect(container.querySelector('.ai-usage-table')).toBeNull();

    unmount();
  });

  it('passes the shared project scope and time range through to the query', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(usagePayload())));
    vi.stubGlobal('fetch', fetchMock);

    // Shared workspace project scope flows into the query string.
    const scoped = renderPanel('PRJ-1');
    await flushAct();
    expect(requestedUrls(fetchMock)[0]).toContain('projectId=PRJ-1');
    scoped.unmount();

    // Unscoped default keeps the 7-day window; widening to "all" drops `from`.
    const all = renderWithQueryClient(
      <AiUsagePanel projects={PROJECTS} projectId="" onProjectChange={() => {}} />,
    );
    await flushAct();
    const baseline = requestedUrls(fetchMock).at(-1) ?? '';
    expect(baseline).not.toContain('projectId=');
    expect(baseline).toContain('from=');

    const rangeSelect = all.container.querySelector<HTMLSelectElement>('select[aria-label="时间范围"]');
    expect(rangeSelect).not.toBeNull();
    rangeSelect!.value = 'all';
    rangeSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAct();
    expect(requestedUrls(fetchMock).at(-1)).not.toContain('from=');

    all.unmount();
  });
});
