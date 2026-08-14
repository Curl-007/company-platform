import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../../types';
import {
  hasAuthoritativeMyWorkOperations,
  isMyWorkActionEligible,
} from './myWorkEligibility';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'USR-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'qa',
    status: 'active',
    permissions: ['*'],
    ...overrides,
  } as SessionUser;
}

describe('My Work action eligibility', () => {
  it('does not let a legacy QA role bypass an explicit empty operation list', () => {
    const current = user({
      capabilities: { role: 'qa', pages: ['mywork'], permissions: ['*'], operations: [] },
    });

    expect(hasAuthoritativeMyWorkOperations(current)).toBe(true);
    expect(isMyWorkActionEligible(current, 'defectHandoff', true)).toBe(false);
    expect(isMyWorkActionEligible(current, 'taskHandoff', true)).toBe(false);
  });

  it('uses the explicitly granted operation even when a legacy role rule would not match', () => {
    const current = user({
      role: 'pdm',
      capabilities: { role: 'pdm', pages: ['mywork'], permissions: [], operations: ['projects:manage'] },
    });

    expect(isMyWorkActionEligible(current, 'taskHandoff', false)).toBe(true);
    expect(isMyWorkActionEligible(current, 'defectHandoff', false)).toBe(false);
  });

  it('preserves legacy eligibility when the server has not supplied operations', () => {
    const current = user({ capabilities: undefined });

    expect(hasAuthoritativeMyWorkOperations(current)).toBe(false);
    expect(isMyWorkActionEligible(current, 'defectHandoff', true)).toBe(true);
    expect(isMyWorkActionEligible(current, 'taskHandoff', false)).toBe(false);
  });
});
