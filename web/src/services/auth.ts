import { get, post, getToken, setToken } from './api';
import type { SessionUser, ApiResponse } from '../types';

// ---------------------------------------------------------------------------
// Module-level cached user reference
// ---------------------------------------------------------------------------

let currentUser: SessionUser | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate with email and password.
 * Stores the JWT token in the api module and caches the user object.
 */
export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await post<ApiResponse<{ token: string; user: SessionUser }>>(
    '/api/auth/login',
    { email, password },
  );
  const { token: jwt, user } = res.data;
  setToken(jwt);
  currentUser = user;
  return user;
}

/**
 * Fetch the currently authenticated user from the server.
 * Also updates the cached user reference.
 */
export async function getMe(): Promise<SessionUser> {
  const res = await get<ApiResponse<SessionUser>>('/api/auth/me');
  currentUser = res.data;
  return res.data;
}

/**
 * Clear authentication state and redirect to login.
 */
export function logout(): void {
  setToken(null);
  currentUser = null;
  window.location.hash = '#/login';
}

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
}

/**
 * Re-export token helpers from api.ts for convenience.
 */
export { getToken, setToken };
