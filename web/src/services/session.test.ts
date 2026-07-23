import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../types';

function user(partial: Partial<SessionUser> & Pick<SessionUser, 'id' | 'name' | 'email' | 'role'>): SessionUser {
  return {
    permissions: [],
    ...partial,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
    cache.setAsyncCacheEntry(cache.buildAsyncCacheKey('projects:list'), [{ id: 'secret-for-A' }]);
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
    cache.setAsyncCacheEntry(cache.buildAsyncCacheKey('projects:list'), [{ id: 'PRJ-A-only' }]);
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

  it('lets the newest concurrent login attempt win even when the older response arrives last', async () => {
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    vi.mocked(fetch)
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);

    const { getSessionGeneration, getToken, SessionSupersededError } = await import('./api');
    const { getSessionUser, login } = await import('./auth');
    const generationBefore = getSessionGeneration();

    const firstLogin = login('a@example.com', 'secret-a');
    const generationAfterFirstAttempt = getSessionGeneration();
    const secondLogin = login('b@example.com', 'secret-b');
    const generationAfterSecondAttempt = getSessionGeneration();

    expect(generationAfterFirstAttempt).toBeGreaterThan(generationBefore);
    expect(generationAfterSecondAttempt).toBeGreaterThan(generationAfterFirstAttempt);

    secondResponse.resolve(jsonResponse({
      data: {
        token: 'token-b',
        user: user({ id: 'USR-B', name: 'User B', email: 'b@example.com', role: 'qa' }),
      },
    }));
    await expect(secondLogin).resolves.toMatchObject({ id: 'USR-B' });
    const generationAfterSuccess = getSessionGeneration();
    expect(generationAfterSuccess).toBeGreaterThan(generationAfterSecondAttempt);

    const staleResult = expect(firstLogin).rejects.toBeInstanceOf(SessionSupersededError);
    firstResponse.resolve(jsonResponse({
      data: {
        token: 'token-a',
        user: user({ id: 'USR-A', name: 'User A', email: 'a@example.com', role: 'dev' }),
      },
    }));
    await staleResult;

    expect(getToken()).toBe('token-b');
    expect(getSessionUser()?.id).toBe('USR-B');
    expect(sessionStorage.getItem('pm.user')).toContain('USR-B');
  });

  it('ignores late getMe and capabilities responses from the previous account', async () => {
    const meResponse = deferred<Response>();
    const capabilitiesResponse = deferred<Response>();
    const loginResponse = deferred<Response>();
    vi.mocked(fetch)
      .mockImplementationOnce(() => meResponse.promise)
      .mockImplementationOnce(() => capabilitiesResponse.promise)
      .mockImplementationOnce(() => loginResponse.promise);

    const { setToken, SessionSupersededError } = await import('./api');
    const {
      fetchCapabilities,
      getMe,
      getSessionUser,
      login,
      setSessionUser,
    } = await import('./auth');
    setToken('token-a');
    setSessionUser(user({ id: 'USR-A', name: 'User A', email: 'a@example.com', role: 'dev' }));

    const oldMe = getMe();
    const oldCapabilities = fetchCapabilities();
    const newLogin = login('b@example.com', 'secret-b');

    loginResponse.resolve(jsonResponse({
      data: {
        token: 'token-b',
        user: user({ id: 'USR-B', name: 'User B', email: 'b@example.com', role: 'qa' }),
      },
    }));
    await newLogin;

    const staleMeResult = expect(oldMe).rejects.toBeInstanceOf(SessionSupersededError);
    const staleCapabilitiesResult = expect(oldCapabilities).rejects.toBeInstanceOf(SessionSupersededError);
    meResponse.resolve(jsonResponse({
      data: user({ id: 'USR-A', name: 'Old User A', email: 'a@example.com', role: 'admin' }),
    }));
    capabilitiesResponse.resolve(jsonResponse({
      data: { pages: ['settings'], permissions: ['admin:*'], operations: ['admin:*'] },
    }));
    await staleMeResult;
    await staleCapabilitiesResult;

    expect(getSessionUser()?.id).toBe('USR-B');
    expect(getSessionUser()?.capabilities).toBeUndefined();
    expect(sessionStorage.getItem('pm.user')).toContain('USR-B');
  });

  it('turns a late 401 into a superseded response without expiring the newer session', async () => {
    const staleResponse = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => staleResponse.promise);

    const cache = await import('./asyncCache');
    const { get, getToken, setToken, SessionSupersededError } = await import('./api');
    const { getSessionUser, setSessionUser } = await import('./auth');
    setToken('token-a');
    setSessionUser(user({ id: 'USR-A', name: 'User A', email: 'a@example.com', role: 'dev' }));
    const staleRequest = get('/api/projects');

    setToken('token-b');
    setSessionUser(user({ id: 'USR-B', name: 'User B', email: 'b@example.com', role: 'qa' }));
    cache.setAsyncCacheEntry(cache.buildAsyncCacheKey('projects:list'), [{ id: 'PRJ-B' }]);

    const staleResult = expect(staleRequest).rejects.toBeInstanceOf(SessionSupersededError);
    staleResponse.resolve(jsonResponse({ message: 'unauthorized' }, 401));
    await staleResult;

    expect(getToken()).toBe('token-b');
    expect(getSessionUser()?.id).toBe('USR-B');
    expect(cache.asyncCacheSize()).toBe(1);
    expect(window.location.hash).toBe('');
  });

  it('discards a protected blob body that finishes after the session changes', async () => {
    const blobStarted = deferred<void>();
    const blobBody = deferred<Blob>();
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: () => {
        blobStarted.resolve();
        return blobBody.promise;
      },
    } as Response);

    const { getBlob, setToken, SessionSupersededError } = await import('./api');
    setToken('token-a');
    const request = getBlob('/api/products/PROD-1/images/IMG-1/content');
    await blobStarted.promise;
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer token-a',
    });

    setToken('token-b');
    const staleResult = expect(request).rejects.toBeInstanceOf(SessionSupersededError);
    blobBody.resolve(new Blob(['old-image'], { type: 'image/png' }));
    await staleResult;
  });
});
