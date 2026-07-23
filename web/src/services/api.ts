import type { ApiResponse } from '../types';
import { clearAsyncCache, setAsyncCacheUser } from './asyncCache';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = '';

// ---------------------------------------------------------------------------
// Token management
//
// The token lives in a module-level variable for fast access on every request,
// and is mirrored to sessionStorage so a page refresh keeps the user signed in.
// We use sessionStorage (not localStorage) so the session is scoped to the tab
// and cleared when it closes.
// ---------------------------------------------------------------------------

const TOKEN_STORAGE_KEY = 'pm.token';
const USER_STORAGE_KEY = 'pm.user';

/** Optional hook so auth can clear its in-memory user snapshot on auto-expiry. */
let onSessionExpired: (() => void) | null = null;

/** Register a callback invoked when the session is force-expired (e.g. 401). */
export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Clear token, async cache namespace, and persisted user snapshot.
 * Does not navigate; callers decide whether to redirect.
 */
export function clearAuthArtifacts(): void {
  // setToken bumps sessionGeneration so in-flight 401s from the old session are ignored.
  setToken(null);
  clearAsyncCache();
  setAsyncCacheUser(null);
  try {
    sessionStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  onSessionExpired?.();
}

let token: string | null = readToken();
/** Monotonic session generation — bumped on login/logout so stale 401 cannot wipe a newer session. */
let sessionGeneration = 0;

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToken(value: string | null): void {
  try {
    if (value) sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage may be unavailable (private mode) — degrade gracefully */
  }
}

export function getToken(): string | null {
  return token;
}

/** Current session generation for race guards (getMe / stale 401). */
export function getSessionGeneration(): number {
  return sessionGeneration;
}

export function setToken(value: string | null): void {
  token = value;
  writeToken(value);
  sessionGeneration += 1;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  // Capture generation + token used for this request so a late 401 cannot
  // clear a session established by a concurrent login.
  const requestGeneration = sessionGeneration;
  const requestToken = token;

  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (requestToken) {
    headers['Authorization'] = `Bearer ${requestToken}`;
  }

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options?.timeoutMs ?? 15000);

  const init: RequestInit = {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: controller.signal,
  };

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (networkError) {
    window.clearTimeout(timeout);
    if (networkError instanceof DOMException && networkError.name === 'AbortError') {
      throw new ApiError('请求超时', 0);
    }
    throw new ApiError(
      networkError instanceof Error ? networkError.message : '网络错误',
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }

  // Auto-expire session on 401 only when the failing request still matches the active session.
  if (response.status === 401) {
    if (sessionGeneration === requestGeneration && token === requestToken) {
      clearAuthArtifacts();
      window.location.hash = '#/login';
    }
    throw new ApiError('未授权 - 登录已过期', 401);
  }

  // Parse response body
  let data: unknown;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as Record<string, unknown>).message)
        : `请求失败，状态码 ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Public HTTP methods
// ---------------------------------------------------------------------------

export function get<T>(path: string, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function post<T>(path: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
  return request<T>('POST', path, body, options);
}

export function patch<T>(path: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
  return request<T>('PATCH', path, body, options);
}

export function put<T>(path: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
  return request<T>('PUT', path, body, options);
}

export function del<T>(path: string, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
  return request<T>('DELETE', path, undefined, options);
}

// ---------------------------------------------------------------------------
// Convenience: unwrap ApiResponse<T> to T
// ---------------------------------------------------------------------------

export async function getUnwrapped<T>(path: string): Promise<T> {
  const res = await get<ApiResponse<T>>(path);
  return res.data;
}

export async function postUnwrapped<T>(path: string, body?: unknown): Promise<T> {
  const res = await post<ApiResponse<T>>(path, body);
  return res.data;
}
