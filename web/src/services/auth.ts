import {
  get,
  post,
  patch,
  getToken,
  setToken,
  getSessionGeneration,
  clearAuthArtifacts,
  setOnSessionExpired,
} from './api';
import { clearAsyncCache, setAsyncCacheUser } from './asyncCache';
import type { SessionUser, UserCapabilities, ApiResponse } from '../types';

// ---------------------------------------------------------------------------
// Cached user reference
//
// Mirrored to sessionStorage so a refresh restores the session. The token is
// persisted in api.ts; both must be present for a session to be considered
// valid (see App.tsx's `!user || !getToken()` guard).
// ---------------------------------------------------------------------------

const USER_STORAGE_KEY = 'pm.user';

function readUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeUser(user: SessionUser | null): void {
  try {
    if (user) sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    /* storage unavailable — degrade gracefully */
  }
}

let currentUser: SessionUser | null = readUser();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate with email and password.
 * Stores the JWT token in the api module and caches the user object.
 */
export async function login(email: string, password: string): Promise<SessionUser> {
  // Drop residual cache/snapshot; setToken later bumps session generation so
  // in-flight 401/getMe from a previous session cannot clobber the new one.
  clearAsyncCache();
  setAsyncCacheUser(null);
  currentUser = null;
  writeUser(null);

  const res = await post<ApiResponse<{ token: string; user: SessionUser }>>(
    '/api/auth/login',
    { email, password },
  );
  const { token: jwt, user } = res.data;
  setToken(jwt);
  currentUser = user;
  writeUser(user);
  setAsyncCacheUser(user?.id ?? null);
  return user;
}

/**
 * Fetch the currently authenticated user from the server.
 * Also updates the cached user reference (skipped if session generation changed mid-flight).
 */
export async function getMe(): Promise<SessionUser> {
  const generation = getSessionGeneration();
  const tokenAtStart = getToken();
  const res = await get<ApiResponse<SessionUser>>('/api/auth/me');
  if (getSessionGeneration() !== generation || getToken() !== tokenAtStart) {
    // A concurrent login/logout won; do not clobber the newer session snapshot.
    return res.data;
  }
  currentUser = res.data;
  writeUser(res.data);
  setAsyncCacheUser(res.data?.id ?? null);
  return res.data;
}

export async function fetchCapabilities(): Promise<UserCapabilities> {
  const res = await get<ApiResponse<UserCapabilities>>('/api/auth/capabilities');
  const user = currentUser;
  if (user) {
    currentUser = { ...user, capabilities: res.data };
    writeUser(currentUser);
  }
  return res.data;
}

export interface UpdateProfileInput {
  name: string;
  email: string;
  phone?: string;
  position?: string;
  department?: string;
  bio?: string;
}

export async function updateMyProfile(input: UpdateProfileInput): Promise<SessionUser> {
  const res = await patch<ApiResponse<SessionUser>>('/api/auth/me', input);
  currentUser = res.data;
  writeUser(res.data);
  return res.data;
}

/**
 * Clear token, user snapshot, and async data cache.
 * Used by explicit logout and automatic 401 session expiry.
 */
export function expireSession(options: { redirect?: boolean } = {}): void {
  currentUser = null;
  writeUser(null);
  clearAuthArtifacts();
  if (options.redirect !== false) {
    window.location.hash = '#/login';
  }
}

/**
 * Clear authentication state and redirect to login.
 */
export function logout(): void {
  expireSession({ redirect: true });
}

// Keep in-memory user in sync when api auto-expires on 401.
setOnSessionExpired(() => {
  currentUser = null;
});

/**
 * Return the cached user object, or null if not authenticated.
 */
export function getSessionUser(): SessionUser | null {
  return currentUser;
}

/**
 * Set the cached user object (used after restoring session).
 */
export function setSessionUser(user: SessionUser | null): void {
  currentUser = user;
  writeUser(user);
  setAsyncCacheUser(user?.id ?? null);
}

// Keep cache namespace aligned with restored session on first load.
setAsyncCacheUser(currentUser?.id ?? null);

/**
 * Re-export token helpers from api.ts for convenience.
 */
export { getToken, setToken };
