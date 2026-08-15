import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAiCapabilityAvailability,
  fetchAiCapabilities,
  invokeAiCapability,
} from './capabilities';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function projectSnapshotManifest() {
  return {
    id: 'project-snapshot',
    version: '1.0.0',
    status: 'approved',
    risk: 'read_only',
    scopes: ['project-management'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId'],
      properties: { projectId: { type: 'string', minLength: 1, maxLength: 128 } },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { summary: { type: 'string' } },
    },
    requiresConfirmation: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI capability BFF client', () => {
  it('keeps capability discovery graceful when the BFF route is not deployed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ message: 'Not found' }, 404),
    ));

    await expect(fetchAiCapabilityAvailability()).resolves.toEqual({
      state: 'unavailable',
      capabilities: [],
    });
  });

  it('normalizes the BFF capability envelope and invokes with the declared input object', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { capabilities: [projectSnapshotManifest()] } }))
      .mockResolvedValueOnce(jsonResponse({
        data: { invocationId: 'AINV-1', jobId: 'AIJOB-1', status: 'queued', capabilityId: 'project-snapshot' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAiCapabilities()).resolves.toMatchObject([{ id: 'project-snapshot' }]);
    await expect(invokeAiCapability('project-snapshot', { projectId: 'PRJ-1' })).resolves.toMatchObject({
      invocationId: 'AINV-1',
      jobId: 'AIJOB-1',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/ai/capabilities',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/ai/capabilities/project-snapshot/invocations',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ projectId: 'PRJ-1' }) }),
    );
  });

  it('accepts a completed invocation record when the BFF has no linked AI Job yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        invocationId: 'AINV-1',
        capability: { id: 'project-snapshot', version: '1.0.0' },
        status: 'completed',
        result: { summary: 'Current project status' },
      },
    })));

    await expect(invokeAiCapability('project-snapshot', { projectId: 'PRJ-1' })).resolves.toEqual({
      invocationId: 'AINV-1',
      capabilityId: 'project-snapshot',
      status: 'completed',
      result: { summary: 'Current project status' },
    });
  });
});
