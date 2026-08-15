import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { useCapabilityRunner, type CapabilityRunner } from './useCapabilityRunner';
import type { AiCapabilityInvocation, AiCapabilityManifest } from '../../../types';
import { queryClient } from '../../../lib/queryClient';
import { ToastProvider } from '../../../components/common/Toast';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const capability: AiCapabilityManifest = {
  id: 'project-snapshot',
  version: '1.0.0',
  status: 'approved',
  risk: 'read_only',
  scopes: ['project'],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['projectId'],
    properties: { projectId: { type: 'string', minLength: 1 } },
  },
  outputSchema: { type: 'object', additionalProperties: false, properties: {} },
  requiresConfirmation: false,
};

const onInvocationQueued = vi.fn();
const onSummaryChanged = vi.fn();
let runner: CapabilityRunner | null = null;

function Probe() {
  runner = useCapabilityRunner({ onInvocationQueued, onSummaryChanged });
  return (
    <div>
      <div data-testid="invoking">{runner.invokingCapabilityId ?? 'none'}</div>
      <div data-testid="latest">{runner.latestInvocation?.invocationId ?? 'none'}</div>
      <div data-testid="scope">{runner.invocationProjectId || 'none'}</div>
      <div data-testid="timeline">{runner.timelineInvocationId ?? 'none'}</div>
      <button
        type="button"
        data-testid="invoke"
        onClick={() => { void runner?.invokeCapability(capability, { projectId: 'PRJ-1' }); }}
      >
        run
      </button>
    </div>
  );
}

function renderProbe() {
  return renderWithQueryClient(<ToastProvider><Probe /></ToastProvider>);
}

beforeEach(() => {
  onInvocationQueued.mockClear();
  onSummaryChanged.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  runner = null;
});

describe('useCapabilityRunner', () => {
  it('walks the success path: invoking → recorded invocation → scope + callbacks', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve());

    const { container, unmount } = renderProbe();
    await flushAct();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="invoke"]')?.click();
    });
    expect(container.querySelector('[data-testid="invoking"]')?.textContent).toBe('project-snapshot');

    resolveFetch(jsonResponse({
      data: { invocationId: 'INV-9', jobId: 'JOB-9', status: 'queued', capabilityId: 'project-snapshot' },
    }));
    await flushAct();
    await flushAct();

    expect(container.querySelector('[data-testid="invoking"]')?.textContent).toBe('none');
    expect(container.querySelector('[data-testid="latest"]')?.textContent).toBe('INV-9');
    // Project scope follows the invocation input (drives tray + usage panel).
    expect(container.querySelector('[data-testid="scope"]')?.textContent).toBe('PRJ-1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/capabilities/project-snapshot/invocations');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai', 'invocations'] });
    expect(onInvocationQueued).toHaveBeenCalledTimes(1);
    const queued = onInvocationQueued.mock.calls[0]?.[0] as AiCapabilityInvocation;
    expect(queued.jobId).toBe('JOB-9');
    expect(onSummaryChanged).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.toast')?.textContent).toContain('已将批准工具作为 AI 任务启动');

    unmount();
    invalidateSpy.mockRestore();
  });

  it('degrades to an error toast and resets state when the invoke fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve());

    const { container, unmount } = renderProbe();
    await flushAct();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="invoke"]')?.click();
    });
    await flushAct();
    await flushAct();

    expect(container.querySelector('[data-testid="invoking"]')?.textContent).toBe('none');
    expect(container.querySelector('[data-testid="latest"]')?.textContent).toBe('none');
    expect(onInvocationQueued).not.toHaveBeenCalled();
    expect(onSummaryChanged).not.toHaveBeenCalled();
    expect(document.querySelector('.toast')?.textContent).toContain('无法启动批准工具');

    unmount();
    vi.spyOn(queryClient, 'invalidateQueries').mockRestore();
  });

  it('tracks the trace drawer target and clears the latest invocation', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container, unmount } = renderProbe();
    await flushAct();

    await act(async () => {
      runner?.openInvocationTrace('INV-42');
    });
    expect(container.querySelector('[data-testid="timeline"]')?.textContent).toBe('INV-42');

    await act(async () => {
      runner?.setTimelineInvocationId(null);
    });
    expect(container.querySelector('[data-testid="timeline"]')?.textContent).toBe('none');

    unmount();
  });
});
