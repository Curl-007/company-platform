import type { ApiResponse } from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = '';

// ---------------------------------------------------------------------------
// Token management (module-level, NOT localStorage)
// ---------------------------------------------------------------------------

let token: string | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
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
  options?: { headers?: Record<string, string> },
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

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
      throw new ApiError('Request timed out', 0);
    }
    throw new ApiError(
      networkError instanceof Error ? networkError.message : 'Network error',
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }

  // Auto-redirect on 401
  if (response.status === 401) {
    token = null;
    window.location.hash = '#/login';
    throw new ApiError('Unauthorized - session expired', 401);
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
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Public HTTP methods
// ---------------------------------------------------------------------------

export function get<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function post<T>(path: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
  return request<T>('POST', path, body, options);
}

export function patch<T>(path: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
  return request<T>('PATCH', path, body, options);
}

export function del<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> {
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
