import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setToken } from '../../services/api';
import { fetchAuditLogs } from './api';

beforeEach(() => {
  sessionStorage.clear();
  setToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  setToken(null);
});

describe('fetchAuditLogs', () => {
  it('preserves audit visibility scope fields from the API contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'AUD-1',
                actorId: 'USR-1',
                actorName: 'Auditor',
                action: 'project.update',
                resourceType: 'project',
                resourceId: 'PRJ-1',
                scopeType: 'project',
                projectId: 'PRJ-1',
                subjectUserId: null,
                createdAt: '2026-07-23T00:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(fetchAuditLogs()).resolves.toEqual([
      expect.objectContaining({
        id: 'AUD-1',
        scopeType: 'project',
        projectId: 'PRJ-1',
        subjectUserId: null,
      }),
    ]);
  });

  it('maps snake_case scope fields and defaults legacy records to global', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'AUD-2',
                actor_name: 'Auditor',
                action: 'user.update',
                resource_type: 'user',
                scope_type: 'user',
                subject_user_id: 'USR-2',
                created_at: '2026-07-23T00:00:00.000Z',
              },
              {
                id: 'AUD-3',
                actor_name: 'System',
                action: 'system.start',
                resource_type: 'system',
                created_at: '2026-07-23T00:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const records = await fetchAuditLogs();

    expect(records[0]).toEqual(expect.objectContaining({ scopeType: 'user', subjectUserId: 'USR-2' }));
    expect(records[1]).toEqual(expect.objectContaining({ scopeType: 'global', projectId: null, subjectUserId: null }));
  });
});
