import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../types';
import { canOperate } from './roles';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'u-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'admin',
    status: 'active',
    permissions: ['*'],
    ...overrides,
  } as SessionUser;
}

describe('canOperate', () => {
  it('treats an explicit empty operations array as authoritative', () => {
    const current = user({
      capabilities: { role: 'admin', pages: [], permissions: ['*'], operations: [] },
    });

    expect(canOperate(current, 'users:manage')).toBe(false);
    expect(canOperate(current, 'projects:manage')).toBe(false);
  });

  it('uses the explicit server operation list', () => {
    const current = user({
      capabilities: { role: 'admin', pages: [], permissions: [], operations: ['projects:manage'] },
    });

    expect(canOperate(current, 'projects:manage')).toBe(true);
    expect(canOperate(current, 'users:manage')).toBe(false);
  });

  it('falls back to legacy permissions only when operations are absent', () => {
    expect(canOperate(user({ capabilities: undefined }), 'users:manage')).toBe(true);
  });
});
