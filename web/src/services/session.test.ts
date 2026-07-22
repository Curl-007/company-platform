import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../types';

function user(partial: Partial<SessionUser> & Pick<SessionUser, 'id' | 'name' | 'email' | 'role'>): SessionUser {
  return {
    permissions: [],
    ...partial,
  };
}

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  window.location.hash = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('session expiry and cross-account cache isolation', () => {
  it('clears token, user snapshot, and async cache on 401', async () => {
    // Import after resetModules so api/auth/asyncCache share one registry instance.
    const cache = await import('./asyncCache');
    const { setToken, get } = await import('./api');
    const { setSessionUser, getSessionUser } = await import('./auth');

    cache.clearAsyncCache();
    cache.setAsyncCacheUser(null);

    setToken('stale-token');
    setSessionUser(user({
      id: 'USR-A',
      name: 'User A',
      email: 'a@example.com',
      role: 'dev',
    }));
    cache.setAsyncCacheUser('USR-A');
    cache.setAsyncCacheEntry('USR-A:fetchProjects:[]', [{ id: 'secret-for-A' }]);
    expect(cache.asyncCacheSize()).toBe(1);
    expect(getSessionUser()?.id).toBe('USR-A');

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(get('/api/projects')).rejects.toMatchObject({ status: 401 });

    expect(sessionStorage.getItem('pm.token')).toBeNull();
    expect(sessionStorage.getItem('pm.user')).toBeNull();
    expect(cache.asyncCacheSize()).toBe(0);
    expect(cache.getAsyncCacheUser()).toBe('anon');
    expect(getSessionUser()).toBeNull();
    expect(window.location.hash).toBe('#/login');
  });

  it('does not leak user-A cache into user-B after logout and re-login', async () => {
    const cache = await import('./asyncCache');
    const { setToken } = await import('./api');
    const { login, logout, getSessionUser } = await import('./auth');

    cache.clearAsyncCache();
    cache.setAsyncCacheUser('USR-A');
    cache.setAsyncCacheEntry('USR-A:fetchProjects:[]', [{ id: 'PRJ-A-only' }]);
    setToken('token-a');
    expect(cache.asyncCacheSize()).toBe(1);

    logout();
    expect(getSessionUser()).toBeNull();
    expect(cache.asyncCacheSize()).toBe(0);
    expect(cache.getAsyncCacheUser()).toBe('anon');
    expect(sessionStorage.getItem('pm.token')).toBeNull();

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            token: 'token-b',
            user: user({
              id: 'USR-B',
              name: 'User B',
              email: 'b@example.com',
              role: 'qa',
            }),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const userB = await login('b@example.com', 'secret');
    expect(userB.id).toBe('USR-B');
    expect(cache.getAsyncCacheUser()).toBe('USR-B');
    // Previous account entries were cleared; B starts with an empty namespace.
    expect(cache.asyncCacheSize()).toBe(0);
    expect(getSessionUser()?.id).toBe('USR-B');
    expect(sessionStorage.getItem('pm.token')).toBe('token-b');
  });
});
