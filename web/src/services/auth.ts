import {
  get,
  post,
  patch,
  getToken,
  setToken,
  getSessionGeneration,
  clearAuthArtifacts,
  setOnSessionExpired,
  SessionSupersededError,
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

function assertCurrentSession(generation: number, tokenAtStart: string | null): void {
  if (getSessionGeneration() !== generation || getToken() !== tokenAtStart) {
    throw new SessionSupersededError();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate with email and password.
 * Stores the JWT token in the api module and caches the user object.
 */
export async function login(email: string, password: string): Promise<SessionUser> {
  // Advancing the generation at attempt start invalidates every request from
  // the previous session, including an older concurrent login attempt.
  setToken(null);
  clearAsyncCache();
  setAsyncCacheUser(null);
  currentUser = null;
  writeUser(null);
  const attemptGeneration = getSessionGeneration();

  const res = await post<ApiResponse<{ token: string; user: SessionUser }>>(
    '/api/auth/login',
    { email, password },
  );
  assertCurrentSession(attemptGeneration, null);
  const { token: jwt, user } = res.data;
  // Token installation advances the generation again and commits the winner.
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
  assertCurrentSession(generation, tokenAtStart);
  currentUser = res.data;
  writeUser(res.data);
  setAsyncCacheUser(res.data?.id ?? null);
  return res.data;
}

export async function fetchCapabilities(): Promise<UserCapabilities> {
  const generation = getSessionGeneration();
  const tokenAtStart = getToken();
  const userIdAtStart = currentUser?.id ?? null;
  const res = await get<ApiResponse<UserCapabilities>>('/api/auth/capabilities');
  assertCurrentSession(generation, tokenAtStart);
  if ((currentUser?.id ?? null) !== userIdAtStart) {
    throw new SessionSupersededError();
  }
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
  const generation = getSessionGeneration();
  const tokenAtStart = getToken();
  const userIdAtStart = currentUser?.id ?? null;
  const res = await patch<ApiResponse<SessionUser>>('/api/auth/me', input);
  assertCurrentSession(generation, tokenAtStart);
  if ((currentUser?.id ?? null) !== userIdAtStart) {
    throw new SessionSupersededError();
  }
  currentUser = res.data;
  writeUser(res.data);
  return res.data;
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

/**
 * Self-service password change. The server revokes every established session
 * (token_version bump) and returns a fresh token for this session only —
 * it replaces the stored token so the user stays signed in here.
 */
export async function changeMyPassword(input: ChangePasswordInput): Promise<SessionUser> {
  const generation = getSessionGeneration();
  const tokenAtStart = getToken();
  const userIdAtStart = currentUser?.id ?? null;
  const res = await post<ApiResponse<{ user: SessionUser; token: string }>>('/api/auth/change-password', input);
  assertCurrentSession(generation, tokenAtStart);
  if ((currentUser?.id ?? null) !== userIdAtStart) {
    throw new SessionSupersededError();
  }
  setToken(res.data.token);
  currentUser = res.data.user;
  writeUser(res.data.user);
  setAsyncCacheUser(res.data.user.id);
  return res.data.user;
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
