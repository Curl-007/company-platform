import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAiCapabilityInvocation,
  fetchAiCapabilityInvocations,
  fetchAiHarnessStatus,
} from './harness';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dsh harness client', () => {
  it('normalizes the harness status envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
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
        },
        tokenUsageService: true,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAiHarnessStatus()).resolves.toEqual({
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
      },
      tokenUsageService: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/harness/status', expect.objectContaining({ method: 'GET' }));
  });

  it('rejects a malformed harness envelope with a TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { nope: true } })));
    await expect(fetchAiHarnessStatus()).rejects.toThrow(TypeError);
  });

  it('builds the invocation list query and normalizes items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        items: [{
          id: 'INV-1',
          capabilityId: 'project-snapshot',
          capabilityVersion: '1.0.0',
          status: 'completed',
          projectId: 'PRJ-1',
          actorId: 'user-1',
          errorCode: null,
          createdAt: '2026-08-14T00:00:00.000Z',
          startedAt: '2026-08-14T00:00:01.000Z',
          completedAt: '2026-08-14T00:00:02.000Z',
        }],
        total: 1,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAiCapabilityInvocations({ projectId: 'PRJ-1', limit: 5 })).resolves.toMatchObject({
      total: 1,
      items: [{ id: 'INV-1', capabilityId: 'project-snapshot', status: 'completed' }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/capabilities/invocations?projectId=PRJ-1&limit=5',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('normalizes the invocation detail envelope with events, usage and result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'INV-1',
        capabilityId: 'project-snapshot',
        status: 'completed',
        createdAt: '2026-08-14T00:00:00.000Z',
        events: [
          { type: 'turn/end', seq: 12, time: '2026-08-14T00:00:02.000Z', data: { reason: { kind: 'completed' } } },
          { type: 'harness/future-event', seq: 13, data: null },
        ],
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        result: { summary: 'ok' },
      },
    })));

    await expect(fetchAiCapabilityInvocation('INV-1')).resolves.toMatchObject({
      id: 'INV-1',
      status: 'completed',
      events: [
        { type: 'turn/end', seq: 12, data: { reason: { kind: 'completed' } } },
        { type: 'harness/future-event', seq: 13, data: null },
      ],
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      result: { summary: 'ok' },
    });
  });
});
