import { afterEach, describe, expect, it, vi } from 'vitest';
import AiRuntimePanel from './AiRuntimePanel';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Frozen /api/ai/harness/status contract sample (dsh rc.6 + Sprint 3 counters). */
function harnessStatusPayload(runtimeOverrides: Record<string, unknown> = {}) {
  return {
    data: {
      composition: {
        id: 'company-runtime-v1',
        sdkVersion: '0.1.0-rc.6',
        plugins: [
          { id: 'sdk-jsonrpc-server', name: '@deepseek-ai/dsh-sdk-jsonrpc-server', kind: 'builtin' },
          { id: 'company-agent-spine', name: './company-agent-spine.mjs', kind: 'company' },
        ],
      },
      runtime: {
        active: true,
        activeCalls: 7,
        maxRunsPerRuntime: 20,
        queued: 0,
        proxy: { started: true, activeRoutes: 1 },
        ...runtimeOverrides,
      },
      tokenUsageService: true,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiRuntimePanel', () => {
  it('renders composition identity, plugin pipeline and runtime stats', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(harnessStatusPayload())));

    const { container, unmount } = renderWithQueryClient(<AiRuntimePanel />);
    await flushAct();

    const card = container.querySelector('.ai-runtime-card');
    expect(card).not.toBeNull();

    // Composition + SDK version.
    expect(card?.textContent).toContain('company-runtime-v1');
    expect(card?.textContent).toContain('SDK 0.1.0-rc.6');

    // Plugin pipeline: two kinds with their own styling and title hints.
    const plugins = Array.from(card?.querySelectorAll('.ai-runtime-plugin') ?? []);
    expect(plugins).toHaveLength(2);
    expect(plugins[0].classList.contains('is-builtin')).toBe(true);
    expect(plugins[1].classList.contains('is-company')).toBe(true);
    expect(plugins[0].getAttribute('title')).toBe('@deepseek-ai/dsh-sdk-jsonrpc-server');
    expect(plugins[1].getAttribute('title')).toBe('./company-agent-spine.mjs');

    // Runtime reuse counters, queue depth, proxy and token usage service.
    expect(card?.textContent).toContain('复用 7/20');
    expect(card?.textContent).toContain('队列 0');
    expect(card?.textContent).toContain('已启动');
    expect(card?.textContent).toContain('Token 用量');

    // Active runtime renders the breathing dot.
    expect(card?.querySelector('.ai-runtime-dot.is-active')).not.toBeNull();

    unmount();
  });

  it('degrades to a single error line when the status endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 500)));

    const { container, unmount } = renderWithQueryClient(<AiRuntimePanel />);
    await flushAct();

    const error = container.querySelector('.ai-runtime-error');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('AI 底座状态读取失败');
    // The card content never renders in the degraded state.
    expect(container.querySelector('.ai-runtime-card')).toBeNull();
    expect(container.querySelector('.ai-runtime-plugin')).toBeNull();

    unmount();
  });

  it('renders persistent semantics when maxRunsPerRuntime is 0 with totalCalls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(harnessStatusPayload({
      maxRunsPerRuntime: 0,
      totalCalls: 12,
      totalRuns: 3,
    }))));

    const { container, unmount } = renderWithQueryClient(<AiRuntimePanel />);
    await flushAct();

    const card = container.querySelector('.ai-runtime-card');
    expect(card).not.toBeNull();

    // Persistent runtime: cumulative calls instead of N/0 reuse.
    expect(card?.textContent).toContain('累计 12 次调用 · 常驻');
    expect(card?.textContent).not.toContain('复用');

    // Runtime generation ("换血" count) with its tooltip.
    expect(card?.textContent).toContain('第 3 代 runtime');
    const generationStat = Array.from(card?.querySelectorAll('.ai-runtime-stat') ?? [])
      .find((stat) => stat.textContent?.includes('第 3 代 runtime'));
    expect(generationStat?.getAttribute('title')).toBe('runtime 换血次数（累计创建的 runtime 代数）');

    // The persistent stat carries its own tooltip too.
    const persistentStat = Array.from(card?.querySelectorAll('.ai-runtime-stat') ?? [])
      .find((stat) => stat.textContent?.includes('累计 12 次调用'));
    expect(persistentStat?.getAttribute('title')).toBe('常驻运行时：未设置单次复用上限，调用次数跨 runtime 累计');

    unmount();
  });

  it('keeps the legacy reuse line when maxRunsPerRuntime is 0 but totalCalls is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(harnessStatusPayload({
      maxRunsPerRuntime: 0,
      activeCalls: 3,
    }))));

    const { container, unmount } = renderWithQueryClient(<AiRuntimePanel />);
    await flushAct();

    // Old backend without Sprint 3 counters: graceful fallback to the reuse line.
    const card = container.querySelector('.ai-runtime-card');
    expect(card?.textContent).toContain('复用 3/0');
    expect(card?.textContent).not.toContain('常驻');
    expect(card?.textContent).not.toContain('代 runtime');

    unmount();
  });

  it('omits the generation stat when totalRuns is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(harnessStatusPayload({
      totalCalls: 25,
    }))));

    const { container, unmount } = renderWithQueryClient(<AiRuntimePanel />);
    await flushAct();

    const card = container.querySelector('.ai-runtime-card');
    expect(card?.textContent).toContain('复用 7/20');
    expect(card?.textContent).not.toContain('代 runtime');

    unmount();
  });

  it('degrades the same way when the envelope violates the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { runtime: {} } })));

    const { container, unmount } = renderWithQueryClient(<AiRuntimePanel />);
    await flushAct();

    expect(container.querySelector('.ai-runtime-error')).not.toBeNull();
    expect(container.querySelector('.ai-runtime-card')).toBeNull();

    unmount();
  });
});
